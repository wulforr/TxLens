import type { AssetRef } from '~~/server/flow/assets'
import { assetKey, isZeroAddress } from '~~/server/flow/assets'
import { truncateAddress } from '~~/shared/address'
import { formatAmount } from '~~/shared/format'
import type { Matcher, NarrativeContext } from './types'

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
    headline: ctx.tx.revertReason
      ? `Reverted: ${ctx.tx.revertReason}`
      : 'Reverted, with no reason given',
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
    headline: `Approved ${spender ? truncateAddress(spender) : 'a spender'} to move ${token}`,
    details: approvals.length > 1 ? [`${approvals.length} approvals in this transaction.`] : [],
  }
}

export const mint: Matcher = (ctx) => {
  const minted = ctx.edges.find((edge) => isZeroAddress(edge.from) && edge.to === ctx.sender)
  if (!minted) return null
  return {
    headline: `Minted ${formatAmount(minted.amount, minted.asset, ctx.tokens)}`,
    details: [],
  }
}

export const burn: Matcher = (ctx) => {
  const burned = ctx.edges.find((edge) => isZeroAddress(edge.to) && edge.from === ctx.sender)
  if (!burned) return null
  return {
    headline: `Burned ${formatAmount(burned.amount, burned.asset, ctx.tokens)}`,
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
        `${truncateAddress(address)} kept ${formatAmount(net, paid.asset, ctx.tokens)} as a fee.`,
      )
    }
  }

  const venues = [...new Set(ctx.logs.map((log) => log.contractName).filter(Boolean))]
  if (venues.length > 0) details.push(`Touched ${venues.slice(0, 4).join(', ')}.`)

  return {
    headline: `Swapped ${formatAmount(paid.amount, paid.asset, ctx.tokens)} for ${formatAmount(
      got.amount,
      got.asset,
      ctx.tokens,
    )}`,
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
    headline: `Sent ${formatAmount(paid.amount, paid.asset, ctx.tokens)} to ${truncateAddress(
      recipients[0][0],
    )}`,
    details: [],
  }
}

export const fallback: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)
  if (spent.length === 0 && gained.length === 0) {
    return {
      headline: 'No value moved',
      details: ['This transaction changed contract state without moving any tokens or ETH.'],
    }
  }
  const parts: string[] = []
  for (const item of spent) parts.push(`-${formatAmount(item.amount, item.asset, ctx.tokens)}`)
  for (const item of gained) parts.push(`+${formatAmount(item.amount, item.asset, ctx.tokens)}`)
  return {
    headline: `Net change for the sender: ${parts.join(', ')}`,
    details: ['No known pattern matched, so this is a plain summary of the flows.'],
  }
}
