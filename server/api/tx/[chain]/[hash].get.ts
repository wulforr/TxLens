import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeCallInput } from '~~/server/decode/calls'
import { decodeLogs } from '~~/server/decode/logs'
import { assetKey } from '~~/server/flow/assets'
import { buildFlow } from '~~/server/flow/build'
import { netPositions } from '~~/server/flow/positions'
import { reduceFlow } from '~~/server/flow/reduce'
import { narrate } from '~~/server/narrate/registry'
import { fetchTransaction } from '~~/server/sources/registry'
import { createTokenResolver } from '~~/server/tokens/metadata'
import { createHttpClient } from '~~/server/utils/http'
import { parseTxRef } from '~~/server/utils/txref'
import { toWire } from '~~/shared/wire'

export default defineEventHandler(async (event) => {
  const parsed = parseTxRef(getRouterParam(event, 'chain'), getRouterParam(event, 'hash'))
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.reason })
  }

  const { chain, hash } = parsed.ref
  const http = createHttpClient()

  const tx = await fetchTransaction(http, chain, hash)
  if (!tx) {
    throw createError({ statusCode: 404, statusMessage: 'transaction not found' })
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

  const narrative = narrate({
    tx,
    logs,
    edges,
    positions: netPositions(edges),
    tokens,
    sender: tx.from,
  })

  return toWire(tx, call, logs, { narrative, flow: edges, tokens })
})
