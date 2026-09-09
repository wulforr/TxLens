import type { Hex } from 'viem'
import { type ChainConfig, getChain } from '~~/shared/chains'

export interface TxRef {
  chain: ChainConfig
  hash: Hex
}

export type TxRefResult = { ok: true; ref: TxRef } | { ok: false; reason: string }

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

export function parseTxRef(chainSlug: unknown, hash: unknown): TxRefResult {
  if (typeof chainSlug !== 'string') return { ok: false, reason: 'unknown chain' }
  const chain = getChain(chainSlug)
  if (!chain) return { ok: false, reason: 'unknown chain' }

  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
    return { ok: false, reason: 'invalid transaction hash' }
  }

  return { ok: true, ref: { chain, hash: hash.toLowerCase() as Hex } }
}
