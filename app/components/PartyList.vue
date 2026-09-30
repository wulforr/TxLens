<script setup lang="ts">
import { truncateAddress } from '~~/shared/address'
import type { Participant } from '~~/shared/steps'

defineProps<{ people: Participant[]; explorerBase: string }>()

/** What each kind of participant is, for a reader who has never met one. */
function hint(person: Participant): string | null {
  if (person.role === 'sender') return 'Started and paid for this transaction'
  if (person.isContract === true) return 'A program running on Ethereum'
  if (person.isContract === false) return 'An ordinary account, held by a person or company'
  return null
}
</script>

<template>
  <div>
    <ul class="people">
      <li v-for="person in people" :key="person.address">
        <span class="who">
          <Party :party="person" :address="person.address" />
          <span v-if="hint(person)" class="hint">{{ hint(person) }}</span>
        </span>
        <code class="address">{{ truncateAddress(person.address) }}</code>
        <span class="actions">
          <CopyButton :value="person.address" :label="`Copy the full address of ${person.label}`" />
          <a
            class="icon"
            :href="`${explorerBase}/address/${person.address}`"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`View ${person.label} on Etherscan (opens in a new tab)`"
          >
            <Icon name="external" />
          </a>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  /* One shared set of columns, so every address and its actions line up. */
  grid-template-columns: minmax(0, max-content) auto auto;
  justify-content: start;
  column-gap: 1.25rem;
}
li {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  padding: 0.45rem 0;
  font-size: 0.9rem;
}
.who {
  display: grid;
  gap: 0.1rem;
}
.hint {
  color: var(--text-faint);
  font-size: 0.8rem;
  padding-left: 1.1em;
}
.address {
  color: var(--text-faint);
  font-size: 0.8rem;
}
.actions {
  display: inline-flex;
  gap: 0.25rem;
  margin-left: -0.75rem;
}
/* Narrow screens: name on its own line, address and actions underneath. */
@media (max-width: 560px) {
  .people {
    grid-template-columns: auto 1fr;
    column-gap: 1rem;
  }
  .who {
    grid-column: 1 / -1;
  }
  .address {
    padding-left: 1.4em;
  }
  .actions {
    margin-left: 0;
  }
}
</style>
