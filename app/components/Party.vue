<script setup lang="ts">
import { computed } from 'vue'
import { truncateAddress } from '~~/shared/address'
import type { Participant } from '~~/shared/steps'

const props = defineProps<{ party?: Participant; address: string }>()

/** A stable hue per address, so the same participant carries the same mark everywhere. */
const hue = computed(() => {
  let h = 0
  for (const c of props.address.slice(2, 12)) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
})
</script>

<template>
  <span class="party" :data-role="party?.role" :title="address">
    <span v-if="party?.role !== 'zero'" class="dot" :style="{ '--hue': hue }" aria-hidden="true" />
    <span class="label">{{ party?.label ?? truncateAddress(address) }}</span>
  </span>
</template>

<style scoped>
.party {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45ch;
  font-weight: 500;
  color: var(--text);
}
.dot {
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  background: hsl(var(--hue) 55% 62%);
  flex: none;
  transform: translateY(-0.05em);
}
.party[data-role='sender'] .dot {
  background: var(--accent);
}
</style>
