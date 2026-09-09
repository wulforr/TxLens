import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeCallInput } from '~~/server/decode/calls'
import { decodeLogs } from '~~/server/decode/logs'
import { fetchTransaction } from '~~/server/sources/registry'
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

  return toWire(tx, call, logs)
})
