import type { Abi, Address, Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import { lookupLabel } from './labelpack'
import { resolveImplementation } from './proxy'
import { fetchBlockscoutAbi, fetchFourByteSignature, fetchSourcifyAbi } from './remote'

export type AbiSource = 'labelpack' | 'blockscout' | 'sourcify'

export type AbiResolution =
  | { kind: 'full'; abi: Abi; name: string | null; source: AbiSource; via: Address | null }
  | { kind: 'signature'; signature: string }
  | { kind: 'unknown' }

export interface AbiResolver {
  forAddress(address: string): Promise<AbiResolution>
  forSelector(selector: Hex | string): Promise<string | null>
}

export function createAbiResolver(http: HttpClient, chain: ChainConfig): AbiResolver {
  const addressCache = new Map<Address, Promise<AbiResolution>>()
  const selectorCache = new Map<string, Promise<string | null>>()

  /** Label pack, then Blockscout verified source, then Sourcify. No proxy step. */
  async function direct(address: Address): Promise<AbiResolution | null> {
    const label = lookupLabel(chain.id, address)
    if (label?.abi) {
      return { kind: 'full', abi: label.abi, name: label.name, source: 'labelpack', via: null }
    }

    const blockscout = await fetchBlockscoutAbi(http, chain, address)
    if (blockscout) {
      return {
        kind: 'full',
        abi: blockscout.abi,
        name: blockscout.name,
        source: 'blockscout',
        via: null,
      }
    }

    const sourcify = await fetchSourcifyAbi(http, chain.id, address)
    if (sourcify) {
      return { kind: 'full', abi: sourcify, name: null, source: 'sourcify', via: null }
    }

    return null
  }

  async function resolveAddress(address: Address): Promise<AbiResolution> {
    // 1. Curated wins outright, and costs nothing.
    const label = lookupLabel(chain.id, address)
    if (label?.abi) {
      return { kind: 'full', abi: label.abi, name: label.name, source: 'labelpack', via: null }
    }

    // 2. Proxy before remote: a proxy's own ABI describes the proxy, not the
    //    logic being called, so resolving it would decode nothing useful.
    const implementation = await resolveImplementation(http, chain, address)
    if (implementation) {
      const viaImpl = await direct(implementation)
      if (viaImpl?.kind === 'full') return { ...viaImpl, via: implementation }
    }

    // 3. The address's own verified source.
    const own = await direct(address)
    if (own) return own

    return { kind: 'unknown' }
  }

  return {
    forAddress(input: string) {
      const address = normaliseAddress(input)
      const cached = addressCache.get(address)
      if (cached) return cached
      const pending = resolveAddress(address)
      addressCache.set(address, pending)
      return pending
    },
    forSelector(selector: Hex | string) {
      const key = selector.toLowerCase()
      const cached = selectorCache.get(key)
      if (cached) return cached
      const pending = fetchFourByteSignature(http, key)
      selectorCache.set(key, pending)
      return pending
    },
  }
}
