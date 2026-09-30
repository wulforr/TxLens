/**
 * Turn a contract identifier into words: "NativeRFQPool" -> "Native RFQ Pool",
 * "TransitSwapRouterV5.1" -> "Transit Swap Router V5.1". Names that are already
 * prose ("Uniswap V4: Pool Manager", "alice.eth") pass through unchanged.
 */
export function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** What kind of service an address is, in words a newcomer knows. */
export type ServiceKind =
  | 'exchange'
  | 'lending'
  | 'bridge'
  | 'staking'
  | 'company'
  | 'stablecoin'
  | 'token'

interface Tag {
  slug?: string | null
  tagType?: string | null
}

// The data source's own categories. Anything not listed stays unclassified:
// a wrong label is worse than none.
const GENERIC: Record<string, ServiceKind> = {
  stablecoin: 'stablecoin',
  'token-contract': 'token',
  exchange: 'company',
  'hot-wallet': 'company',
  bridge: 'bridge',
  dex: 'exchange',
  router: 'exchange',
  'liquidity-pool': 'exchange',
  aggregator: 'exchange',
  'liquid-staking': 'staking',
}
const PROTOCOL: Record<string, ServiceKind> = {
  uniswap: 'exchange',
  sushiswap: 'exchange',
  curve: 'exchange',
  balancer: 'exchange',
  '1inch': 'exchange',
  cowswap: 'exchange',
  aave: 'lending',
  compound: 'lending',
  euler: 'lending',
  morpho: 'lending',
  spark: 'lending',
  lido: 'staking',
  'rocket-pool': 'staking',
}
const PRIORITY: ServiceKind[] = [
  'stablecoin',
  'token',
  'company',
  'bridge',
  'exchange',
  'staking',
  'lending',
]
const FLAGGED = /exploit|attacker|hack|phish|scam|heist|drainer/

/**
 * Read an address's kind, and whether public labels tie it to a hack, from the
 * block explorer's tags. Only the explorer's own labels count: this never
 * infers "attacker" from behaviour.
 */
export function classifyTags(tags: Tag[] | null | undefined): {
  kind: ServiceKind | null
  flagged: boolean
} {
  const kinds = new Set<ServiceKind>()
  let flagged = false
  for (const { slug, tagType } of tags ?? []) {
    if (!slug) continue
    if ((tagType === 'generic' || tagType === 'name') && FLAGGED.test(slug)) flagged = true
    if (tagType === 'generic' && GENERIC[slug]) kinds.add(GENERIC[slug])
    if (tagType === 'protocol') {
      const kind = PROTOCOL[slug] ?? PROTOCOL[slug.split('-')[0] ?? '']
      if (kind) kinds.add(kind)
    }
  }
  return { kind: PRIORITY.find((k) => kinds.has(k)) ?? null, flagged }
}
