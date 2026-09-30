<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{ symbol: string; iconUrl?: string | null; size?: number }>(),
  {
    iconUrl: null,
    size: 14,
  },
)

const failed = ref(false)
/**
 * No logo: a lettered disc — but only when the symbol starts with a letter. A
 * digit in a disc ("0" for a token called "01") reads as part of the amount,
 * which is exactly the confusion the chip exists to prevent.
 */
const letter = computed(() => (/^[a-z]/i.test(props.symbol) ? props.symbol[0] : null))
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
    <!-- Ether has no token contract, so no upstream logo: draw its mark. -->
    <Icon v-else-if="symbol === 'ETH'" class="generic" name="eth" :size="size" />
    <span
      v-else-if="letter"
      class="fallback"
      aria-hidden="true"
      :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.55}px` }"
    >{{ letter }}</span>
    <Icon v-else class="generic" name="coin" :size="size" />
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
  font-family: var(--font-ui);
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}
.generic {
  flex: none;
  color: var(--text-dim);
}
.symbol {
  font-family: var(--font-mono);
}
</style>
