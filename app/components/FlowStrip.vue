<script setup lang="ts">
import { computed } from 'vue'
import type { Participant, Step } from '~~/shared/steps'

const props = defineProps<{
  steps: Step[]
  people: Record<string, Participant>
  sender: string
}>()

/**
 * The whole transaction at a glance: what the sender put in, who it went
 * through, and what came back. Built only from the sender's own steps, so it
 * says nothing the step list doesn't. When the sender is in no step at all
 * there is no honest single line to draw, and the strip stays away.
 */
const flow = computed(() => {
  const sender = props.sender.toLowerCase()
  const outs = props.steps.filter(
    (s) => s.from.toLowerCase() === sender && s.to.toLowerCase() !== sender,
  )
  const ins = props.steps.filter(
    (s) => s.to.toLowerCase() === sender && s.from.toLowerCase() !== sender,
  )
  if (outs.length === 0 && ins.length === 0) return null

  const middle: string[] = []
  const add = (address: string) => {
    const a = address.toLowerCase()
    if (a !== sender && !middle.includes(a) && props.people[a]?.role !== 'zero') middle.push(a)
  }
  for (const s of outs) add(s.to)
  for (const s of props.steps)
    if (!outs.includes(s) && !ins.includes(s)) [s.from, ...s.via, s.to].forEach(add)
  for (const s of ins) add(s.from)

  return {
    outs,
    ins,
    shown: middle.slice(0, 2),
    more: Math.max(0, middle.length - 2),
    // A mint has no source worth drawing: new tokens come from nowhere.
    minted: ins.length > 0 && ins.every((s) => s.kind === 'mint'),
  }
})
</script>

<template>
  <figure v-if="flow" class="strip" aria-label="The transaction at a glance">
    <template v-if="flow.outs.length">
      <span class="node"><Party :party="people[sender.toLowerCase()]" :address="sender" /></span>
      <span class="link">
        <span class="amounts">
          <AmountChip v-for="(s, i) in flow.outs" :key="i" :part="s.amount as never" />
        </span>
        <span class="line" aria-hidden="true" />
      </span>
    </template>
    <span v-if="flow.shown.length && !flow.minted" class="node middle">
      <Party v-for="address in flow.shown" :key="address" :party="people[address]" :address="address" />
      <span v-if="flow.more" class="more">and {{ flow.more }} more</span>
    </span>
    <span v-else-if="flow.minted" class="node middle created">newly created</span>
    <template v-if="flow.ins.length">
      <span class="link">
        <span class="amounts">
          <AmountChip v-for="(s, i) in flow.ins" :key="i" :part="s.amount as never" />
        </span>
        <span class="line" aria-hidden="true" />
      </span>
      <span class="node"><Party :party="people[sender.toLowerCase()]" :address="sender" /></span>
    </template>
  </figure>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  margin: 2rem 0 0;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-raised);
  font-size: 0.9rem;
}
.node {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  white-space: nowrap;
}
.middle {
  display: grid;
  gap: 0.15rem;
  border-radius: 14px;
  color: var(--text-dim);
}
.created {
  color: var(--text-dim);
  font-style: italic;
}
.more {
  padding-left: 1em;
  font-size: 0.85em;
  color: var(--text-faint);
}
.link {
  /* Never narrower than its amounts; the middle names give way instead. */
  flex: 1 0 auto;
  min-width: 6rem;
  display: grid;
  gap: 0.3rem;
  padding: 0 0.6rem;
  font-size: 0.85rem;
}
.amounts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 0.8rem;
}
/* A drawn arrow: a hairline ending in a chevron, pointing the way value moved. */
.line {
  position: relative;
  height: 1px;
  background: var(--text-faint);
}
.line::after {
  content: '';
  position: absolute;
  right: 0;
  top: -3px;
  width: 7px;
  height: 7px;
  border-top: 1px solid var(--text-faint);
  border-right: 1px solid var(--text-faint);
  transform: rotate(45deg);
}
/* Phones: top to bottom, arrows pointing down. */
@media (max-width: 720px) {
  .strip {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .link {
    flex: none;
    min-width: 0;
    grid-template-columns: 1px auto;
    align-items: center;
    gap: 0 0.9rem;
    padding: 0.2rem 0 0.2rem 1rem;
  }
  .amounts {
    order: 2;
    justify-content: flex-start;
  }
  .line {
    order: 1;
    width: 1px;
    height: 2.2rem;
  }
  .line::after {
    right: auto;
    top: auto;
    bottom: 0;
    left: -3px;
    transform: rotate(135deg);
  }
}
</style>
