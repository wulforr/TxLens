<script setup lang="ts">
import type { Narrative } from '~~/server/narrate/types'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { partUsd } from '~~/shared/steps'

withDefaults(
  defineProps<{
    narrative: Narrative
    tokens?: Record<string, TokenMeta>
    prices?: Record<string, number>
  }>(),
  { tokens: () => ({}), prices: () => ({}) },
)
</script>

<template>
  <section class="narrative">
    <h1 :aria-label="narrative.headline">
      <template v-if="narrative.parts?.length">
        <template v-for="(part, index) in narrative.parts" :key="index">
          <template v-if="part.kind === 'text'">{{ part.text }}</template>
          <AmountChip v-else :part="part" :usd="partUsd(part, tokens, prices)" :size="20" />
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
h1 {
  font-size: clamp(1.4rem, 1.1rem + 1.4vw, 1.9rem);
  font-weight: 560;
  line-height: 1.55;
  letter-spacing: -0.015em;
  margin: 0;
  max-width: 30ch;
  text-wrap: balance;
}
.details {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.details li {
  color: var(--text-dim);
  font-size: 0.925rem;
  max-width: 64ch;
}
.caution {
  color: var(--warn);
  font-size: 0.85rem;
  margin: 1rem 0 0;
}
</style>
