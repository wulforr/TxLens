<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ definition: string }>()

// A word a newcomer may not know, with a one-line definition on tap, click or
// keyboard. The native popover handles focus, Escape and tapping away; anchor
// positioning puts it under the word, and without it the browser centres it.
const id = `term-${useId().replace(/[^\w-]/g, '')}`
</script>

<template>
  <button
    type="button"
    class="term"
    :popovertarget="id"
    :aria-describedby="id"
    :style="`anchor-name: --${id}`"
  ><slot /></button>
  <span :id="id" popover class="definition" :style="`position-anchor: --${id}`">{{ definition }}</span>
</template>

<style scoped>
.term {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 2px;
  /* A finger-sized target without moving the line: padding in, margin out. */
  padding: 0.2em 0;
  margin: -0.2em 0;
  text-decoration: underline dotted;
  text-decoration-color: var(--text-faint);
  text-underline-offset: 0.25em;
  cursor: help;
}
.term:hover {
  text-decoration-color: var(--accent);
}
.definition {
  max-width: min(32ch, calc(100vw - 2rem));
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-raised);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1.45;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
@supports (anchor-name: --a) {
  .definition {
    inset: auto;
    margin: 0.4rem 0;
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
  }
}
</style>
