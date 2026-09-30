import { partsToText, text } from '~~/shared/format'
import * as matchers from './matchers'
import type { Matcher, Narrative, NarrativeContext } from './types'

/**
 * Ordered, first non-null wins. Order matters: `failed` must precede every
 * matcher that reads flows, because a reverted transaction's partial flows
 * describe something that did not happen.
 */
export const MATCHERS: readonly { name: string; match: Matcher }[] = [
  { name: 'failed', match: matchers.failed },
  { name: 'approval', match: matchers.approval },
  { name: 'mint', match: matchers.mint },
  { name: 'burn', match: matchers.burn },
  { name: 'swap', match: matchers.swap },
  { name: 'transfer', match: matchers.transfer },
  { name: 'received', match: matchers.received },
  { name: 'fallback', match: matchers.fallback },
]

export function narrate(ctx: NarrativeContext): Narrative {
  const incomplete = ctx.tx.coverage.logs !== 'complete' || ctx.tx.coverage.calls !== 'complete'

  for (const { name, match } of MATCHERS) {
    const result = match(ctx)
    if (!result) continue
    return {
      ...result,
      headline: partsToText(result.parts),
      matcher: name,
      // A story computed over a partial event list may simply be wrong.
      confidence: incomplete ? 'low' : 'high',
    }
  }

  // The fallback matcher never returns null, so this is unreachable — but a
  // narrative is not optional, and returning undefined would push the problem
  // into the UI.
  return {
    headline: 'Could not summarise this transaction',
    parts: [text('Could not summarise this transaction')],
    details: [],
    matcher: 'none',
    confidence: 'low',
  }
}
