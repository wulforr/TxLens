<script setup lang="ts">
import { ref } from 'vue'
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

const copied = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    copied.value = address
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = null), 2000)
  } catch {
    // Clipboard can be blocked (insecure origin, permissions); the address stays selectable.
  }
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
          <button
            type="button"
            class="icon"
            :aria-label="`Copy the full address of ${person.label}`"
            @click="copy(person.address)"
          >
            <Icon :name="copied === person.address ? 'check' : 'copy'" />
          </button>
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
    <p class="sr-only" aria-live="polite">{{ copied ? 'Address copied' : '' }}</p>
  </div>
</template>

<style scoped>
.people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.1rem;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 1rem;
  padding: 0.4rem 0;
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
/* Right beside the address they act on, not pushed to the far edge. */
.actions {
  display: inline-flex;
  gap: 0.1rem;
  margin-left: -0.5rem;
}
</style>
