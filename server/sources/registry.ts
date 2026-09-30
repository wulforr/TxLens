import type { Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import type { ChainConfig } from '~~/shared/chains'
import type { RawTransaction } from '~~/shared/types'
import { fetchFromBlockscout } from './blockscout'
import { SourceUnavailable } from './errors'

export { SourceUnavailable }

export interface TxSource {
  name: string
  fetch(http: HttpClient, chain: ChainConfig, hash: Hex): Promise<RawTransaction | null>
}

/**
 * Ordered best-first. A source that doesn't know the transaction returns null
 * and the next one is tried; one that throws is tried past too. Null comes back
 * only when every source answered "not found". If any source failed instead,
 * the caller gets SourceUnavailable, because "not found" would be a guess.
 */
export const SOURCES: readonly TxSource[] = [{ name: 'blockscout', fetch: fetchFromBlockscout }]

export async function fetchTransaction(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
  sources: readonly TxSource[] = SOURCES,
): Promise<RawTransaction | null> {
  let failed = false
  for (const source of sources) {
    try {
      const result = await source.fetch(http, chain, hash)
      if (result) return result
    } catch (error) {
      failed = true
      console.warn(`[txlens] source ${source.name} failed`, error)
    }
  }
  if (failed) throw new SourceUnavailable('no source could answer')
  return null
}
