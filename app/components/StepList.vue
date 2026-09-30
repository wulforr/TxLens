<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Participant, Step } from '~~/shared/steps'

const props = defineProps<{ steps: Step[]; people: Record<string, Participant> }>()

/** Enough to tell most stories; the rest is one click away, never hidden. */
const LIMIT = 12
const expanded = ref(false)
const visible = computed(() => (expanded.value ? props.steps : props.steps.slice(0, LIMIT)))

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
      <li v-for="(step, index) in visible" :key="index">
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
      v-if="steps.length > LIMIT"
      type="button"
      class="more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show fewer steps' : `Show all ${steps.length} steps` }}
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
  margin-top: 0.75rem;
}
</style>
