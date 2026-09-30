<script setup lang="ts">
import { EXAMPLES, FAMOUS } from '~~/shared/examples'

const groups = [
  { id: 'famous', title: 'Famous moments', examples: FAMOUS },
  { id: 'everyday', title: 'Everyday transactions', examples: EXAMPLES },
]
</script>

<template>
  <div>
    <h1>What actually happened in this transaction?</h1>
    <p class="lede">
      Paste an Ethereum transaction ID and get it explained in plain words — who paid whom, how much,
      and what it was worth.
    </p>
    <HashForm autofocus />
    <p class="note">Ethereum only, for now. Read-only: TxLens never connects to a wallet.</p>

    <section class="examples" aria-labelledby="examples-title">
      <h2 id="examples-title">No transaction ID to hand? Try one of these.</h2>
      <div v-for="group in groups" :key="group.id" class="group">
        <h3 :id="`${group.id}-title`">{{ group.title }}</h3>
        <ul :aria-labelledby="`${group.id}-title`">
          <li v-for="example in group.examples" :key="example.hash">
            <NuxtLink :to="`/tx/ethereum/${example.hash}`">
              <span class="text">
                <span class="title">{{ example.title }}</span>
                <span class="detail">{{ example.detail }}</span>
              </span>
              <Icon class="arrow" name="arrow" :size="16" />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
h1 {
  font-size: clamp(1.6rem, 1.2rem + 1.8vw, 2.3rem);
  font-weight: 560;
  letter-spacing: -0.02em;
  line-height: 1.2;
  max-width: 22ch;
  margin: 0 0 1rem;
  text-wrap: balance;
}
.lede {
  color: var(--text-dim);
  max-width: 54ch;
  margin: 0 0 2.25rem;
}
.note {
  color: var(--text-faint);
  font-size: 0.85rem;
  margin-top: 1.75rem;
}
.examples {
  margin-top: 4rem;
}
h2 {
  font-size: 1.05rem;
  font-weight: 560;
  margin: 0 0 1.5rem;
}
.group + .group {
  margin-top: 2.5rem;
}
h3 {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
li {
  border-bottom: 1px solid var(--line);
}
a {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0.25rem;
  color: inherit;
  text-decoration: none;
}
.text {
  display: grid;
  gap: 0.2rem;
}
.title {
  font-weight: 500;
  color: var(--text);
}
.detail {
  font-size: 0.875rem;
  color: var(--text-dim);
}
.arrow {
  margin-left: auto;
  flex: none;
  color: var(--text-faint);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s;
}
a:hover .title,
a:focus-visible .title {
  color: var(--accent);
}
a:hover .arrow,
a:focus-visible .arrow {
  color: var(--accent);
  transform: translateX(3px);
}
</style>
