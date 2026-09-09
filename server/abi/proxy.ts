import type { Address } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'

interface BlockscoutImplementation {
  /** What the live v2 API returns. */
  address_hash?: string
  /** What older Blockscout releases returned. */
  address?: string
}

interface BlockscoutAddressResponse {
  is_contract?: boolean
  proxy_type?: string | null
  implementations?: BlockscoutImplementation[]
}

/**
 * Resolve a proxy to the contract that actually holds the logic.
 * Uses Blockscout's already-resolved implementations field, which keeps phase 1
 * keyless. See the plan's Task 10 for why this is not EIP-1967 slot reading yet.
 */
export async function resolveImplementation(
  http: HttpClient,
  chain: ChainConfig,
  address: string,
): Promise<Address | null> {
  const proxy = normaliseAddress(address)
  const url = `${chain.blockscoutBase}/api/v2/addresses/${proxy}`
  const result = await http.getJson<BlockscoutAddressResponse>(url)
  if (!result.ok) return null

  const entry = result.data.implementations?.[0]
  const first = entry?.address_hash ?? entry?.address
  if (!first) return null

  let implementation: Address
  try {
    implementation = normaliseAddress(first)
  } catch {
    // Upstream is hostile input like any other. A malformed implementation
    // means "no implementation", not a crashed request.
    return null
  }

  // A proxy that reports itself would loop the resolution ladder forever.
  if (implementation === proxy) return null
  return implementation
}
