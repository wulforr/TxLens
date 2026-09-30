import { describe, expect, it } from 'vitest'
import type { AssetRef } from '~~/server/flow/assets'
import { fetchUsdPrices, utcDay } from '~~/server/prices/usd'
import { bestEffortStore, type KeyValueStore } from '~~/server/utils/store'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7' as const
const COIN = '0x32708538a107253b51a735a724330a23106ca4ca' as const
const usdt: AssetRef = { kind: 'erc20', address: USDT }
const coin: AssetRef = { kind: 'erc20', address: COIN }
const eth: AssetRef = { kind: 'native' }
const TS = 1768473000 // 2026-01-15T10:30:00Z

function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    async getItem(key) {
      return data.get(key) ?? null
    },
    async setItem(key, value) {
      data.set(key, value)
    },
  }
}

const url = (ids: string[]) => `https://coins.llama.fi/prices/historical/${TS}/${ids.join(',')}`
const quote = (price: number, confidence = 0.99) => ({ price, confidence, timestamp: TS })

describe('fetchUsdPrices', () => {
  it('fetches missing prices in one batched request, keyed by asset', async () => {
    const http = fakeHttp({
      [url([`ethereum:${USDT}`, 'coingecko:ethereum'])]: {
        coins: { [`ethereum:${USDT}`]: quote(0.9997), 'coingecko:ethereum': quote(3365.39) },
      },
    })
    const { prices, complete } = await fetchUsdPrices(http, memoryStore(), chain, [usdt, eth], TS)
    expect(prices.get(`erc20:${USDT}`)).toBe(0.9997)
    expect(prices.get('native')).toBe(3365.39)
    expect(complete).toBe(true)
    expect(http.calls).toHaveLength(1)
  })

  it('serves the same day from cache without touching the network', async () => {
    const store = memoryStore()
    const first = fakeHttp({
      [url([`ethereum:${USDT}`])]: { coins: { [`ethereum:${USDT}`]: quote(1) } },
    })
    await fetchUsdPrices(first, store, chain, [usdt], TS)
    const second = fakeHttp({})
    const { prices } = await fetchUsdPrices(second, store, chain, [usdt], TS + 3600)
    expect(prices.get(`erc20:${USDT}`)).toBe(1)
    expect(second.calls).toHaveLength(0)
  })

  it('keys the cache by UTC day', async () => {
    const store = memoryStore()
    const http = fakeHttp({
      [url([`ethereum:${USDT}`])]: { coins: { [`ethereum:${USDT}`]: quote(1) } },
    })
    await fetchUsdPrices(http, store, chain, [usdt], TS)
    expect([...store.data.keys()]).toEqual([`usd:2026-01-15:ethereum:${USDT}`])
    expect(utcDay(TS)).toBe('2026-01-15')
  })

  it('remembers that a token has no price, so it is not re-requested all day', async () => {
    const store = memoryStore()
    const first = fakeHttp({ [url([`ethereum:${COIN}`])]: { coins: {} } })
    const { prices } = await fetchUsdPrices(first, store, chain, [coin], TS)
    expect(prices.has(`erc20:${COIN}`)).toBe(false)
    const second = fakeHttp({})
    await fetchUsdPrices(second, store, chain, [coin], TS)
    expect(second.calls).toHaveLength(0)
  })

  it('drops a low-confidence price rather than showing a wrong one', async () => {
    const http = fakeHttp({
      [url([`ethereum:${COIN}`])]: { coins: { [`ethereum:${COIN}`]: quote(42, 0.5) } },
    })
    const { prices } = await fetchUsdPrices(http, memoryStore(), chain, [coin], TS)
    expect(prices.has(`erc20:${COIN}`)).toBe(false)
  })

  it('accepts a price that carries no confidence score, as older quotes do', async () => {
    // DefiLlama omits `confidence` on historical coingecko-sourced quotes. A
    // missing score means "not flagged", not "untrustworthy".
    const http = fakeHttp({
      [url(['coingecko:ethereum'])]: { coins: { 'coingecko:ethereum': { price: 2963.2 } } },
    })
    const { prices } = await fetchUsdPrices(http, memoryStore(), chain, [eth], TS)
    expect(prices.get('native')).toBe(2963.2)
  })

  it('survives the price api being down, and does not cache the failure', async () => {
    const store = memoryStore()
    const down = fakeHttp({}) // every url 404s
    const { prices, complete } = await fetchUsdPrices(down, store, chain, [usdt], TS)
    expect(prices.size).toBe(0)
    expect(complete).toBe(false)
    expect(store.data.size).toBe(0)
    const up = fakeHttp({
      [url([`ethereum:${USDT}`])]: { coins: { [`ethereum:${USDT}`]: quote(1) } },
    })
    expect((await fetchUsdPrices(up, store, chain, [usdt], TS)).prices.get(`erc20:${USDT}`)).toBe(1)
  })

  it('still returns cached prices when the api fails for the rest', async () => {
    const store = memoryStore()
    await store.setItem(`usd:2026-01-15:ethereum:${USDT}`, { price: 1 })
    const { prices, complete } = await fetchUsdPrices(fakeHttp({}), store, chain, [usdt, eth], TS)
    expect(prices.get(`erc20:${USDT}`)).toBe(1)
    expect(complete).toBe(false)
  })

  it('never prices an nft, and makes no request when nothing is priceable', async () => {
    const http = fakeHttp({})
    const nft: AssetRef = { kind: 'nft', address: COIN, tokenId: '1' }
    const { prices, complete } = await fetchUsdPrices(http, memoryStore(), chain, [nft], TS)
    expect(prices.size).toBe(0)
    expect(complete).toBe(true)
    expect(http.calls).toHaveLength(0)
  })
})

describe('bestEffortStore', () => {
  it('turns a broken store into cache misses instead of errors', async () => {
    const broken: KeyValueStore = {
      async getItem() {
        throw new Error('no KV binding')
      },
      async setItem() {
        throw new Error('no KV binding')
      },
    }
    const store = bestEffortStore(broken)
    expect(await store.getItem('x')).toBeNull()
    await expect(store.setItem('x', 1)).resolves.toBeUndefined()
  })
})
