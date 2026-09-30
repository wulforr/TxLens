import { describe, expect, it } from 'vitest'
import { humanize } from '~~/shared/names'

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
