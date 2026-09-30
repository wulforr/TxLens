<script setup lang="ts">
import { computed } from 'vue'
import type { TraceProvenance } from '~~/shared/types'

const props = defineProps<{ provenance: TraceProvenance }>()

const COPY: Record<TraceProvenance, { label: string; detail: string; tone: string }> = {
  callTracer: {
    label: 'full trace',
    detail: 'every internal call, read from a node',
    tone: 'good',
  },
  internalTransactions: {
    label: 'internal transactions',
    detail: 'flat call list, no nesting',
    tone: 'partial',
  },
  logsOnly: {
    label: 'logs only',
    detail: 'no call data available for this transaction',
    tone: 'degraded',
  },
}

const copy = computed(() => COPY[props.provenance])
</script>

<template>
  <span class="chip" :data-tone="copy.tone" :title="copy.detail">
    <span class="dot" />
    {{ copy.label }}
    <span class="detail">{{ copy.detail }}</span>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 0.5ch;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 2px;
  color: var(--text-dim);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tone);
  align-self: center;
}
.chip[data-tone='good'] {
  --tone: var(--ok);
}
.chip[data-tone='partial'] {
  --tone: var(--warn);
}
.chip[data-tone='degraded'] {
  --tone: var(--bad);
}
.detail {
  color: var(--text-faint);
}
</style>
