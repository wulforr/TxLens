<script setup lang="ts">
import { computed } from 'vue'
import { truncateAddress } from '~~/shared/address'
import { PARTY_TONES, type Participant } from '~~/shared/steps'

const props = defineProps<{
  party?: Participant
  address: string
  /** Add what kind of thing this is, e.g. "(an exchange)". For a first mention. */
  describe?: boolean
}>()

const tone = computed(() =>
  props.party?.tone === undefined ? null : PARTY_TONES[props.party.tone % PARTY_TONES.length],
)

const SHORT: Record<string, string> = {
  exchange: 'an exchange',
  lending: 'a lending service',
  bridge: 'a bridge between blockchains',
  staking: 'a staking service',
  company: 'a crypto exchange company',
}
const note = computed(() => {
  if (!props.describe || !props.party) return null
  if (props.party.flagged) return 'labelled as linked to a hack'
  return props.party.kind ? (SHORT[props.party.kind] ?? null) : null
})
</script>

<template>
  <span class="party" :data-role="party?.role">
    <span
      v-if="party?.role !== 'zero'"
      class="dot"
      :style="tone ? { '--hue': tone.hue, '--light': `${tone.light}%` } : undefined"
      aria-hidden="true"
    />
    <span class="label">{{ party?.label ?? truncateAddress(address) }}</span>
    <span v-if="note" class="note" :data-flagged="party?.flagged || undefined"> ({{ note }})</span>
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
  flex: none;
  transform: translateY(-0.05em);
  /* Unlabelled addresses (no tone) stay neutral. */
  background: var(--text-faint);
}
.dot[style] {
  background: hsl(var(--hue) 70% var(--light));
}
.party[data-role='sender'] .dot {
  background: var(--accent);
}
.note {
  font-weight: 400;
  color: var(--text-dim);
}
.note[data-flagged] {
  color: var(--warn);
}
</style>
