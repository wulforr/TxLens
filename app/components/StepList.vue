<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Participant, Step } from '~~/shared/steps'

const props = defineProps<{
  steps: Step[]
  people: Record<string, Participant>
  sender?: string
}>()

/**
 * What the sender paid and got is the story; the hops between services in the
 * middle are how it happened. Lead with the first and fold the second behind a
 * button, unless the sender is in no step at all (then every step is the story).
 */
const isOwn = (step: Step) => {
  const sender = props.sender?.toLowerCase()
  return step.from.toLowerCase() === sender || step.to.toLowerCase() === sender
}
const own = computed(() => props.steps.filter(isOwn))
const handoffs = computed(() => props.steps.length - own.value.length)
const showHandoffs = ref(false)
const foldable = computed(() => own.value.length > 0 && handoffs.value > 0)
const shown = computed(() => (foldable.value && !showHandoffs.value ? own.value : props.steps))

/** Enough to tell most stories; the rest is one click away, never hidden. */
const LIMIT = 12
const expanded = ref(false)
const visible = computed(() => (expanded.value ? shown.value : shown.value.slice(0, LIMIT)))

/** Where each participant is first mentioned: only there does it say what it is. */
const firstMention = computed(() => {
  const seen = new Map<string, string>()
  visible.value.forEach((step, index) => {
    const slots: [string, string][] = [
      ['from', step.from],
      ['to', step.to],
      ...step.via.map((a): [string, string] => ['via', a]),
    ]
    for (const [slot, address] of slots)
      if (!seen.has(address)) seen.set(address, `${index}:${slot}`)
  })
  return seen
})
const first = (index: number, slot: string, address: string) =>
  firstMention.value.get(address) === `${index}:${slot}`
</script>

<template>
  <div>
    <ol class="steps">
      <li
        v-for="(step, index) in visible"
        :key="index"
        :class="{ handoff: foldable && showHandoffs && !isOwn(step) }"
      >
        <span class="n" aria-hidden="true">{{ index + 1 }}</span>
        <p>
          <template v-if="step.kind === 'mint'">
            <AmountChip :part="step.amount as never" :usd="step.usd" /> was newly created and given
            to <Party :party="people[step.to]" :address="step.to" :describe="first(index, 'to', step.to)" />
          </template>
          <template v-else-if="step.kind === 'burn'">
            <Party :party="people[step.from]" :address="step.from" :describe="first(index, 'from', step.from)" /> destroyed
            <AmountChip :part="step.amount as never" :usd="step.usd" />
          </template>
          <template v-else>
            <Party :party="people[step.from]" :address="step.from" :describe="first(index, 'from', step.from)" /> sent
            <AmountChip :part="step.amount as never" :usd="step.usd" /> to
            <Party :party="people[step.to]" :address="step.to" :describe="first(index, 'to', step.to)" />
          </template>
          <span v-if="step.via.length" class="via">
            passing through
            <template v-for="(address, i) in step.via" :key="address">
              <template v-if="i > 0">, </template>
              <Party :party="people[address]" :address="address" :describe="first(index, 'via', address)" />
            </template>
          </span>
        </p>
      </li>
    </ol>
    <button
      v-if="foldable"
      type="button"
      class="more"
      :aria-expanded="showHandoffs"
      @click="showHandoffs = !showHandoffs"
    >
      {{
        showHandoffs
          ? 'Show only the sender’s own steps'
          : `Show how it got there (${handoffs} ${handoffs === 1 ? 'handoff' : 'handoffs'} between services)`
      }}
    </button>
    <button
      v-if="shown.length > LIMIT"
      type="button"
      class="more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show fewer steps' : `Show all ${shown.length} steps` }}
    </button>
  </div>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}
li {
  display: grid;
  grid-template-columns: 1.75rem 1fr;
  align-items: baseline;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--line);
}
/* A hop between services: part of how it happened, not what happened. */
li.handoff p {
  font-size: 0.925em;
  opacity: 0.8;
}
li:last-child {
  border-bottom: 0;
}
.n {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-faint);
}
p {
  margin: 0;
  line-height: 1.9;
  color: var(--text-dim);
}
.via {
  display: block;
  font-size: 0.85rem;
  line-height: 1.5;
}
.more {
  margin: 0.75rem 0.5rem 0 0;
}
</style>
