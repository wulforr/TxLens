<script setup lang="ts">
import type { Narrative } from '~~/server/narrate/types'

defineProps<{ narrative: Narrative }>()
</script>

<template>
  <section class="narrative">
    <h1>{{ narrative.headline }}</h1>
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
  line-height: 1.3;
  margin: 0;
  max-width: 34ch;
  font-variant-numeric: tabular-nums;
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
