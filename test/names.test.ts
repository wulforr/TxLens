import { describe, expect, it } from 'vitest'
import { classifyTags, humanize } from '~~/shared/names'

describe('humanize', () => {
  it.each([
    ['TransitSwapRouterV5.1', 'Transit Swap Router V5.1'],
    ['NativeRFQPool', 'Native RFQ Pool'],
    ['PoolManager', 'Pool Manager'],
    ['CoinTool_App', 'Coin Tool App'],
    ['Uniswap V4: Pool Manager', 'Uniswap V4: Pool Manager'],
    ['alice.eth', 'alice.eth'],
    ['WETH9', 'WETH9'],
  ])('%s -> %s', (input, expected) => {
    expect(humanize(input)).toBe(expected)
  })
})

describe('classifyTags', () => {
  it('reads kinds from the explorer’s own categories', () => {
    expect(classifyTags([{ slug: 'dex', tagType: 'generic' }]).kind).toBe('exchange')
    expect(classifyTags([{ slug: 'aave', tagType: 'protocol' }]).kind).toBe('lending')
    expect(classifyTags([{ slug: 'uniswap-v4', tagType: 'protocol' }]).kind).toBe('exchange')
    // A stablecoin run by a lending protocol is still, to the reader, a stablecoin.
    expect(
      classifyTags([
        { slug: 'stablecoin', tagType: 'generic' },
        { slug: 'maker', tagType: 'protocol' },
      ]).kind,
    ).toBe('stablecoin')
  })

  it('flags an address only when a label says so', () => {
    expect(classifyTags([{ slug: 'phish--hack', tagType: 'generic' }]).flagged).toBe(true)
    expect(classifyTags([{ slug: 'euler-finance-exploiter-3', tagType: 'name' }]).flagged).toBe(
      true,
    )
    expect(classifyTags([{ slug: 'sanctioned', tagType: 'generic' }]).flagged).toBe(false)
    expect(classifyTags([{ slug: 'something-new', tagType: 'generic' }])).toEqual({
      kind: null,
      flagged: false,
    })
  })
})
