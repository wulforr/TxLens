<script setup lang="ts">
import type { NarrativePart } from '~~/shared/format'
import { usdText } from '~~/shared/steps'

defineProps<{
  part: NarrativePart & { kind: 'amount' }
  usd?: number | null
  size?: number
  /** Say so when there's no price, instead of leaving the reader to wonder. */
  showMissingPrice?: boolean
}>()
</script>

<template>
  <!--
    nowrap: a number must never be split from its token. The {{ ' ' }} gaps
    are for screen readers ("2,336.94 01", not "2,336.9401"); flex layout
    ignores them, so nothing moves on screen.
  -->
  <span class="amount">
    <span class="value">{{ part.value }}</span>{{ ' ' }}
    <TokenBadge class="token" :symbol="part.symbol" :icon-url="part.iconUrl" :size="size ?? 16" />{{ ' ' }}
    <span v-if="part.raw" class="raw">raw units</span>{{ ' ' }}
    <span v-if="usd != null" class="usd">{{ usdText(usd) }}</span>
    <span v-else-if="showMissingPrice && !part.raw" class="usd">no known price</span>
  </span>
</template>

<style scoped>
.amount {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.4ch;
}
.value {
  font-variant-numeric: tabular-nums;
}
/* The symbol sits in a pill so it can't be read as more digits. */
.token {
  padding: 0.1em 0.55em 0.1em 0.25em;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-raised);
  font-size: 0.82em;
}
.raw {
  font-size: 0.7em;
  color: var(--warn);
}
.usd {
  font-size: 0.78em;
  color: var(--text-dim);
  font-weight: 400;
}
</style>
