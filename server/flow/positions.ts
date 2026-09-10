import { assetKey } from './assets'
import type { FlowEdge } from './build'

/** address -> assetKey -> net amount. Zero entries are pruned. */
export type Positions = Map<string, Map<string, bigint>>

function add(positions: Positions, address: string, key: string, delta: bigint): void {
  const assets = positions.get(address) ?? new Map<string, bigint>()
  assets.set(key, (assets.get(key) ?? 0n) + delta)
  positions.set(address, assets)
}

export function netPositions(edges: FlowEdge[]): Positions {
  const positions: Positions = new Map()
  for (const edge of edges) {
    const key = assetKey(edge.asset)
    add(positions, edge.from, key, -edge.amount)
    add(positions, edge.to, key, edge.amount)
  }
  return positions
}

/**
 * Compare two position maps, treating a missing entry and a zero entry as the
 * same thing. This is the check every reducer must survive: a reduction may
 * change the shape of the graph, never anyone's net.
 */
export function positionsEqual(left: Positions, right: Positions): boolean {
  const nonZero = (positions: Positions): Map<string, bigint> => {
    const flat = new Map<string, bigint>()
    for (const [address, assets] of positions) {
      for (const [key, amount] of assets) {
        if (amount !== 0n) flat.set(`${address}|${key}`, amount)
      }
    }
    return flat
  }

  const a = nonZero(left)
  const b = nonZero(right)
  if (a.size !== b.size) return false
  for (const [key, amount] of a) {
    if (b.get(key) !== amount) return false
  }
  return true
}
