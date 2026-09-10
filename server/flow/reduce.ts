import type { Address } from 'viem'
import { assetKey } from './assets'
import type { FlowEdge } from './build'

/**
 * An edge below this fraction of the largest edge for its asset is dust.
 * Scale-free rather than an absolute amount, because "small" means something
 * different for 6-decimal USDC and an 18-decimal token. Named rather than
 * inlined so it is arguable.
 */
export const DUST_FRACTION = 10_000n // 1/10,000th of the largest edge

export interface ReduceResult {
  edges: FlowEdge[]
  /** Addresses removed as pass-through conduits. */
  collapsed: Address[]
  /** How many opposing edge pairs were netted against each other. */
  netted: number
}

function pairKey(edge: FlowEdge): string {
  return `${edge.from}|${edge.to}|${assetKey(edge.asset)}`
}

/**
 * Merge parallel edges — the same sender, recipient and asset — into one.
 * Every later pass assumes at most one edge per (from, to, asset).
 */
function mergeParallel(edges: FlowEdge[]): FlowEdge[] {
  const merged = new Map<string, FlowEdge>()
  for (const edge of edges) {
    const key = pairKey(edge)
    const existing = merged.get(key)
    if (existing) {
      existing.amount += edge.amount
      existing.gross = (existing.gross ?? existing.amount) + edge.amount
    } else {
      merged.set(key, { ...edge })
    }
  }
  return [...merged.values()]
}

/** `A→B 100` with `B→A 40` becomes `A→B 60`. Nobody's net changes. */
function netRoundTrips(edges: FlowEdge[]): { edges: FlowEdge[]; netted: number } {
  const byKey = new Map<string, FlowEdge>(edges.map((edge) => [pairKey(edge), edge]))
  const done = new Set<string>()
  const out: FlowEdge[] = []
  let netted = 0

  for (const edge of edges) {
    const key = pairKey(edge)
    if (done.has(key)) continue
    done.add(key)

    const reverseKey = `${edge.to}|${edge.from}|${assetKey(edge.asset)}`
    const reverse = byKey.get(reverseKey)

    if (!reverse || done.has(reverseKey)) {
      out.push(edge)
      continue
    }
    done.add(reverseKey)
    netted += 1

    const delta = edge.amount - reverse.amount
    if (delta === 0n) continue
    const gross = (edge.gross ?? edge.amount) + (reverse.gross ?? reverse.amount)
    out.push(delta > 0n ? { ...edge, amount: delta, gross } : { ...reverse, amount: -delta, gross })
  }

  return { edges: out, netted }
}

/**
 * An address that receives exactly N of an asset and forwards exactly N of the
 * same asset, and does nothing else, is a conduit. Its own net is zero, so
 * removing it and joining its neighbours cannot move anyone's position.
 */
function collapseConduits(edges: FlowEdge[]): { edges: FlowEdge[]; collapsed: Address[] } {
  const collapsed: Address[] = []
  let current = edges

  // Repeat to dissolve chains: collapsing B may expose C as a conduit.
  for (let pass = 0; pass < 16; pass++) {
    const incoming = new Map<string, FlowEdge[]>()
    const outgoing = new Map<string, FlowEdge[]>()
    for (const edge of current) {
      if (edge.from === edge.to) continue
      incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    }

    const conduit = [...incoming.keys()].find((address) => {
      const ins = incoming.get(address) ?? []
      const outs = outgoing.get(address) ?? []
      if (ins.length !== 1 || outs.length !== 1) return false
      const [into] = ins
      const [outOf] = outs
      return (
        assetKey(into.asset) === assetKey(outOf.asset) &&
        into.amount === outOf.amount &&
        into.amount > 0n &&
        into.from !== outOf.to
      )
    })

    if (!conduit) break

    const into = (incoming.get(conduit) ?? [])[0]
    const outOf = (outgoing.get(conduit) ?? [])[0]
    collapsed.push(conduit as Address)
    current = [
      ...current.filter((edge) => edge !== into && edge !== outOf),
      { ...into, to: outOf.to, via: [...(into.via ?? []), conduit as Address] },
    ]
  }

  return { edges: current, collapsed }
}

/** Mark trivially small edges so the diagram can group them. */
function markDust(edges: FlowEdge[]): FlowEdge[] {
  const largest = new Map<string, bigint>()
  for (const edge of edges) {
    const key = assetKey(edge.asset)
    const seen = largest.get(key) ?? 0n
    if (edge.amount > seen) largest.set(key, edge.amount)
  }

  return edges.map((edge) => {
    const max = largest.get(assetKey(edge.asset)) ?? 0n
    const threshold = max / DUST_FRACTION
    return threshold > 0n && edge.amount > 0n && edge.amount <= threshold
      ? { ...edge, isDust: true }
      : edge
  })
}

export function reduceFlow(edges: FlowEdge[]): ReduceResult {
  const merged = mergeParallel(edges)
  const { edges: netted, netted: nettedCount } = netRoundTrips(merged)
  const { edges: collapsedEdges, collapsed } = collapseConduits(netted)
  return { edges: markDust(collapsedEdges), collapsed, netted: nettedCount }
}
