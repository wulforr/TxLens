<script setup lang="ts">
import { computed } from 'vue'
import type { Narrative } from '~~/server/narrate/types'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { humanize } from '~~/shared/names'
import { partUsd } from '~~/shared/steps'
import type { AddressInfo } from '~~/shared/types'

const props = withDefaults(
  defineProps<{
    narrative: Narrative
    tokens?: Record<string, TokenMeta>
    prices?: Record<string, number>
    names?: Record<string, AddressInfo>
    /** Every asset that moved, so tokens seen only in the steps are named too. */
    assets?: string[]
  }>(),
  { tokens: () => ({}), prices: () => ({}), names: () => ({}), assets: () => [] },
)

const GLOSSARY_LIMIT = 5

/**
 * What the currencies are, in words: the headline's first, then any others the
 * steps mention. A symbol like "01" or "USDT" means nothing to a newcomer; its
 * full name and what kind of thing it is does.
 */
const glossary = computed(() => {
  const keys = [
    ...(props.narrative.parts ?? []).flatMap((p) => (p.kind === 'amount' ? [p.assetKey] : [])),
    ...props.assets,
  ]
  let native = false
  const tokens: string[] = []
  for (const key of new Set(keys)) {
    if (key === 'native') {
      native = true
      continue
    }
    const meta = props.tokens[key]
    if (!meta?.symbol) continue
    const symbol = meta.symbol
    // A token whose name only repeats its symbol ("01") often has a real name
    // on its contract ("Coin01"). Prefixes stay: in "Euler Pool: Dai Stablecoin"
    // the prefix is the part that says what eDAI is.
    const differs = (value?: string | null) =>
      value && value.toLowerCase() !== symbol.toLowerCase() ? value : null
    const contractName = props.names[meta.address.toLowerCase()]?.name
    const name = differs(meta.name) ?? differs(contractName && humanize(contractName))
    tokens.push(name ? `${symbol} (${name})` : symbol)
  }
  const shown = tokens.slice(0, GLOSSARY_LIMIT)
  const more = tokens.length - shown.length
  if (more > 0) shown.push(`${more} more`)
  const list =
    shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
  return { native: native ? 'ETH' : null, tokens: list, plural: tokens.length > 1 }
})
</script>

<template>
  <section class="narrative">
    <h1>
      <template v-if="narrative.parts?.length">
        <template v-for="(part, index) in narrative.parts" :key="index">
          <template v-if="part.kind === 'text'">{{ part.text }}</template>
          <AmountChip
            v-else
            :part="part"
            :usd="partUsd(part, tokens, prices)"
            :size="20"
            show-missing-price
          />
        </template>
      </template>
      <template v-else>{{ narrative.headline }}</template>
    </h1>
    <ul v-if="narrative.details.length" class="details">
      <li v-for="detail in narrative.details" :key="detail">{{ detail }}</li>
    </ul>
    <p v-if="glossary.native || glossary.tokens" class="glossary">
      <template v-if="glossary.native">{{ glossary.native }} is Ether, Ethereum’s own currency. </template>
      <template v-if="glossary.tokens">
        {{ glossary.tokens }} {{ glossary.plural ? 'are' : 'is a' }}
        <Term
          definition="A currency or asset created by a program on Ethereum, not by Ethereum itself. Anyone can make one, so a familiar name doesn’t prove it’s the real thing."
        >{{ glossary.plural ? 'tokens' : 'token' }}</Term>.
      </template>
    </p>
    <p v-if="narrative.confidence === 'low'" class="caution" role="status">
      Read from incomplete data, so this summary may be wrong.
    </p>
  </section>
</template>

<style scoped>
h1 {
  font-size: clamp(1.4rem, 1.1rem + 1.4vw, 1.9rem);
  font-weight: 560;
  line-height: 1.55;
  letter-spacing: -0.015em;
  margin: 0;
  max-width: 30ch;
  text-wrap: balance;
}
.details {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.details li {
  color: var(--text-dim);
  font-size: 0.925rem;
  max-width: 64ch;
}
.glossary {
  color: var(--text-faint);
  font-size: 0.85rem;
  margin: 0.9rem 0 0;
  max-width: 64ch;
}
.caution {
  color: var(--warn);
  font-size: 0.85rem;
  margin: 1rem 0 0;
}
</style>
