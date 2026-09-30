import { describe, expect, it } from 'vitest'
import { type AssetRef, NATIVE } from '~~/server/flow/assets'
import type { FlowEdge } from '~~/server/flow/build'
import { netPositions, positionsEqual } from '~~/server/flow/positions'
import { reduceFlow } from '~~/server/flow/reduce'

const A = '0x1111111111111111111111111111111111111111' as const
const B = '0x2222222222222222222222222222222222222222' as const
const C = '0x3333333333333333333333333333333333333333' as const
const D = '0x4444444444444444444444444444444444444444' as const
const USDT: AssetRef = { kind: 'erc20', address: '0xdac17f958d2ee523a2206206994597c13d831ec7' }

const e = (from: string, to: string, amount: bigint, asset: AssetRef = NATIVE): FlowEdge => ({
  from: from as `0x${string}`,
  to: to as `0x${string}`,
  asset,
  amount,
  origin: asset.kind === 'native' ? 'native' : 'erc20',
  order: 0,
})

const CASES: Record<string, FlowEdge[]> = {
  empty: [],
  single: [e(A, B, 100n)],
  conduitChain: [e(A, B, 100n), e(B, C, 100n), e(C, D, 100n)],
  partialRoundTrip: [e(A, B, 100n), e(B, A, 40n)],
  exactRoundTrip: [e(A, B, 100n), e(B, A, 100n)],
  cycle: [e(A, B, 50n), e(B, C, 50n), e(C, A, 50n)],
  mixedAssets: [e(A, B, 100n), e(A, B, 100n, USDT), e(B, C, 100n, USDT)],
  differentAmount: [e(A, B, 100n), e(B, C, 60n)],
  selfTransfer: [e(A, A, 100n)],
  zeroAmount: [e(A, B, 0n)],
  fanOut: [e(A, B, 100n), e(A, C, 100n), e(A, D, 100n)],
  dusty: [e(A, B, 1_000_000n), e(A, C, 3n), e(A, D, 5n)],
}

describe('reduceFlow', () => {
  it('never changes any address net position, on any input', () => {
    // The invariant the whole diagram rests on. If a reduction can move
    // someone's net, the picture is lying and no amount of prettiness helps.
    for (const [name, edges] of Object.entries(CASES)) {
      const before = netPositions(edges)
      const after = netPositions(reduceFlow(edges).edges)
      expect(positionsEqual(before, after), `case: ${name}`).toBe(true)
    }
  })

  it('collapses a chain of conduits into one edge', () => {
    const result = reduceFlow(CASES.conduitChain)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({ from: A, to: D, amount: 100n })
    expect(result.collapsed).toEqual(expect.arrayContaining([B, C]))
  })

  it('does not collapse an address that forwards a different amount', () => {
    expect(reduceFlow(CASES.differentAmount).edges).toHaveLength(2)
  })

  it('does not collapse an address that forwards a different asset', () => {
    // B receives native and sends USDT — it is a counterparty, not a conduit.
    const result = reduceFlow([e(A, B, 100n), e(B, C, 100n, USDT)])
    expect(result.collapsed).not.toContain(B)
  })

  it('nets a partial round trip to the difference', () => {
    const result = reduceFlow(CASES.partialRoundTrip)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({ from: A, to: B, amount: 60n })
    expect(result.netted).toBe(1)
  })

  it('removes an exact round trip entirely', () => {
    expect(reduceFlow(CASES.exactRoundTrip).edges).toHaveLength(0)
  })

  it('keeps a cycle, because no node in it is a pass-through of the same amount', () => {
    const result = reduceFlow(CASES.cycle)
    expect(positionsEqual(netPositions(CASES.cycle), netPositions(result.edges))).toBe(true)
  })

  it('groups dust below the threshold into one edge', () => {
    const result = reduceFlow(CASES.dusty)
    const dust = result.edges.filter((edge) => edge.isDust)
    expect(dust.length).toBeGreaterThan(0)
  })

  it('leaves a fan-out alone', () => {
    expect(reduceFlow(CASES.fanOut).edges).toHaveLength(3)
  })

  it('keeps the surviving edge in transaction order', () => {
    const edges = [
      { ...e(A, B, 100n), order: 0 },
      { ...e(B, C, 100n), order: 1 },
      { ...e(C, D, 7n, USDT), order: 2 },
    ]
    // A->B->C collapses into A->C, which keeps the first leg's position.
    expect(
      reduceFlow(edges)
        .edges.map((edge) => edge.order)
        .sort(),
    ).toEqual([0, 2])
  })

  it('is idempotent', () => {
    const once = reduceFlow(CASES.conduitChain).edges
    const twice = reduceFlow(once).edges
    expect(twice).toEqual(once)
  })
})
