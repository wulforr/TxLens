import type { Address } from 'viem'
import type { DecodedLog } from '~~/server/decode/logs'
import type { FlowEdge } from '~~/server/flow/build'
import type { Positions } from '~~/server/flow/positions'
import type { TokenMeta } from '~~/server/tokens/metadata'
import type { NarrativePart } from '~~/shared/format'
import type { AddressInfo, RawTransaction } from '~~/shared/types'

export interface NarrativeContext {
  tx: RawTransaction
  logs: DecodedLog[]
  edges: FlowEdge[]
  positions: Positions
  /** assetKey -> metadata. Missing means decimals are unknown. */
  tokens: Map<string, TokenMeta>
  sender: Address
  /** Human names for addresses, when the source knew them. */
  names?: Record<string, AddressInfo>
  /** assetKey -> USD per whole unit, when known. Used to rank winners and losers. */
  prices?: Map<string, number>
  /**
   * How `sender` relates to the account that signed: set when the story is told
   * from an account acting for the signer (a multisig wallet it called, or an
   * ERC-4337 account whose operation a bundler submitted).
   */
  acting?: 'called' | 'userOperation'
}

export interface Narrative {
  /** Plain-text form of `parts`, for titles, tests, and anything that wants a string. */
  headline: string
  parts: NarrativePart[]
  details: string[]
  matcher: string
  /** `low` when the underlying read was incomplete, so the story may be wrong. */
  confidence: 'high' | 'low'
}

export type Matcher = (
  ctx: NarrativeContext,
) => { parts: NarrativePart[]; details: string[] } | null
