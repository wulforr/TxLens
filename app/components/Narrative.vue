<script setup lang="ts">
import type { Narrative } from '~~/server/narrate/types'

defineProps<{ narrative: Narrative }>()
</script>

<template>
  <section class="narrative">
    <h1 :aria-label="narrative.headline">
      <template v-if="narrative.parts?.length">
        <template v-for="(part, index) in narrative.parts" :key="index">
          <template v-if="part.kind === 'text'">{{ part.text }}</template>
          <!-- nowrap: a number must never be split from its token -->
          <span v-else class="amount" :title="part.address ?? part.symbol">
            <span>{{ part.value }}</span>
            <TokenBadge class="token" :symbol="part.symbol" :icon-url="part.iconUrl" :size="20" />
            <span v-if="part.raw" class="raw">raw units</span>
          </span>
        </template>
      </template>
      <template v-else>{{ narrative.headline }}</template>
    </h1>
    <ul v-if="narrative.details.length" class="details">
      <li v-for="detail in narrative.details" :key="detail">{{ detail }}</li>
    </ul>
    <p v-if="narrative.confidence === 'low'" class="caution" role="status">
      Read from incomplete data, so this summary may be wrong.
    </p>
  </section>
</template>

<style scoped>
.narrative {
  margin-bottom: 2.5rem;
}
h1 {
  font-size: 1.45rem;
  font-weight: 500;
  line-height: 1.6;
  margin: 0;
  max-width: 34ch;
  font-variant-numeric: tabular-nums;
}
.amount {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.4ch;
}
/* The symbol sits in a pill so it can't be read as more digits. */
.token {
  padding: 0.1em 0.5em 0.1em 0.25em;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-raised);
  font-size: 0.8em;
}
.raw {
  font-size: 0.55em;
  color: var(--warn);
}
.details {
  list-style: none;
  margin: 0.85rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.details li {
  color: var(--text-dim);
  font-size: 0.875rem;
  max-width: 62ch;
}
.caution {
  color: var(--warn);
  font-size: 0.8rem;
  margin: 0.85rem 0 0;
}
</style>
