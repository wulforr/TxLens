import { describe, expect, it } from 'vitest'
import { NATIVE } from '~~/server/flow/assets'
import type { FlowEdge } from '~~/server/flow/build'
import { netPositions, positionsEqual } from '~~/server/flow/positions'

const a = '0x1111111111111111111111111111111111111111' as const
const b = '0x2222222222222222222222222222222222222222' as const
const c = '0x3333333333333333333333333333333333333333' as const

const edge = (from: string, to: string, amount: bigint): FlowEdge => ({
  from: from as `0x${string}`,
  to: to as `0x${string}`,
  asset: NATIVE,
  amount,
  origin: 'native',
  order: 0,
})

describe('netPositions', () => {
  it('debits the sender and credits the recipient equally', () => {
    const p = netPositions([edge(a, b, 100n)])
    expect(p.get(a)?.get('native')).toBe(-100n)
    expect(p.get(b)?.get('native')).toBe(100n)
  })

  it('sums to zero across every address for an asset', () => {
    const p = netPositions([edge(a, b, 100n), edge(b, c, 40n), edge(c, a, 15n)])
    let total = 0n
    for (const assets of p.values()) total += assets.get('native') ?? 0n
    expect(total).toBe(0n)
  })

  it('nets a self-transfer to zero', () => {
    expect(
      netPositions([edge(a, a, 100n)])
        .get(a)
        ?.get('native'),
    ).toBe(0n)
  })
})

describe('positionsEqual', () => {
  it('is true for structurally different lists with the same nets', () => {
    // One hop of 100 vs two hops of 100 through a conduit: b nets zero either way.
    const direct = netPositions([edge(a, c, 100n)])
    const viaB = netPositions([edge(a, b, 100n), edge(b, c, 100n)])
    expect(positionsEqual(direct, viaB)).toBe(true)
  })

  it('is false when any net differs', () => {
    expect(positionsEqual(netPositions([edge(a, b, 100n)]), netPositions([edge(a, b, 99n)]))).toBe(
      false,
    )
  })

  it('ignores addresses whose net is zero on both sides', () => {
    expect(positionsEqual(netPositions([]), netPositions([edge(a, a, 5n)]))).toBe(true)
  })
})
