<script setup lang="ts">
withDefaults(
  defineProps<{ name: 'copy' | 'check' | 'external' | 'arrow' | 'coin' | 'eth'; size?: number }>(),
  {
    size: 14,
  },
)
</script>

<template>
  <!-- One drawn set, one stroke weight. Decorative: the control it sits in carries the name. -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'copy'">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </template>
    <path v-else-if="name === 'check'" d="M3 8.5l3.2 3L13 4.5" />
    <template v-else-if="name === 'external'">
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5L7.5 8.5" />
      <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </template>
    <path v-else-if="name === 'arrow'" d="M2.5 8h10.5M9 4l4 4-4 4" />
    <template v-else-if="name === 'coin'">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v6M6.25 6.5h2.5a1 1 0 0 1 0 2h-1.5a1 1 0 0 0 0 2h2.5" />
    </template>
    <template v-else-if="name === 'eth'">
      <path d="M8 1.75L3.75 8.4 8 10.9l4.25-2.5L8 1.75z" />
      <path d="M3.75 9.6L8 14.25l4.25-4.65L8 12.1 3.75 9.6z" />
    </template>
  </svg>
</template>
