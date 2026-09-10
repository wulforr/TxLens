import type { Address } from 'viem'
import type { DecodedArg } from '~~/server/decode/calls'
import type { DecodedLog } from '~~/server/decode/logs'
import { normaliseAddress } from '~~/shared/address'
import type { RawTransaction } from '~~/shared/types'
import { type AssetRef, NATIVE } from './assets'

export type FlowOrigin = 'native' | 'erc20' | 'erc721' | 'erc1155'

export interface FlowEdge {
  from: Address
  to: Address
  asset: AssetRef
  amount: bigint
  origin: FlowOrigin
  /** Set by the reducers when an edge was netted: the pre-netting total. */
  gross?: bigint
  /** Conduit addresses this edge was routed through before collapsing. */
  via?: Address[]
  /** Trivially small relative to the largest edge for this asset. */
  isDust?: boolean
}

function arg(args: DecodedArg[], name: string): string | undefined {
  return args.find((a) => a.name === name)?.value
}

function toBigInt(value: string | undefined): bigint | null {
  if (value === undefined) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

/** Decoded array args serialise as "[1, 2, 3]". Parse them back. */
function toList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function address(value: string | undefined): Address | null {
  if (!value) return null
  try {
    return normaliseAddress(value)
  } catch {
    return null
  }
}

/**
 * Normalise every way value moves into one edge list.
 *
 * Four sources — native value on calls, ERC-20, ERC-721 and ERC-1155 transfers —
 * become the same shape, which is what lets the reducers and the diagram treat
 * them uniformly. See docs/SPEC.md section 6.
 */
export function buildFlow(tx: RawTransaction, logs: DecodedLog[]): FlowEdge[] {
  const edges: FlowEdge[] = []

  if (tx.value > 0n && tx.to) {
    edges.push({ from: tx.from, to: tx.to, asset: NATIVE, amount: tx.value, origin: 'native' })
  }

  if (tx.activity.kind === 'flat') {
    for (const call of tx.activity.calls) {
      if (call.value > 0n && call.to) {
        edges.push({
          from: call.from,
          to: call.to,
          asset: NATIVE,
          amount: call.value,
          origin: 'native',
        })
      }
    }
  }

  for (const log of logs) {
    if (log.confidence !== 'decoded' || !log.eventName) continue

    const from = address(arg(log.args, 'from'))
    const to = address(arg(log.args, 'to'))
    if (!from || !to) continue

    if (log.eventName === 'Transfer') {
      // ERC-20 and ERC-721 share a name and a topic0. They differ in whether
      // the third parameter is indexed, so only one abi decodes any given log
      // — and the winner names its parameter `value` or `tokenId`. Reading the
      // name is reading the answer the decoder already worked out.
      const tokenId = arg(log.args, 'tokenId')
      if (tokenId !== undefined) {
        edges.push({
          from,
          to,
          asset: { kind: 'nft', address: log.address, tokenId },
          amount: 1n,
          origin: 'erc721',
        })
        continue
      }

      const amount = toBigInt(arg(log.args, 'value'))
      if (amount === null) continue
      edges.push({
        from,
        to,
        asset: { kind: 'erc20', address: log.address },
        amount,
        origin: 'erc20',
      })
      continue
    }

    if (log.eventName === 'TransferSingle') {
      const id = arg(log.args, 'id')
      const amount = toBigInt(arg(log.args, 'value'))
      if (id === undefined || amount === null) continue
      edges.push({
        from,
        to,
        asset: { kind: 'nft', address: log.address, tokenId: id },
        amount,
        origin: 'erc1155',
      })
      continue
    }

    if (log.eventName === 'TransferBatch') {
      const ids = toList(arg(log.args, 'ids'))
      const values = toList(arg(log.args, 'values'))
      ids.forEach((id, index) => {
        const amount = toBigInt(values[index])
        if (amount === null) return
        edges.push({
          from,
          to,
          asset: { kind: 'nft', address: log.address, tokenId: id },
          amount,
          origin: 'erc1155',
        })
      })
    }
  }

  return edges
}
