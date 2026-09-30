<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{ symbol: string; iconUrl?: string | null; size?: number }>(), {
  iconUrl: null,
  size: 14,
})

const failed = ref(false)
</script>

<template>
  <span class="badge">
    <!--
      The symbol always renders, icon or not. A logo is attacker-supplied
      metadata — a scam token can carry a convincing one — so it decorates the
      name and never replaces it. referrerpolicy keeps the viewer's page out of
      the image host's logs.
    -->
    <img
      v-if="iconUrl && !failed"
      :src="iconUrl"
      :width="size"
      :height="size"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    >
    <!-- No logo: a lettered disc, so every token gets a visual anchor. -->
    <span
      v-else
      class="fallback"
      aria-hidden="true"
      :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.55}px` }"
    >{{ symbol.slice(0, 1) }}</span>
    <span class="symbol">{{ symbol }}</span>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4ch;
  white-space: nowrap;
}
img {
  border-radius: 50%;
  flex: none;
  background: var(--bg-raised);
}
.fallback {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: var(--line);
  color: var(--text-dim);
  font-family: var(--font-mono);
  line-height: 1;
}
.symbol {
  font-family: var(--font-mono);
}
</style>
