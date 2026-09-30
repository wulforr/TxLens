<script setup lang="ts">
import { computed } from 'vue'
import { truncateAddress } from '~~/shared/address'

const props = defineProps<{ type: string; value: string }>()

/**
 * Calldata blobs and encoded tuples run to many kilobytes. Rendered in full
 * they bury everything below them — on a real aggregator swap the internal
 * calls and events end up several screens down, past a wall of hex.
 *
 * Long values collapse behind a summary. Nothing is hidden: the full value is
 * one click away and the exact length is stated, so the reader knows what they
 * are choosing not to look at.
 */
const PREVIEW_CHARS = 96
const COLLAPSE_OVER = 160

const display = computed(() =>
  props.type === 'address' ? truncateAddress(props.value) : props.value,
)
const isLong = computed(() => display.value.length > COLLAPSE_OVER)
const preview = computed(() => `${display.value.slice(0, PREVIEW_CHARS)}…`)
const formattedLength = computed(() => display.value.length.toLocaleString('en-US'))
</script>

<template>
  <details v-if="isLong" class="long">
    <summary :aria-label="`${type} value, ${formattedLength} characters. Expand to show it.`">
      <code>{{ preview }}</code>
      <span class="meta">{{ formattedLength }} characters</span>
    </summary>
    <code class="full">{{ display }}</code>
  </details>
  <code v-else>{{ display }}</code>
</template>

<style scoped>
.long summary {
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 1ch;
}
.long summary code {
  overflow-wrap: anywhere;
}
.meta {
  color: var(--text-faint);
  font-size: 0.75rem;
  white-space: nowrap;
}
.full {
  display: block;
  margin-top: 0.5rem;
  max-height: 16rem;
  overflow: auto;
  overflow-wrap: anywhere;
  padding: 0.5rem;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  font-size: 0.75rem;
}
</style>
