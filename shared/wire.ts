import type { Address, Hex } from 'viem'
import type { DecodedCall } from '~~/server/decode/calls'
import type { DecodedLog } from '~~/server/decode/logs'
import type { AssetRef } from '~~/server/flow/assets'
import { assetKey } from '~~/server/flow/assets'
import type { FlowEdge, FlowOrigin } from '~~/server/flow/build'
import type { Narrative } from '~~/server/narrate/types'
import type { TokenMeta } from '~~/server/tokens/metadata'
import type { AddressInfo, CallKind, Coverage, RawTransaction, TraceProvenance } from './types'

export interface WireFlatCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: string
  error: string | null
}

export type WireActivity = { kind: 'flat'; calls: WireFlatCall[] } | { kind: 'none' }

export interface WireFlowEdge {
  from: Address
  to: Address
  asset: AssetRef
  assetKey: string
  amount: string
  origin: FlowOrigin
  order: number
  gross?: string
  via?: Address[]
  isDust?: boolean
}

export interface TxPayload {
  narrative: Narrative
  flow: WireFlowEdge[]
  /** assetKey -> token metadata, so the client can format amounts. */
  tokens: Record<string, TokenMeta>
  /** assetKey -> USD per whole unit on the transaction's day. Absent means unknown. */
  prices: Record<string, number>
  /** lowercased address -> what the source knows about it */
  names: Record<string, AddressInfo>
  chainId: number
  hash: Hex
  blockNumber: string
  timestamp: number
  from: Address
  to: Address | null
  value: string
  status: 'success' | 'reverted'
  revertReason: string | null
  gasUsed: string
  effectiveGasPrice: string
  feeWei: string
  call: DecodedCall
  logs: DecodedLog[]
  activity: WireActivity
  coverage: Coverage
  provenance: TraceProvenance
  sourceName: string
}

export function toWire(
  tx: RawTransaction,
  call: DecodedCall,
  logs: DecodedLog[],
  extra: {
    narrative: Narrative
    flow: FlowEdge[]
    tokens: Map<string, TokenMeta>
    prices?: Map<string, number>
  },
): TxPayload {
  const activity: WireActivity =
    tx.activity.kind === 'flat'
      ? {
          kind: 'flat',
          calls: tx.activity.calls.map((c) => ({
            kind: c.kind,
            from: c.from,
            to: c.to,
            value: c.value.toString(),
            error: c.error,
          })),
        }
      : { kind: 'none' }

  return {
    narrative: extra.narrative,
    flow: extra.flow.map((edge) => ({
      from: edge.from,
      to: edge.to,
      asset: edge.asset,
      assetKey: assetKey(edge.asset),
      amount: edge.amount.toString(),
      origin: edge.origin,
      order: edge.order,
      ...(edge.gross === undefined ? {} : { gross: edge.gross.toString() }),
      ...(edge.via === undefined ? {} : { via: edge.via }),
      ...(edge.isDust === undefined ? {} : { isDust: edge.isDust }),
    })),
    tokens: Object.fromEntries(extra.tokens),
    prices: Object.fromEntries(extra.prices ?? []),
    names: tx.names,
    chainId: tx.chainId,
    hash: tx.hash,
    blockNumber: tx.blockNumber.toString(),
    timestamp: tx.timestamp,
    from: tx.from,
    to: tx.to,
    value: tx.value.toString(),
    status: tx.status,
    revertReason: tx.revertReason,
    gasUsed: tx.gasUsed.toString(),
    effectiveGasPrice: tx.effectiveGasPrice.toString(),
    feeWei: (tx.gasUsed * tx.effectiveGasPrice).toString(),
    call,
    logs,
    activity,
    coverage: tx.coverage,
    provenance: tx.provenance,
    sourceName: tx.sourceName,
  }
}
