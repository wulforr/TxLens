<script setup lang="ts">
import { formatEther } from 'viem'
import { truncateAddress } from '~~/shared/address'
import type { TxPayload } from '~~/shared/wire'

const route = useRoute()
const chain = route.params.chain as string
const hash = route.params.hash as string

const { data, error, pending } = await useFetch<TxPayload>(`/api/tx/${chain}/${hash}`)

function eth(value: string): string {
  return `${formatEther(BigInt(value))} ETH`
}
</script>

<template>
  <div>
    <p v-if="pending">Decoding…</p>

    <div v-else-if="error" class="failed" role="alert">
      <h1>Could not decode this transaction</h1>
      <p>{{ error.statusMessage ?? 'Something went wrong upstream.' }}</p>
      <NuxtLink to="/">Try another hash</NuxtLink>
    </div>

    <article v-else-if="data">
      <header class="summary">
        <code class="hash">{{ data.hash }}</code>
        <div class="meta">
          <span :data-status="data.status">{{ data.status }}</span>
          <ProvenanceChip :provenance="data.provenance" />
        </div>
        <p v-if="data.revertReason" class="revert">Reverted: {{ data.revertReason }}</p>
      </header>

      <dl class="facts">
        <dt>From</dt>
        <dd><code>{{ truncateAddress(data.from) }}</code></dd>
        <dt>To</dt>
        <dd><code>{{ data.to ? truncateAddress(data.to) : 'contract creation' }}</code></dd>
        <dt>Value</dt>
        <dd>{{ eth(data.value) }}</dd>
        <dt>Fee</dt>
        <dd>{{ eth(data.feeWei) }}</dd>
        <dt>Gas used</dt>
        <dd>{{ data.gasUsed }}</dd>
      </dl>

      <h2>Call</h2>
      <CallRow :call="data.call" />

      <h2>Internal calls</h2>
      <p v-if="data.coverage.calls === 'truncated'" class="partial" role="status">
        More internal calls than the source returns in one read. Showing the first
        {{ data.activity.kind === 'flat' ? data.activity.calls.length : 0 }}.
      </p>
      <p v-else-if="data.coverage.calls === 'unavailable'" class="partial" role="status">
        The internal-call data could not be fetched. This is a failed request, not an
        empty result — the transaction may well have internal calls.
      </p>
      <CallActivity :activity="data.activity" />

      <h2>Events <span class="count">{{ data.logs.length }}</span></h2>
      <p v-if="data.coverage.logs === 'truncated'" class="partial" role="status">
        This transaction has more events than the source will return in one read.
        Showing the first {{ data.logs.length }}.
      </p>
      <p v-else-if="data.coverage.logs === 'unavailable'" class="partial" role="status">
        Event data could not be fetched.
      </p>
      <ul class="logs">
        <li v-for="log in data.logs" :key="log.logIndex">
          <span class="event">{{ log.eventName ?? 'unknown event' }}</span>
          <span class="from">{{ log.contractName ?? truncateAddress(log.address) }}</span>
          <span v-if="log.confidence === 'raw'" class="flag">could not decode</span>
          <dl v-else class="args">
            <template v-for="arg in log.args" :key="arg.name">
              <dt>{{ arg.name }}</dt>
              <dd><ArgValue :type="arg.type" :value="arg.value" /></dd>
            </template>
          </dl>
        </li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.summary {
  border-bottom: 1px solid var(--line);
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}
.hash {
  font-size: 0.8rem;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}
[data-status='success'] {
  color: var(--ok);
}
[data-status='reverted'] {
  color: var(--bad);
}
.revert {
  color: var(--bad);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 2rem;
  margin: 0 0 2.5rem;
}
dt {
  color: var(--text-dim);
  font-size: 0.85rem;
}
dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
h2 {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 2.5rem 0 0.75rem;
}
.count {
  color: var(--text-faint);
}
.logs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
}
.logs li {
  background: var(--bg);
  padding: 0.6rem 0.75rem;
  font-size: 0.8rem;
}
.event {
  font-family: var(--font-mono);
  color: var(--accent);
  margin-right: 1ch;
}
.from {
  color: var(--text-dim);
}
.flag {
  color: var(--warn);
  margin-left: 1ch;
}
.args {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 1.5rem;
  margin: 0.4rem 0 0;
}
.partial {
  color: var(--warn);
  font-size: 0.8rem;
  margin: 0 0 0.75rem;
  max-width: 62ch;
}
.failed h1 {
  font-size: 1.1rem;
}
</style>
