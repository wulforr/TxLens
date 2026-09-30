<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ value: string; label: string }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard can be blocked (insecure origin, permissions); the value stays selectable.
  }
}
</script>

<template>
  <button type="button" class="icon" :aria-label="label" @click="copy(value)">
    <Icon :name="copied ? 'check' : 'copy'" />
    <span class="sr-only" aria-live="polite">{{ copied ? 'Copied' : '' }}</span>
  </button>
</template>
