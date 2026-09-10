import { describe, expect, it } from 'vitest'
import { createTokenResolver } from '~~/server/tokens/metadata'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const usdt = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const unknownToken = '0x32708538a107253b51a735a724330a23106ca4ca'
const nft = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'

const tokenUrl = (a: string) => `${chain.blockscoutBase}/api/v2/tokens/${a}`

describe('createTokenResolver', () => {
  it('uses the label pack for symbol and decimals even with upstream down', async () => {
    const meta = await createTokenResolver(fakeHttp({}), chain).forAddress(usdt)
    expect(meta.symbol).toBe('USDT')
    expect(meta.decimals).toBe(6)
    expect(meta.iconUrl).toBeNull()
  })

  it('enriches a curated token with an upstream icon without trusting its decimals', async () => {
    // Upstream says 99 decimals, which is wrong. The curated value must win;
    // only the decorative icon is taken from the network.
    const http = fakeHttp({
      [tokenUrl(usdt)]: {
        name: 'Wrong',
        symbol: 'WRONG',
        decimals: '99',
        type: 'ERC-20',
        icon_url: 'https://assets.example/tether.png',
      },
    })
    const meta = await createTokenResolver(http, chain).forAddress(usdt)
    expect(meta.symbol).toBe('USDT')
    expect(meta.decimals).toBe(6)
    expect(meta.iconUrl).toBe('https://assets.example/tether.png')
  })

  it('parses blockscout decimals, which arrive as a string', async () => {
    const http = fakeHttp({
      [tokenUrl(unknownToken)]: { name: '01', symbol: '01', decimals: '18', type: 'ERC-20' },
    })
    const meta = await createTokenResolver(http, chain).forAddress(unknownToken)
    expect(meta.decimals).toBe(18)
    expect(typeof meta.decimals).toBe('number')
    expect(meta.symbol).toBe('01')
    expect(meta.standard).toBe('ERC-20')
  })

  it('keeps decimals null for an erc-721 rather than defaulting to 18', async () => {
    // Coercing a null to 18 would render token id 4023 as 0.000000000000004023.
    const http = fakeHttp({
      [tokenUrl(nft)]: {
        name: 'BoredApeYachtClub',
        symbol: 'BAYC',
        decimals: null,
        type: 'ERC-721',
      },
    })
    const meta = await createTokenResolver(http, chain).forAddress(nft)
    expect(meta.decimals).toBeNull()
    expect(meta.standard).toBe('ERC-721')
  })

  it('returns an unknown token rather than throwing', async () => {
    const meta = await createTokenResolver(fakeHttp({}), chain).forAddress(unknownToken)
    expect(meta).toEqual({
      address: unknownToken,
      symbol: null,
      name: null,
      decimals: null,
      standard: 'unknown',
      iconUrl: null,
    })
  })

  it('treats a non-numeric decimals value as unknown', async () => {
    const http = fakeHttp({
      [tokenUrl(unknownToken)]: { name: 'Weird', symbol: 'WRD', decimals: 'many', type: 'ERC-20' },
    })
    expect((await createTokenResolver(http, chain).forAddress(unknownToken)).decimals).toBeNull()
  })

  it('surfaces an https icon url', async () => {
    const http = fakeHttp({
      [tokenUrl(unknownToken)]: {
        name: 'Tether',
        symbol: 'USDT',
        decimals: '6',
        type: 'ERC-20',
        icon_url: 'https://assets.example/tether.png',
      },
    })
    expect((await createTokenResolver(http, chain).forAddress(unknownToken)).iconUrl).toBe(
      'https://assets.example/tether.png',
    )
  })

  it('drops a non-https icon url rather than rendering mixed content', async () => {
    const http = fakeHttp({
      [tokenUrl(unknownToken)]: {
        name: 'X',
        symbol: 'X',
        decimals: '18',
        type: 'ERC-20',
        icon_url: 'http://insecure.example/x.png',
      },
    })
    expect((await createTokenResolver(http, chain).forAddress(unknownToken)).iconUrl).toBeNull()
  })

  it('memoises repeated lookups', async () => {
    const http = fakeHttp({
      [tokenUrl(unknownToken)]: { name: '01', symbol: '01', decimals: '18', type: 'ERC-20' },
    })
    const resolver = createTokenResolver(http, chain)
    await resolver.forAddress(unknownToken)
    await resolver.forAddress(unknownToken.toUpperCase().replace('0X', '0x'))
    expect(http.calls).toHaveLength(1)
  })
})
