import { type AssetRef, assetKey } from '~~/server/flow/assets'
import type { HttpClient } from '~~/server/utils/http'
import type { KeyValueStore } from '~~/server/utils/store'
import type { ChainConfig } from '~~/shared/chains'

/**
 * Below this, DefiLlama itself is unsure of the price — typically a thin or
 * manipulated market. Showing no dollar value beats showing a fabricated one,
 * which is exactly what a scam token would want.
 */
export const MIN_CONFIDENCE = 0.9

interface LlamaResponse {
  coins: Record<string, { price?: number; confidence?: number }>
}

interface CachedPrice {
  /** null records "no price exists", so an unpriced token isn't re-requested all day. */
  price: number | null
}

export function utcDay(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function priceId(asset: AssetRef, chain: ChainConfig): string | null {
  if (asset.kind === 'native') return chain.nativePriceId
  if (asset.kind === 'erc20') return `${chain.pricePrefix}:${asset.address}`
  return null // NFTs have no fungible price
}

/**
 * USD per whole unit of each asset, on the transaction's UTC day.
 *
 * One price per token per day: the cache is keyed by day, so every transaction
 * from the same day shares one lookup — which is what keeps this on DefiLlama's
 * free, keyless tier. `complete` is false when the API failed for anything we
 * still needed, so callers know not to freeze the result into a longer cache.
 */
export async function fetchUsdPrices(
  http: HttpClient,
  store: KeyValueStore,
  chain: ChainConfig,
  assets: AssetRef[],
  timestamp: number,
): Promise<{ prices: Map<string, number>; complete: boolean }> {
  const day = utcDay(timestamp)
  const prices = new Map<string, number>()
  const wanted = new Map<string, string[]>() // price id -> asset keys
  for (const asset of assets) {
    const id = priceId(asset, chain)
    if (!id) continue
    wanted.set(id, [...(wanted.get(id) ?? []), assetKey(asset)])
  }

  const record = (id: string, price: number | null) => {
    if (price === null) return
    for (const key of wanted.get(id) ?? []) prices.set(key, price)
  }

  const misses: string[] = []
  for (const id of wanted.keys()) {
    const cached = (await store.getItem(`usd:${day}:${id}`)) as CachedPrice | null
    if (cached && 'price' in cached) record(id, cached.price)
    else misses.push(id)
  }
  if (misses.length === 0) return { prices, complete: true }

  const result = await http.getJson<LlamaResponse>(
    `https://coins.llama.fi/prices/historical/${timestamp}/${misses.join(',')}`,
  )
  if (!result.ok) return { prices, complete: false }

  for (const id of misses) {
    const quote = result.data.coins?.[id]
    const price =
      quote &&
      typeof quote.price === 'number' &&
      Number.isFinite(quote.price) &&
      (quote.confidence ?? 0) >= MIN_CONFIDENCE
        ? quote.price
        : null
    await store.setItem(`usd:${day}:${id}`, { price } satisfies CachedPrice)
    record(id, price)
  }
  return { prices, complete: true }
}
