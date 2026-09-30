import type { AssetRef } from '~~/server/flow/assets'
import { assetKey, isZeroAddress } from '~~/server/flow/assets'
import { truncateAddress } from '~~/shared/address'
import { amountPart, formatAmount, text } from '~~/shared/format'
import { humanize } from '~~/shared/names'
import type { Matcher, NarrativeContext } from './types'

/** A known name in words, or the shortened address. */
function nameOf(ctx: NarrativeContext, address: string): string {
  const name = ctx.names?.[address.toLowerCase()]?.name
  return name ? humanize(name) : truncateAddress(address)
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** Assets the sender lost and gained, ignoring zero nets. */
function senderMoves(ctx: NarrativeContext) {
  const assets = new Map<string, AssetRef>()
  for (const edge of ctx.edges) assets.set(assetKey(edge.asset), edge.asset)

  const out: { asset: AssetRef; amount: bigint }[] = []
  const gained: { asset: AssetRef; amount: bigint }[] = []
  const positions = ctx.positions.get(ctx.sender)
  if (!positions) return { spent: out, gained }

  for (const [key, net] of positions) {
    const asset = assets.get(key)
    if (!asset || net === 0n) continue
    if (net < 0n) out.push({ asset, amount: -net })
    else gained.push({ asset, amount: net })
  }
  return { spent: out, gained }
}

export const failed: Matcher = (ctx) => {
  if (ctx.tx.status !== 'reverted') return null
  return {
    parts: [
      text(
        ctx.tx.revertReason ? `Reverted: ${ctx.tx.revertReason}` : 'Reverted, with no reason given',
      ),
    ],
    details: ['Gas was still spent. No state change survived.'],
  }
}

export const approval: Matcher = (ctx) => {
  if (ctx.edges.length > 0) return null
  const approvals = ctx.logs.filter(
    (log) => log.eventName === 'Approval' || log.eventName === 'ApprovalForAll',
  )
  if (approvals.length === 0) return null

  const first = approvals[0]
  const spender =
    first.args.find((a) => a.name === 'spender')?.value ??
    first.args.find((a) => a.name === 'operator')?.value
  const token = first.contractName ?? truncateAddress(first.address)

  return {
    parts: [text(`Approved ${spender ? truncateAddress(spender) : 'a spender'} to move ${token}`)],
    details: approvals.length > 1 ? [`${approvals.length} approvals in this transaction.`] : [],
  }
}

export const mint: Matcher = (ctx) => {
  const minted = ctx.edges.find((edge) => isZeroAddress(edge.from) && edge.to === ctx.sender)
  if (!minted) return null
  return {
    parts: [text('Minted '), amountPart(minted.amount, minted.asset, ctx.tokens)],
    details: [],
  }
}

export const burn: Matcher = (ctx) => {
  const burned = ctx.edges.find((edge) => isZeroAddress(edge.to) && edge.from === ctx.sender)
  if (!burned) return null
  return {
    parts: [text('Burned '), amountPart(burned.amount, burned.asset, ctx.tokens)],
    details: [],
  }
}

export const swap: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)
  if (spent.length !== 1 || gained.length !== 1) return null

  const paid = spent[0]
  const got = gained[0]
  const details: string[] = []

  // A router that keeps a slice shows up as an address whose only net is a
  // positive balance of the asset the sender paid in.
  const paidKey = assetKey(paid.asset)
  for (const [address, assets] of ctx.positions) {
    if (address === ctx.sender) continue
    const net = assets.get(paidKey) ?? 0n
    const onlyAsset = [...assets.values()].filter((v) => v !== 0n).length === 1
    if (net > 0n && onlyAsset && net < paid.amount / 10n) {
      details.push(
        `${nameOf(ctx, address)} kept ${formatAmount(net, paid.asset, ctx.tokens)} as a service fee.`,
      )
    }
  }

  // The services the swap went through: contracts that emitted events, minus the
  // token contracts themselves (already named in the headline) and anything we
  // can't put a name to (a hex list tells a newcomer nothing).
  const tokenContracts = new Set(
    ctx.edges.flatMap((edge) =>
      edge.asset.kind === 'native' ? [] : [edge.asset.address.toLowerCase()],
    ),
  )
  const venues = [
    ...new Set(
      ctx.logs
        .map((log) => log.address.toLowerCase())
        .filter((address) => !tokenContracts.has(address) && ctx.names?.[address]?.name)
        .map((address) => nameOf(ctx, address)),
    ),
  ]
  if (venues.length > 0) details.push(`Went through ${listOf(venues.slice(0, 3))}.`)

  return {
    parts: [
      text('Swapped '),
      amountPart(paid.amount, paid.asset, ctx.tokens),
      text(' for '),
      amountPart(got.amount, got.asset, ctx.tokens),
    ],
    details,
  }
}

export const transfer: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)
  if (spent.length !== 1 || gained.length !== 0) return null

  const paid = spent[0]
  const recipients = [...ctx.positions.entries()].filter(
    ([address, assets]) => address !== ctx.sender && (assets.get(assetKey(paid.asset)) ?? 0n) > 0n,
  )
  if (recipients.length !== 1) return null

  return {
    parts: [
      text('Sent '),
      amountPart(paid.amount, paid.asset, ctx.tokens),
      text(` to ${truncateAddress(recipients[0][0])}`),
    ],
    details: [],
  }
}

export const fallback: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)
  if (spent.length === 0 && gained.length === 0) {
    return {
      parts: [text('No value moved')],
      details: ['This transaction changed contract state without moving any tokens or ETH.'],
    }
  }
  const moves = [
    ...spent.map((item) => [text('-'), amountPart(item.amount, item.asset, ctx.tokens)]),
    ...gained.map((item) => [text('+'), amountPart(item.amount, item.asset, ctx.tokens)]),
  ]
  return {
    parts: [
      text('Net change for the sender: '),
      ...moves.flatMap((move, index) => (index === 0 ? move : [text(', '), ...move])),
    ],
    details: ['No known pattern matched, so this is a plain summary of the flows.'],
  }
}
