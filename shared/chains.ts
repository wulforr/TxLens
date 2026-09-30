export interface ChainConfig {
  id: number
  slug: string
  name: string
  nativeSymbol: string
  nativeDecimals: number
  /** Blockscout v2 API root, no trailing slash. */
  blockscoutBase: string
  /** Blocks to wait before a transaction is safe to cache forever. */
  reorgDepth: number
  /** Block explorer for "view on explorer" links, no trailing slash. */
  explorerBase: string
  /** DefiLlama coin-id prefix for this chain's tokens ("ethereum:0x…"). */
  pricePrefix: string
  /** DefiLlama coin id for the native asset. */
  nativePriceId: string
}

export const CHAINS: readonly ChainConfig[] = [
  {
    id: 1,
    slug: 'ethereum',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutBase: 'https://eth.blockscout.com',
    reorgDepth: 64,
    explorerBase: 'https://etherscan.io',
    pricePrefix: 'ethereum',
    nativePriceId: 'coingecko:ethereum',
  },
] as const

export function getChain(slug: string): ChainConfig | undefined {
  const wanted = slug.toLowerCase()
  return CHAINS.find((chain) => chain.slug === wanted)
}
