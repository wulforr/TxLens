<script setup lang="ts">
import { formatEther } from 'viem'
import { computed, ref } from 'vue'
import type { Participant } from '~~/shared/steps'
import type { WireActivity } from '~~/shared/wire'

const props = defineProps<{ activity: WireActivity; people?: Record<string, Participant> }>()

const LIMIT = 10
const expanded = ref(false)
const calls = computed(() => (props.activity.kind === 'flat' ? props.activity.calls : []))
const visible = computed(() => (expanded.value ? calls.value : calls.value.slice(0, LIMIT)))

function eth(value: string): string {
  return `${formatEther(BigInt(value))} ETH`
}
</script>

<template>
  <section>
    <template v-if="activity.kind === 'flat'">
      <ul class="list">
        <li v-for="(call, index) in visible" :key="index" data-test="call" class="call">
          <span class="kind">{{ call.kind }}</span>
          <Party :party="people?.[call.from]" :address="call.from" />
          <Icon class="arrow" name="arrow" :size="12" />
          <Party v-if="call.to" :party="people?.[call.to]" :address="call.to" />
          <span v-else>new contract</span>
          <span v-if="call.value !== '0'" class="value">{{ eth(call.value) }}</span>
          <span v-if="call.error" class="error">{{ call.error }}</span>
        </li>
      </ul>
      <button
        v-if="calls.length > LIMIT"
        type="button"
        class="more"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Show fewer' : `Show all ${calls.length} internal calls` }}
      </button>
    </template>

    <p v-else class="empty">
      No internal call data. This source only exposes event logs for this transaction, so
      calls that moved no tokens are invisible here.
    </p>
  </section>
</template>

<style scoped>
.list {
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
.call {
  display: flex;
  flex-wrap: wrap;
  gap: 1ch;
  align-items: center;
  background: var(--bg);
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
}
.kind {
  font-family: var(--font-mono);
  color: var(--text-faint);
  min-width: 13ch;
}
.arrow {
  color: var(--text-faint);
}
.value {
  font-family: var(--font-mono);
  color: var(--accent);
  margin-left: auto;
}
.error {
  color: var(--bad);
}
.empty {
  color: var(--text-dim);
  font-size: 0.875rem;
  max-width: 60ch;
}
.more {
  margin-top: 0.75rem;
}
</style>
