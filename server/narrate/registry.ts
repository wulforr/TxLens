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

// ERC-4337 entry points, and the event each user operation emits
// (topic1 is the account whose operation it was).
const ENTRY_POINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
])
const USER_OPERATION_EVENT = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f'

const hasMoves = (ctx: NarrativeContext, address: string) =>
  [...(ctx.positions.get(address.toLowerCase())?.values() ?? [])].some((n) => n !== 0n)

/**
 * When the signer's own balance didn't change, the money usually moved out of
 * an account acting for them: a multisig wallet they called (Safe, BitGo), or,
 * in an ERC-4337 bundle, the user's account rather than the bundler. Found only
 * from facts: that account's balance changed, and it is the called contract or
 * the sole user operation's account.
 */
function actingAccount(ctx: NarrativeContext): Pick<NarrativeContext, 'sender' | 'acting'> | null {
  if (ctx.tx.status !== 'success' || hasMoves(ctx, ctx.sender)) return null
  const to = ctx.tx.to?.toLowerCase()
  if (to && ENTRY_POINTS.has(to)) {
    const ops = ctx.tx.logs.filter(
      (log) => log.address.toLowerCase() === to && log.topics[0] === USER_OPERATION_EVENT,
    )
    const account = ops.length === 1 ? ops[0]?.topics[1] : undefined
    if (!account) return null
    const address = `0x${account.slice(-40)}`.toLowerCase() as NarrativeContext['sender']
    return hasMoves(ctx, address) ? { sender: address, acting: 'userOperation' } : null
  }
  // A wallet acts for its signer by paying out. A called contract that only
  // gained (an attacker's contract collecting a profit) is not acting for
  // anyone; the loss-led story already tells that one.
  const paidOut = [...(ctx.positions.get(to ?? '')?.values() ?? [])].some((n) => n < 0n)
  if (to && paidOut) return { sender: to as NarrativeContext['sender'], acting: 'called' }
  return null
}

function firstMatch(ctx: NarrativeContext) {
  for (const { name, match } of MATCHERS) {
    const result = match(ctx)
    if (result) return { name, result }
  }
  return null
}

export function narrate(ctx: NarrativeContext): Narrative {
  const incomplete = ctx.tx.coverage.logs !== 'complete' || ctx.tx.coverage.calls !== 'complete'

  let found = firstMatch(ctx)
  // Retell it from the acting account, but only if that tells a real story;
  // a second fallback is no better than the first.
  const acting = actingAccount(ctx)
  if (acting) {
    const retold = firstMatch({ ...ctx, ...acting })
    if (retold && retold.name !== 'fallback') {
      retold.result.details.push(
        acting.acting === 'called'
          ? 'The sender signed this, and the money moved out of the contract it called (such as a shared wallet), not out of the sender’s own balance.'
          : 'A relay service (an ERC-4337 “bundler”) submitted this for the account above; the relay’s own balance didn’t change.',
      )
      found = { name: retold.name, result: retold.result }
    }
  }

  if (found) {
    const { name, result } = found
    // Only the explorer's public labels can say "hack"; we never infer it.
    const sender = ctx.names?.[ctx.sender.toLowerCase()]
    const details = sender?.flagged
      ? [
          ...result.details,
          `Public labels link the sender${sender.name ? ` (“${sender.name}”)` : ''} to a hack or scam.`,
        ]
      : result.details
    return {
      ...result,
      details,
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
