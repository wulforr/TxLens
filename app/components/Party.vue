<script setup lang="ts">
import { computed } from 'vue'
import { truncateAddress } from '~~/shared/address'
import { PARTY_HUES, type Participant } from '~~/shared/steps'

const props = defineProps<{ party?: Participant; address: string }>()

const hue = computed(() =>
  props.party?.tone === undefined ? null : PARTY_HUES[props.party.tone % PARTY_HUES.length],
)
</script>

<template>
  <span class="party" :data-role="party?.role" :title="address">
    <span
      v-if="party?.role !== 'zero'"
      class="dot"
      :style="hue === null ? undefined : { '--hue': hue }"
      aria-hidden="true"
    />
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
  /* Unlabelled addresses (no tone) stay neutral. */
  background: var(--text-faint);
}
.dot[style] {
  background: hsl(var(--hue) 70% 64%);
  flex: none;
  transform: translateY(-0.05em);
}
.party[data-role='sender'] .dot {
  background: var(--accent);
}
</style>
