<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatLogArg, formatUnits } from '~~/shared/format'
import { groupEvents, type Participant } from '~~/shared/steps'
import type { TxPayload } from '~~/shared/wire'

const props = defineProps<{ data: TxPayload; people: Record<string, Participant> }>()

const LIMIT = 10
const allGroups = ref(false)
const groups = computed(() => groupEvents(props.data.logs))
const visibleGroups = computed(() =>
  allGroups.value ? groups.value : groups.value.slice(0, LIMIT),
)

const gasUsed = computed(() => BigInt(props.data.gasUsed).toLocaleString('en-US'))
const gasPrice = computed(() => `${formatUnits(BigInt(props.data.effectiveGasPrice), 9)} gwei`)
const blockNumber = computed(() => BigInt(props.data.blockNumber).toLocaleString('en-US'))
</script>

<template>
  <details class="technical">
    <summary>
      <span class="title">Technical details</span>
      <span class="hint">the raw calls and events, for developers</span>
    </summary>

    <dl class="facts">
      <dt>Data source</dt>
      <dd><ProvenanceChip :provenance="data.provenance" /></dd>
      <dt>Block</dt>
      <dd><code>{{ blockNumber }}</code></dd>
      <dt>Contract called</dt>
      <dd>
        <Party v-if="data.to" :party="people[data.to]" :address="data.to" />
        <span v-else>None — this transaction created a new contract</span>
      </dd>
      <dt>Gas used</dt>
      <dd><code>{{ gasUsed }}</code></dd>
      <dt>Gas price</dt>
      <dd><code>{{ gasPrice }}</code></dd>
    </dl>

    <h3>Function called</h3>
    <CallRow :call="data.call" :target="data.to" :tokens="data.tokens" />

    <h3>Internal calls</h3>
    <p v-if="data.coverage.calls === 'truncated'" class="partial" role="status">
      More internal calls than the source returns in one read. Showing the first
      {{ data.activity.kind === 'flat' ? data.activity.calls.length : 0 }}.
    </p>
    <p v-else-if="data.coverage.calls === 'unavailable'" class="partial" role="status">
      The internal-call data could not be fetched. This is a failed request, not an empty
      result — the transaction may well have internal calls.
    </p>
    <CallActivity
      :activity="data.activity"
      :people="people"
      :complete="data.coverage.calls === 'complete'"
    />

    <h3>Events <span class="count">{{ data.logs.length }}</span></h3>
    <p v-if="data.coverage.logs === 'truncated'" class="partial" role="status">
      This transaction has more events than the source will return in one read. Showing the
      first {{ data.logs.length }}.
    </p>
    <p v-else-if="data.coverage.logs === 'unavailable'" class="partial" role="status">
      Event data could not be fetched.
    </p>
    <p v-if="data.logs.length === 0 && data.coverage.logs === 'complete'" class="empty">
      This transaction emitted no events.
    </p>
    <ul v-else class="events">
      <li v-for="group in visibleGroups" :key="group.key">
        <details>
          <summary>
            <span v-if="group.items.length > 1" class="times">{{ group.items.length }}×</span>
            <span class="event">{{ group.eventName ?? 'Unrecognised event' }}</span>
            <span class="from">from <Party :party="people[group.address]" :address="group.address" /></span>
          </summary>
          <div v-for="log in group.items" :key="log.logIndex" class="log">
            <p v-if="log.confidence === 'raw'" class="muted">
              The contract that emitted this hasn’t published its code, so its contents can’t be read.
            </p>
            <dl v-else class="args">
              <template v-for="arg in log.args" :key="arg.name">
                <dt>{{ arg.name }}</dt>
                <dd>
                  <code v-if="formatLogArg(log.address, arg, data.tokens)">{{
                    formatLogArg(log.address, arg, data.tokens)
                  }}</code>
                  <Party v-else-if="arg.type === 'address' && people[arg.value.toLowerCase()]"
                         :party="people[arg.value.toLowerCase()]" :address="arg.value.toLowerCase()" />
                  <ArgValue v-else :type="arg.type" :value="arg.value" />
                </dd>
              </template>
            </dl>
          </div>
        </details>
      </li>
    </ul>
    <button
      v-if="groups.length > LIMIT"
      type="button"
      class="more"
      :aria-expanded="allGroups"
      @click="allGroups = !allGroups"
    >
      {{ allGroups ? 'Show fewer' : `Show all ${groups.length} event groups` }}
    </button>
  </details>
</template>

<style scoped>
.technical {
  border-top: 1px solid var(--line);
  padding-top: 1.25rem;
}
.technical > summary {
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
}
.title {
  font-weight: 500;
}
.technical > summary {
  padding: 0.4rem 0;
}
.technical > summary:hover .title,
.technical > summary:focus-visible .title {
  color: var(--accent);
}
.hint {
  font-size: 0.85rem;
  color: var(--text-faint);
}
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.45rem 2rem;
  margin: 1.5rem 0 0;
}
dt {
  color: var(--text-dim);
  font-size: 0.85rem;
}
dd {
  margin: 0;
  font-size: 0.85rem;
  min-width: 0;
}
h3 {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 2.25rem 0 0.75rem;
}
.count {
  color: var(--text-faint);
}
.partial {
  color: var(--warn);
  font-size: 0.8rem;
  margin: 0 0 0.75rem;
  max-width: 62ch;
}
.empty,
.muted {
  color: var(--text-dim);
  font-size: 0.85rem;
}
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.events li {
  background: var(--bg);
}
.events summary {
  cursor: pointer;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5ch 1ch;
  align-items: baseline;
  font-size: 0.85rem;
}
.times {
  font-family: var(--font-mono);
  color: var(--text-dim);
}
.event {
  font-family: var(--font-mono);
  color: var(--accent);
}
.from {
  color: var(--text-dim);
}
.log {
  padding: 0.25rem 0.75rem 0.75rem 1.5rem;
  border-top: 1px solid var(--line);
}
.args {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.2rem 1.5rem;
  margin: 0.5rem 0 0;
}
.more {
  margin-top: 0.75rem;
}
</style>
