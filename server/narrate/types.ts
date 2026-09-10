import type { Address } from 'viem'
import type { DecodedLog } from '~~/server/decode/logs'
import type { FlowEdge } from '~~/server/flow/build'
import type { Positions } from '~~/server/flow/positions'
import type { TokenMeta } from '~~/server/tokens/metadata'
import type { RawTransaction } from '~~/shared/types'

export interface NarrativeContext {
  tx: RawTransaction
  logs: DecodedLog[]
  edges: FlowEdge[]
  positions: Positions
  /** assetKey -> metadata. Missing means decimals are unknown. */
  tokens: Map<string, TokenMeta>
  sender: Address
}

export interface Narrative {
  headline: string
  details: string[]
  matcher: string
  /** `low` when the underlying read was incomplete, so the story may be wrong. */
  confidence: 'high' | 'low'
}

export type Matcher = (ctx: NarrativeContext) => Omit<Narrative, 'matcher' | 'confidence'> | null
