<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{ label?: string; autofocus?: boolean; initial?: string }>(),
  { label: 'Transaction ID', autofocus: false, initial: '' },
)

// Starts with what the reader typed last, so a typo can be fixed in place.
const hash = ref(props.initial)
const error = ref<string | null>(null)
const router = useRouter()
// Found anywhere in the input, so a pasted Etherscan link works as well as the bare ID.
const HASH_PATTERN = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/
const id = `hash-${Math.random().toString(36).slice(2, 8)}`

function submit() {
  const value = hash.value.trim().match(HASH_PATTERN)?.[0]
  if (!value) {
    error.value =
      'That isn’t a transaction ID. It should start with 0x, followed by 64 characters using 0–9 and a–f.'
    return
  }
  error.value = null
  router.push(`/tx/ethereum/${value.toLowerCase()}`)
}
</script>

<template>
  <form class="form" novalidate @submit.prevent="submit">
    <label :for="id" class="label">{{ props.label }}</label>
    <div class="row">
      <input
        :id="id"
        v-model="hash"
        placeholder="0x… or an Etherscan link"
        autocomplete="off"
        spellcheck="false"
        :autofocus="autofocus"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
      >
      <button type="submit" class="primary">Explain it</button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.4rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
input {
  flex: 1 1 22rem;
  min-width: 0;
  padding: 0.65rem 0.75rem;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
input:hover {
  border-color: var(--text-faint);
}
.error {
  color: var(--bad);
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
}
</style>
