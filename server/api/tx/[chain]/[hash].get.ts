import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeCallInput } from '~~/server/decode/calls'
import { decodeLogs } from '~~/server/decode/logs'
import { assetKey } from '~~/server/flow/assets'
import { buildFlow } from '~~/server/flow/build'
import { netPositions } from '~~/server/flow/positions'
import { reduceFlow } from '~~/server/flow/reduce'
import { narrate } from '~~/server/narrate/registry'
import { fetchUsdPrices } from '~~/server/prices/usd'
import { fetchAddressNames } from '~~/server/sources/blockscout'
import { fetchTransaction } from '~~/server/sources/registry'
import { applyTrace, fetchTraceCalls } from '~~/server/sources/trace'
import { createTokenResolver } from '~~/server/tokens/metadata'
import { createHttpClient } from '~~/server/utils/http'
import { bestEffortStore } from '~~/server/utils/store'
import { parseTxRef } from '~~/server/utils/txref'
import { toWire } from '~~/shared/wire'

/**
 * Bump whenever the payload shape or the decoding changes: old cached payloads
 * are then simply never read again, with no manual flush.
 */
const CACHE_VERSION = 12

export default defineEventHandler(async (event) => {
  const parsed = parseTxRef(getRouterParam(event, 'chain'), getRouterParam(event, 'hash'))
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.reason })
  }

  const { chain, hash } = parsed.ref
  const http = createHttpClient()
  const store = bestEffortStore(useStorage('txlens'))

  // A final transaction never changes, so its decoded result is valid forever.
  const cacheKey = `tx:v${CACHE_VERSION}:${chain.id}:${hash}`
  const cached = await store.getItem(cacheKey)
  if (cached) return cached as ReturnType<typeof toWire>

  let tx = await fetchTransaction(http, chain, hash)
  if (!tx) {
    throw createError({ statusCode: 404, statusMessage: 'transaction not found' })
  }

  // The indexer's internal-call list is missing or capped: ask a node for the
  // full execution trace instead. Only on demand, to stay inside free limits.
  if (tx.coverage.calls !== 'complete') {
    const traced = await fetchTraceCalls(http, chain, hash)
    if (traced) tx = applyTrace(tx, traced)
  }

  const resolver = createAbiResolver(http, chain)
  const [call, logs] = await Promise.all([
    decodeCallInput(tx.input, resolver, tx.to),
    decodeLogs(tx.logs, resolver),
  ])

  // Flow is built from the full edge list, then reduced for display. The
  // narrative reads the reduced list, because that is what the reader sees.
  const rawFlow = buildFlow(tx, logs)
  const { edges } = reduceFlow(rawFlow)

  // Participants that only appeared in a trace or a token event have no name
  // yet. Look them up, so the story says "Bybit Exploiter 1", not a hex string.
  const unnamed = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter(
    (a) => !tx.names[a]?.name && a !== '0x0000000000000000000000000000000000000000',
  )
  if (unnamed.length > 0) {
    const found = await fetchAddressNames(http, chain, unnamed)
    const names = { ...tx.names }
    for (const [address, info] of Object.entries(found)) {
      names[address] = {
        name: info.name ?? names[address]?.name ?? null,
        isContract: names[address]?.isContract ?? info.isContract,
      }
    }
    tx = { ...tx, names }
  }

  const tokenResolver = createTokenResolver(http, chain)
  const tokens = new Map(
    await Promise.all(
      [...new Set(edges.filter((e) => e.asset.kind !== 'native').map((e) => e.asset))].map(
        async (asset) => {
          const address = asset.kind === 'native' ? null : asset.address
          const meta = address ? await tokenResolver.forAddress(address) : null
          return [assetKey(asset), meta] as const
        },
      ),
    ).then((entries) =>
      entries.filter(
        (entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null,
      ),
    ),
  )

  // Priced before the story is written, so the narrative can rank who came
  // out ahead by value. Native is always priced: the network fee is paid in it.
  const { prices, complete: pricesComplete } = await fetchUsdPrices(
    http,
    store,
    chain,
    [{ kind: 'native' }, ...edges.map((edge) => edge.asset)],
    tx.timestamp,
  )

  const narrative = narrate({
    tx,
    logs,
    edges,
    positions: netPositions(edges),
    tokens,
    sender: tx.from,
    names: tx.names,
    prices,
  })

  const payload = toWire(tx, call, logs, { narrative, flow: edges, tokens, prices })

  // Freeze it only if nothing about it could change or improve: past the reorg
  // depth, every page read, and the price lookup succeeded. Caching a transient
  // failure would make it permanent.
  const final =
    tx.confirmations >= chain.reorgDepth &&
    tx.coverage.logs === 'complete' &&
    tx.coverage.calls === 'complete' &&
    pricesComplete
  if (final) await store.setItem(cacheKey, payload)

  return payload
})
