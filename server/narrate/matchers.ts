import { type AssetRef, assetKey, isZeroAddress } from '~~/server/flow/assets'
import { truncateAddress } from '~~/shared/address'
import { amountPart, formatAmount, text } from '~~/shared/format'
import { humanize } from '~~/shared/names'
import { usdText } from '~~/shared/steps'
import type { Matcher, NarrativeContext } from './types'

/** A known name in words, or the shortened address. */
function nameOf(ctx: NarrativeContext, address: string): string {
  const name = ctx.names?.[address.toLowerCase()]?.name
  if (name) return humanize(name)
  // Unnamed, but we know its role: the contract the sender called. In an
  // exploit that is usually the attacker's own contract, and saying so reads
  // far better than a hex fragment.
  if (ctx.tx.to && address.toLowerCase() === ctx.tx.to.toLowerCase())
    return 'the contract the sender called'
  return truncateAddress(address)
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

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
    // Lead with the outcome in plain words. The contract's reason is often a
    // developer string ("INSUFFICIENT_OUTPUT_AMOUNT"), so it goes underneath,
    // quoted as the contract's own words rather than as our explanation.
    parts: [text('This transaction failed and was undone')],
    details: [
      ctx.tx.revertReason
        ? `The contract’s reason: “${ctx.tx.revertReason}”.`
        : 'The contract didn’t say why.',
      'Only the network fee was spent. It’s paid even when a transaction fails.',
    ],
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
    parts: [
      text(
        `Gave ${spender ? nameOf(ctx, spender) : 'another address'} permission to spend the sender’s ${token}`,
      ),
    ],
    details: approvals.length > 1 ? [`${approvals.length} approvals in this transaction.`] : [],
  }
}

export const mint: Matcher = (ctx) => {
  const minted = ctx.edges.find((edge) => isZeroAddress(edge.from) && edge.to === ctx.sender)
  if (!minted) return null
  return {
    parts: [
      text('Created '),
      amountPart(minted.amount, minted.asset, ctx.tokens),
      text(' for the sender'),
    ],
    details: [],
  }
}

export const burn: Matcher = (ctx) => {
  const burned = ctx.edges.find((edge) => isZeroAddress(edge.to) && edge.from === ctx.sender)
  if (!burned) return null
  return {
    parts: [text('Permanently destroyed '), amountPart(burned.amount, burned.asset, ctx.tokens)],
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
        `${capitalise(nameOf(ctx, address))} kept ${formatAmount(net, paid.asset, ctx.tokens)} as a service fee.`,
      )
    }
  }

  // The services the money passed through, taken from the flow itself so every
  // name here also appears in the steps. Token contracts (already in the
  // headline) and unnamed addresses (a hex list tells a newcomer nothing) are left out.
  const tokenContracts = new Set(
    ctx.edges.flatMap((edge) =>
      edge.asset.kind === 'native' ? [] : [edge.asset.address.toLowerCase()],
    ),
  )
  const venues = [
    ...new Set(
      ctx.edges
        .flatMap((edge) => [edge.from, ...(edge.via ?? []), edge.to])
        .map((address) => address.toLowerCase())
        .filter(
          (address) =>
            address !== ctx.sender.toLowerCase() &&
            !tokenContracts.has(address) &&
            ctx.names?.[address]?.name,
        )
        .map((address) => nameOf(ctx, address)),
    ),
  ]
  if (venues.length > 0) details.push(`Passed through ${listOf(venues.slice(0, 3))}.`)

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
      text(` to ${nameOf(ctx, recipients[0][0])}`),
    ],
    details: [],
  }
}

/**
 * Each address's net change, valued in USD where the price and decimals are
 * known, with the single asset that dominates it. The zero address is left out:
 * it is where minted tokens come from and burned ones go, not a participant.
 */
