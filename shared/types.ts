import type { Address, Hex } from 'viem'
import type { ServiceKind } from './names'

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

/** What the data source knows about an address, harvested from responses it already sent. */
export interface AddressInfo {
  name: string | null
  isContract: boolean | null
  /** From the explorer's category tags, when it has any we recognise. */
  kind?: ServiceKind | null
  /** Public labels tie this address to a hack or scam. */
  flagged?: boolean
}

export interface RawTransaction {
  chainId: number
  hash: Hex
  blockNumber: bigint
  /** Blocks built on top of this one. Past the chain's reorg depth, the result is final. */
  confirmations: number
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
  /** lowercased address -> name and contract flag, for every address the source mentioned */
  names: Record<string, AddressInfo>
  provenance: TraceProvenance
  sourceName: string
}
