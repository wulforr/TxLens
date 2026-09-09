import type { Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import type { ChainConfig } from '~~/shared/chains'
import type { RawTransaction } from '~~/shared/types'
import { fetchFromBlockscout } from './blockscout'

export interface TxSource {
  name: string
  fetch(http: HttpClient, chain: ChainConfig, hash: Hex): Promise<RawTransaction | null>
}

/**
 * Ordered best-first. A source that cannot answer returns null and the next
 * one is tried. A source that throws is treated the same way — one broken
 * upstream must not take the page down.
 */
export const SOURCES: readonly TxSource[] = [{ name: 'blockscout', fetch: fetchFromBlockscout }]

export async function fetchTransaction(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
  sources: readonly TxSource[] = SOURCES,
): Promise<RawTransaction | null> {
  for (const source of sources) {
    try {
      const result = await source.fetch(http, chain, hash)
      if (result) return result
    } catch (error) {
      console.warn(`[txlens] source ${source.name} failed`, error)
    }
  }
  return null
}
