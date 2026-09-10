import type { TokenMeta } from '~~/server/tokens/metadata'
import { truncateAddress } from './address'
import { formatAmount } from './format'
import type { WireFlowEdge } from './wire'

export interface SankeyNode {
  /** `${address}|${assetKey}` — see the note on toSankeyModel. */
  id: string
  address: string
  assetKey: string
  label: string
  isSender: boolean
}

export interface SankeyLink {
  source: string
  target: string
  assetKey: string
  symbol: string
  iconUrl: string | null
  amountText: string
  /**
   * Width encoding: this edge's share of total movement **of its own asset**,
   * in 0..1. Widths are comparable within an asset and NOT across assets —
   * 900 USDT and 0.01 WBTC cannot share a scale. The diagram says so.
   */
  share: number
}

export interface SankeyModel {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Edges removed to make the graph acyclic, listed rather than hidden. */
  omitted: SankeyLink[]
  /**
   * Transfers of exactly zero, which are real events but cannot be drawn.
   * Counted so the diagram can account for them instead of leaving a reader
   * wondering where several hundred events went.
   */
  zeroValue: number
  assets: { key: string; symbol: string; iconUrl: string | null }[]
  tooComplex: boolean
}

/** Past this the picture is worse than the list, so we render the list. */
export const MAX_NODES = 48

function labelFor(address: string, tokens: Record<string, TokenMeta>): string {
  const token = Object.values(tokens).find((t) => t.address === address)
  return token?.symbol ?? truncateAddress(address)
}

/**
 * d3-sankey requires a directed acyclic graph; a cycle makes it loop forever.
 * Real flows contain cycles, so break each one by dropping its smallest edge —
 * and return what was dropped so the UI can list it. Silently discarding an
 * edge would make the diagram quietly wrong.
 */
function breakCycles(links: SankeyLink[]): { kept: SankeyLink[]; omitted: SankeyLink[] } {
  const kept: SankeyLink[] = []
  const omitted: SankeyLink[] = []

  // Add edges smallest-last so that when a cycle closes, the edge we refuse is
  // the least significant one available.
  for (const link of [...links].sort((a, b) => b.share - a.share)) {
    if (reaches(kept, link.target, link.source)) omitted.push(link)
    else kept.push(link)
  }
  return { kept, omitted }
}

function reaches(links: SankeyLink[], from: string, to: string): boolean {
  if (from === to) return true
  const seen = new Set<string>([from])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const link of links) {
      if (link.source !== current || seen.has(link.target)) continue
      if (link.target === to) return true
      seen.add(link.target)
      queue.push(link.target)
    }
  }
  return false
}

/** Node identity is per address *and* asset. See the note below. */
export function nodeId(address: string, assetKey: string): string {
  return `${address}|${assetKey}`
}

/**
 * Build a drawable flow graph.
 *
 * **Nodes are (address, asset) pairs, not addresses.** A Sankey needs a
 * directed acyclic graph, and an address-keyed graph of a swap is never
 * acyclic: value leaves the sender in one asset and returns in another, which
 * closes a loop through the same participants. Breaking those loops would
 * delete exactly the legs a reader cares about.
 *
 * Splitting per asset makes each asset its own left-to-right river, which is
 * both acyclic and closer to how people actually describe a swap: "the USDT
 * went this way, the WBTC came back that way". Cycle-breaking is kept below
 * purely as a safety net for genuine same-asset loops.
 */
export function toSankeyModel(
  flow: WireFlowEdge[],
  tokens: Record<string, TokenMeta>,
  sender: string,
  nativeSymbol = 'ETH',
): SankeyModel {
  const drawable = flow.filter((edge) => edge.from !== edge.to)
  const usable = drawable.filter((edge) => BigInt(edge.amount) > 0n)
  const zeroValue = drawable.length - usable.length

  const totals = new Map<string, bigint>()
  for (const edge of usable) {
    totals.set(edge.assetKey, (totals.get(edge.assetKey) ?? 0n) + BigInt(edge.amount))
  }

  const tokenMap = new Map(Object.entries(tokens))

  const links: SankeyLink[] = usable.map((edge) => {
    const meta = tokenMap.get(edge.assetKey)
    const total = totals.get(edge.assetKey) ?? 1n
    // Integer maths first: bigint division then scale, so precision survives.
    const share = Number((BigInt(edge.amount) * 10_000n) / total) / 10_000

    return {
      source: nodeId(edge.from, edge.assetKey),
      target: nodeId(edge.to, edge.assetKey),
      assetKey: edge.assetKey,
      symbol: edge.asset.kind === 'native' ? nativeSymbol : (meta?.symbol ?? '?'),
      iconUrl: meta?.iconUrl ?? null,
      amountText: formatAmount(BigInt(edge.amount), edge.asset, tokenMap, nativeSymbol),
      share,
    }
  })

  const { kept, omitted } = breakCycles(links)

  const ids = [...new Set(kept.flatMap((link) => [link.source, link.target]))]
  const nodes: SankeyNode[] = ids.map((id) => {
    const [address, assetKey] = id.split('|') as [string, string]
    return {
      id,
      address,
      assetKey,
      label: labelFor(address, tokens),
      isSender: address === sender.toLowerCase(),
    }
  })

  const assets = [...new Set(kept.map((link) => link.assetKey))].map((key) => {
    const link = kept.find((l) => l.assetKey === key)
    return { key, symbol: link?.symbol ?? '?', iconUrl: link?.iconUrl ?? null }
  })

  return {
    nodes,
    links: kept,
    omitted,
    zeroValue,
    assets,
    tooComplex: nodes.length > MAX_NODES,
  }
}
