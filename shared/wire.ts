import type { Address, Hex } from 'viem'
import type { DecodedCall } from '~~/server/decode/calls'
import type { DecodedLog } from '~~/server/decode/logs'
import type { CallKind, Coverage, RawTransaction, TraceProvenance } from './types'

export interface WireFlatCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: string
  error: string | null
}

export type WireActivity = { kind: 'flat'; calls: WireFlatCall[] } | { kind: 'none' }

export interface TxPayload {
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

export function toWire(tx: RawTransaction, call: DecodedCall, logs: DecodedLog[]): TxPayload {
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
