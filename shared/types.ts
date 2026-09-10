import type { Address, Hex } from 'viem'

/** Which upstream answered, and therefore how complete the call data is. */
export type TraceProvenance = 'callTracer' | 'internalTransactions' | 'logsOnly'

export type CallKind =
  | 'CALL'
  | 'DELEGATECALL'
  | 'STATICCALL'
  | 'CALLCODE'
  | 'CREATE'
  | 'CREATE2'
  | 'SELFDESTRUCT'

/** A nested call frame. Only available from a real callTracer. */
export interface RawCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: bigint
  input: Hex
  output: Hex | null
  gasUsed: bigint | null
  error: string | null
  calls: RawCall[]
}

/** A single internal call with no parent/child information. */
export interface FlatCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: bigint
  error: string | null
}

/**
 * Call data, shaped by what the source could actually provide.
 * A flat list is NOT a tree with one level — the distinction is load-bearing
 * and the UI must render them differently. See docs/SPEC.md section 4.
 */
export type CallActivity =
  | { kind: 'tree'; root: RawCall }
  | { kind: 'flat'; calls: FlatCall[] }
  | { kind: 'none' }

export interface RawLog {
  address: Address
  topics: Hex[]
  data: Hex
  logIndex: number
}

/**
 * How complete one section of the response is.
 * `unavailable` is not the same as an empty section: it means the request
 * failed, and presenting that as "no data" is how a transient upstream error
 * becomes a wrong answer on screen.
 */
export type SectionStatus = 'complete' | 'truncated' | 'unavailable'

export interface Coverage {
  logs: SectionStatus
  calls: SectionStatus
}

export interface RawTransaction {
  chainId: number
  hash: Hex
  blockNumber: bigint
  timestamp: number
  from: Address
  to: Address | null
  value: bigint
  input: Hex
  status: 'success' | 'reverted'
  revertReason: string | null
  gasUsed: bigint
  effectiveGasPrice: bigint
  logs: RawLog[]
  activity: CallActivity
  coverage: Coverage
  provenance: TraceProvenance
  sourceName: string
}
