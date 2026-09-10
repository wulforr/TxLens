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

function unknownToken(address: Address): TokenMeta {
  return { address, symbol: null, name: null, decimals: null, standard: 'unknown' }
}

export function createTokenResolver(http: HttpClient, chain: ChainConfig): TokenResolver {
  const cache = new Map<Address, Promise<TokenMeta>>()

  async function resolve(address: Address): Promise<TokenMeta> {
    const label = lookupLabel(chain.id, address)
    if (label?.symbol && label.decimals !== undefined) {
      return {
        address,
        symbol: label.symbol,
        name: label.name,
        decimals: label.decimals,
        standard: 'ERC-20',
      }
    }

    const result = await http.getJson<BlockscoutToken>(
      `${chain.blockscoutBase}/api/v2/tokens/${address}`,
    )
    if (!result.ok) return unknownToken(address)

    return {
      address,
      symbol: result.data.symbol ?? null,
      name: result.data.name ?? null,
      decimals: parseDecimals(result.data.decimals),
      standard: STANDARDS[result.data.type ?? ''] ?? 'unknown',
    }
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
