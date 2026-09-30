import type { Address } from 'viem'
import { lookupLabel } from '~~/server/abi/labelpack'
import type { HttpClient } from '~~/server/utils/http'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'

export type TokenStandard = 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'unknown'

export interface TokenMeta {
  address: Address
  symbol: string | null
  name: string | null
  /**
   * Null means genuinely unknown, and callers must render raw units with a
   * marker rather than assuming 18. Defaulting here would turn NFT token id
   * 4023 into "0.000000000000004023".
   */
  decimals: number | null
  standard: TokenStandard
  /**
   * Remote logo, or null. Never the sole identifier for a token — a scam token
   * can carry a convincing logo, so the symbol always renders alongside it.
   */
  iconUrl: string | null
}

export interface TokenResolver {
  forAddress(address: string): Promise<TokenMeta>
}

interface BlockscoutToken {
  name: string | null
  symbol: string | null
  /** Arrives as a string ("6"), or null for non-fungible tokens. */
  decimals: string | null
  type: string | null
  icon_url: string | null
}

const STANDARDS: Record<string, TokenStandard> = {
  'ERC-20': 'ERC-20',
  'ERC-721': 'ERC-721',
  'ERC-1155': 'ERC-1155',
}

function parseDecimals(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : null
}

/** Only https icons are ever surfaced; anything else is dropped silently. */
function httpsOnly(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function unknownToken(address: Address): TokenMeta {
  return { address, symbol: null, name: null, decimals: null, standard: 'unknown', iconUrl: null }
}

export function createTokenResolver(http: HttpClient, chain: ChainConfig): TokenResolver {
  const cache = new Map<Address, Promise<TokenMeta>>()

  async function resolve(address: Address): Promise<TokenMeta> {
    const label = lookupLabel(chain.id, address)
    const curated =
      label?.symbol && label.decimals !== undefined
        ? {
            address,
            symbol: label.symbol,
            name: label.name,
            decimals: label.decimals,
            standard: 'ERC-20' as const,
            iconUrl: null,
          }
        : null

    const result = await http.getJson<BlockscoutToken>(
      `${chain.blockscoutBase}/api/v2/tokens/${address}`,
    )

    // The curated entry is authoritative for symbol and decimals — that is the
    // whole point of the label pack, and it is what keeps the demo
    // transactions correct with every upstream down. The icon is decorative,
    // so it is taken from upstream when available and simply absent when not.
    //
    // Icons are deliberately NOT committed to the label pack: the URLs
    // upstream serves are third-party CDN links, one of which currently points
    // at an unmerged fork branch. Pinning those into the repo trades a missing
    // logo for a broken one.
    if (!result.ok) return curated ?? unknownToken(address)

    const upstream: TokenMeta = {
      address,
      symbol: result.data.symbol ?? null,
      name: result.data.name ?? null,
      decimals: parseDecimals(result.data.decimals),
      standard: STANDARDS[result.data.type ?? ''] ?? 'unknown',
      iconUrl: httpsOnly(result.data.icon_url),
    }

    // The name is enrichment too: some curated entries only repeat the symbol
    // ("USDT"), and the reader needs the words ("Tether").
    const name =
      curated?.name && curated.name !== curated.symbol
        ? curated.name
        : (upstream.name ?? curated?.name)
    return curated ? { ...curated, name: name ?? null, iconUrl: upstream.iconUrl } : upstream
  }

  return {
    forAddress(input: string) {
      const address = normaliseAddress(input)
      const cached = cache.get(address)
      if (cached) return cached
      const pending = resolve(address)
      cache.set(address, pending)
      return pending
    },
  }
}