function rankByUsd(ctx: NarrativeContext) {
  const assets = new Map<string, AssetRef>()
  for (const edge of ctx.edges) assets.set(assetKey(edge.asset), edge.asset)
  const rows: {
    address: string
    usd: number
    top: { asset: AssetRef; amount: bigint; usd: number }
  }[] = []

  for (const [address, positions] of ctx.positions) {
    if (isZeroAddress(address)) continue
    let usd = 0
    let top: { asset: AssetRef; amount: bigint; usd: number } | null = null
    for (const [key, net] of positions) {
      const asset = assets.get(key)
      const price = ctx.prices?.get(key)
      if (!asset || net === 0n || price === undefined) continue
      const decimals =
        asset.kind === 'native' ? 18 : asset.kind === 'erc20' ? ctx.tokens.get(key)?.decimals : null
      if (typeof decimals !== 'number') continue
      const value = (Number(net) / 10 ** decimals) * price
      usd += value
      if (!top || Math.abs(value) > Math.abs(top.usd)) top = { asset, amount: net, usd: value }
    }
    if (top) rows.push({ address, usd, top })
  }
  return rows.sort((a, b) => b.usd - a.usd)
}

export const received: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)
  if (spent.length !== 0 || gained.length !== 1) return null
  const got = gained[0]

  // Who it came from: the biggest loser by value when we can price things,
  // otherwise whoever lost the most of this same asset.
  const byUsd = rankByUsd(ctx).filter((row) => row.address !== ctx.sender && row.usd < 0)
  const key = assetKey(got.asset)
  const bySameAsset = [...ctx.positions.entries()]
    .filter(
      ([address, p]) =>
        address !== ctx.sender && !isZeroAddress(address) && (p.get(key) ?? 0n) < 0n,
    )
    .sort(([, a], [, b]) => ((a.get(key) ?? 0n) < (b.get(key) ?? 0n) ? -1 : 1))
  const source = byUsd.at(-1)?.address ?? bySameAsset[0]?.[0]

  return {
    parts: [
      text('Received '),
      amountPart(got.amount, got.asset, ctx.tokens),
      ...(source ? [text(` from ${nameOf(ctx, source)}`)] : []),
    ],
    details: [],
  }
}

export const fallback: Matcher = (ctx) => {
  const { spent, gained } = senderMoves(ctx)

  if (spent.length > 0 || gained.length > 0) {
    const moves = [
      ...spent.map((item) => [text('-'), amountPart(item.amount, item.asset, ctx.tokens)]),
      ...gained.map((item) => [text('+'), amountPart(item.amount, item.asset, ctx.tokens)]),
    ]
    return {
      parts: [
        text('Net change for the sender: '),
        ...moves.flatMap((move, index) => (index === 0 ? move : [text(', '), ...move])),
      ],
      details: [
        'This didn’t match a pattern we recognise, so here is what the sender gained and lost.',
      ],
    }
  }

  const moving = ctx.edges.filter((edge) => edge.amount > 0n && edge.from !== edge.to)
  if (moving.length === 0) {
    return {
      parts: [text('No value moved')],
      details: ['This transaction only changed a setting or a record inside a contract.'],
    }
  }

  // Value moved, but not in or out of the sender — the shape of an exploit,
  // where the attacker's wallet calls a contract and the profit lands there.
  // Saying "nothing moved" here would be false, so name who came out ahead.
  const note = 'The sender’s own balance didn’t change — the value moved between other addresses.'
  const ranked = rankByUsd(ctx)
  const winner = ranked.find((row) => row.usd > 0 && row.top.amount > 0n)
  if (!winner) {
    const count = new Set(moving.flatMap((edge) => [edge.from, edge.to])).size
    return { parts: [text(`Moved value between ${count} addresses`)], details: [note] }
  }

  const details = [note]
  const loser = [...ranked].reverse().find((row) => row.usd < 0 && row.top.amount < 0n)
  if (loser) {
    details.unshift(
      `${capitalise(nameOf(ctx, loser.address))} lost ${formatAmount(-loser.top.amount, loser.top.asset, ctx.tokens)} (${usdText(-loser.usd)}).`,
    )
  }
  return {
    parts: [
      text(`${capitalise(nameOf(ctx, winner.address))} came out ahead by `),
      amountPart(winner.top.amount, winner.top.asset, ctx.tokens),
    ],
    details,
  }
}
