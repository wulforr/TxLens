import { describe, expect, it } from 'vitest'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { MAX_NODES, nodeId, toSankeyModel } from '~~/shared/sankey'
import type { WireFlowEdge } from '~~/shared/wire'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const C = '0x3333333333333333333333333333333333333333'
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7'

const tokens: Record<string, TokenMeta> = {
  [`erc20:${USDT}`]: {
    address: USDT as `0x${string}`,
    symbol: 'USDT',
    name: 'Tether',
    decimals: 6,
    standard: 'ERC-20',
    iconUrl: 'https://assets.example/usdt.png',
  },
}

const edge = (from: string, to: string, amount: string, erc20 = true): WireFlowEdge =>
  ({
    from: from as `0x${string}`,
    to: to as `0x${string}`,
    asset: erc20 ? { kind: 'erc20', address: USDT as `0x${string}` } : { kind: 'native' },
    assetKey: erc20 ? `erc20:${USDT}` : 'native',
    amount,
    origin: erc20 ? 'erc20' : 'native',
  }) as WireFlowEdge

describe('toSankeyModel', () => {
  it('keys nodes by address and asset together', () => {
    const model = toSankeyModel([edge(A, B, '100'), edge(B, C, '100')], tokens, A)
    expect(model.nodes.map((n) => n.address).sort()).toEqual([A, B, C].sort())
    expect(model.nodes.every((n) => n.id.includes('|'))).toBe(true)
  })

  it('gives one address two nodes when it handles two assets', () => {
    // B receives USDT and sends ETH. As a single node that would close a loop
    // with anything flowing back; split per asset it stays acyclic.
    const model = toSankeyModel([edge(A, B, '100'), edge(B, C, '50', false)], tokens, A)
    expect(model.nodes.filter((n) => n.address === B)).toHaveLength(2)
  })

  it('keeps a swap round trip intact rather than breaking it as a cycle', () => {
    // A -> B in USDT, B -> A in ETH. Address-keyed this is a cycle and one leg
    // would be deleted; asset-keyed both legs survive, which is the point.
    const model = toSankeyModel([edge(A, B, '100'), edge(B, A, '50', false)], tokens, A)
    expect(model.omitted).toHaveLength(0)
    expect(model.links).toHaveLength(2)
  })

  it('marks the sender', () => {
    const model = toSankeyModel([edge(A, B, '100')], tokens, A)
    expect(model.nodes.find((n) => n.address === A)?.isSender).toBe(true)
    expect(model.nodes.find((n) => n.address === B)?.isSender).toBe(false)
  })

  it('labels every link with a formatted amount and symbol', () => {
    const model = toSankeyModel([edge(A, B, '935118160')], tokens, A)
    expect(model.links[0].amountText).toBe('935.11816 USDT')
    expect(model.links[0].symbol).toBe('USDT')
    expect(model.links[0].iconUrl).toBe('https://assets.example/usdt.png')
  })

  it('computes share within an asset, not across assets', () => {
    // 75/25 of USDT, plus a native edge that must not affect those shares.
    const model = toSankeyModel(
      [edge(A, B, '75'), edge(A, C, '25'), edge(A, B, '1000000000000000000', false)],
      tokens,
      A,
    )
    const usdt = model.links.filter((l) => l.assetKey !== 'native')
    expect(usdt.map((l) => l.share).sort()).toEqual([0.25, 0.75])
    expect(model.links.find((l) => l.assetKey === 'native')?.share).toBe(1)
  })

  it('drops zero-amount and self edges, which cannot be drawn', () => {
    const model = toSankeyModel([edge(A, A, '100'), edge(A, B, '0')], tokens, A)
    expect(model.links).toHaveLength(0)
  })

  it('breaks a cycle so the layout terminates, and reports what it removed', () => {
    // d3-sankey loops forever on a cycle. Dropping an edge silently would make
    // the picture wrong; dropping the smallest and listing it does not.
    const model = toSankeyModel([edge(A, B, '100'), edge(B, C, '90'), edge(C, A, '5')], tokens, A)
    expect(model.omitted).toHaveLength(1)
    expect(model.omitted[0].source).toBe(nodeId(C, `erc20:${USDT}`))
    expect(model.links).toHaveLength(2)
  })

  it('keeps an acyclic graph intact', () => {
    const model = toSankeyModel([edge(A, B, '100'), edge(B, C, '100')], tokens, A)
    expect(model.omitted).toHaveLength(0)
  })

  it('lists the distinct assets involved', () => {
    const model = toSankeyModel([edge(A, B, '100'), edge(A, C, '5', false)], tokens, A)
    expect(model.assets.map((a) => a.symbol).sort()).toEqual(['ETH', 'USDT'])
  })

  it('flags a graph too large to draw rather than drawing it badly', () => {
    const many: WireFlowEdge[] = []
    for (let i = 0; i < MAX_NODES + 5; i++) {
      many.push(
        edge(`0x${String(i).padStart(40, '0')}`, `0x${String(i + 1).padStart(40, '0')}`, '10'),
      )
    }
    expect(toSankeyModel(many, tokens, A).tooComplex).toBe(true)
  })

  it('falls back to a truncated address when a token is unknown', () => {
    const model = toSankeyModel([edge(A, B, '100')], {}, A)
    expect(model.links[0].symbol).toBe('?')
    expect(model.links[0].amountText).toContain('raw units')
  })
})
