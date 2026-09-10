<script setup lang="ts">
withDefaults(defineProps<{ symbol: string; iconUrl?: string | null; size?: number }>(), {
  iconUrl: null,
  size: 14,
})
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
      v-if="iconUrl"
      :src="iconUrl"
      :width="size"
      :height="size"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="($event.target as HTMLImageElement).style.display = 'none'"
    >
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
.symbol {
  font-family: var(--font-mono);
}
</style>
