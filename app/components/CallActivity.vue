<script setup lang="ts">
import { formatEther } from 'viem'
import { truncateAddress } from '~~/shared/address'
import type { WireActivity } from '~~/shared/wire'

defineProps<{ activity: WireActivity }>()

function eth(value: string): string {
  return `${formatEther(BigInt(value))} ETH`
}
</script>

<template>
  <section>
    <ul v-if="activity.kind === 'flat'" class="list">
      <li v-for="(call, index) in activity.calls" :key="index" data-test="call" class="call">
        <span class="kind">{{ call.kind }}</span>
        <code>{{ truncateAddress(call.from) }}</code>
        <span class="arrow">→</span>
        <code>{{ call.to ? truncateAddress(call.to) : 'contract creation' }}</code>
        <span v-if="call.value !== '0'" class="value">{{ eth(call.value) }}</span>
        <span v-if="call.error" class="error">{{ call.error }}</span>
      </li>
    </ul>

    <p v-else class="empty">
      No internal call data. This source only exposes event logs for this
      transaction, so calls that moved no tokens are invisible here.
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
}
.call {
  display: flex;
  flex-wrap: wrap;
  gap: 1ch;
  align-items: baseline;
  background: var(--bg);
  padding: 0.5rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.kind {
  color: var(--text-faint);
  min-width: 11ch;
}
.arrow {
  color: var(--text-faint);
}
.value {
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
</style>
