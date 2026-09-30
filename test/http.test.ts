import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '~~/server/utils/http'
import { fakeHttp } from './helpers/fakeHttp'

describe('fakeHttp', () => {
  it('returns a configured route', async () => {
    const http = fakeHttp({ 'https://x.test/a': { hello: 'world' } })
    const result = await http.getJson<{ hello: string }>('https://x.test/a')
    expect(result).toEqual({ ok: true, data: { hello: 'world' } })
  })

  it('returns a 404-shaped failure for an unconfigured route', async () => {
    const http = fakeHttp({})
    const result = await http.getJson('https://x.test/missing')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('records the urls it was asked for', async () => {
    const http = fakeHttp({ 'https://x.test/a': {} })
    await http.getJson('https://x.test/a')
    await http.getJson('https://x.test/b')
    expect(http.calls).toEqual(['https://x.test/a', 'https://x.test/b'])
  })
})

describe('createHttpClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers })

  it('retries a rate-limited request once, honouring Retry-After', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(429, {}, { 'retry-after': '0.01' }))
      .mockResolvedValueOnce(reply(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetch)
    const result = await createHttpClient().getJson('https://x.test/a')
    expect(result).toEqual({ ok: true, data: { ok: 1 } })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry a real "not found"', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(404))
    vi.stubGlobal('fetch', fetch)
    const result = await createHttpClient().getJson('https://x.test/a')
    expect(result.ok).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
