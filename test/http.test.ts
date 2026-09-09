import { describe, expect, it } from 'vitest'
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
