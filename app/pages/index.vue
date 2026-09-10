<script setup lang="ts">
import { ref } from 'vue'

const hash = ref('')
const error = ref<string | null>(null)
const router = useRouter()

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

function submit() {
  const value = hash.value.trim()
  if (!HASH_PATTERN.test(value)) {
    error.value =
      'That does not look like a transaction hash — expected 0x followed by 64 hex characters.'
    return
  }
  error.value = null
  router.push(`/tx/ethereum/${value.toLowerCase()}`)
}
</script>

<template>
  <div>
    <h1>What actually happened in this transaction?</h1>

    <form @submit.prevent="submit">
      <label for="hash" class="sr-only">Transaction hash</label>
      <input
        id="hash"
        v-model="hash"
        placeholder="0x…"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="error ? 'true' : undefined"
      >
      <button type="submit">Decode</button>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <p class="note">Ethereum mainnet. More chains coming.</p>
  </div>
</template>

<style scoped>
h1 {
  font-size: 1.5rem;
  font-weight: 500;
  max-width: 24ch;
  margin: 0 0 2rem;
}
form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
input {
  flex: 1 1 30rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
button {
  padding: 0.6rem 1.25rem;
  background: var(--accent);
  border: 0;
  color: #16121f;
  font-weight: 500;
  cursor: pointer;
}
.error {
  color: var(--bad);
  font-size: 0.85rem;
}
.note {
  color: var(--text-faint);
  font-size: 0.8rem;
  margin-top: 2rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
