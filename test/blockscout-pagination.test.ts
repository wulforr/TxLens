import { describe, expect, it } from 'vitest'
import { fetchPagedItems, MAX_PAGES } from '~~/server/sources/blockscout'
import { fakeHttp } from './helpers/fakeHttp'

const url = 'https://x.test/items'

function page(items: number[], next: Record<string, unknown> | null) {
  return { items: items.map((n) => ({ n })), next_page_params: next }
}

describe('fetchPagedItems', () => {
  it('returns a single page when there is no continuation', async () => {
    const http = fakeHttp({ [url]: page([1, 2], null) })
    const result = await fetchPagedItems<{ n: number }>(http, url)
    expect(result.items.map((i) => i.n)).toEqual([1, 2])
    expect(result.truncated).toBe(false)
    expect(http.calls).toHaveLength(1)
  })

  it('follows next_page_params and concatenates in order', async () => {
    const http = fakeHttp({
      [url]: page([1, 2], { index: 2 }),
      [`${url}?index=2`]: page([3, 4], null),
    })
    const result = await fetchPagedItems<{ n: number }>(http, url)
    expect(result.items.map((i) => i.n)).toEqual([1, 2, 3, 4])
    expect(result.truncated).toBe(false)
  })

  it('encodes multiple continuation params', async () => {
    const http = fakeHttp({
      [url]: page([1], { index: 2, block_number: 500 }),
      [`${url}?index=2&block_number=500`]: page([2], null),
    })
    const result = await fetchPagedItems<{ n: number }>(http, url)
    expect(result.items).toHaveLength(2)
  })

  it('drops null continuation params rather than sending the string "null"', async () => {
    const http = fakeHttp({
      [url]: page([1], { index: 2, items_count: null }),
      [`${url}?index=2`]: page([2], null),
    })
    const result = await fetchPagedItems<{ n: number }>(http, url)
    expect(result.items).toHaveLength(2)
  })

  it('stops at the page cap and reports truncation', async () => {
    const routes: Record<string, unknown> = { [url]: page([0], { index: 0 }) }
    for (let i = 0; i < MAX_PAGES + 2; i++) {
      routes[`${url}?index=${i}`] = page([i + 1], { index: i + 1 })
    }
    const result = await fetchPagedItems<{ n: number }>(fakeHttp(routes), url)
    expect(result.truncated).toBe(true)
    expect(result.items.length).toBeLessThanOrEqual(MAX_PAGES)
  })

  it('keeps what it has and reports truncation when a later page fails', async () => {
    const http = fakeHttp({ [url]: page([1, 2], { index: 2 }) })
    const result = await fetchPagedItems<{ n: number }>(http, url)
    expect(result.items.map((i) => i.n)).toEqual([1, 2])
    expect(result.truncated).toBe(true)
  })

  it('reports a first-page failure as failed, not as truncated-empty', async () => {
    // "the request failed" and "there is no data" must stay distinguishable:
    // a transient upstream error silently reading as "no internal calls" is
    // exactly the bug this test exists to prevent.
    const result = await fetchPagedItems<{ n: number }>(fakeHttp({}), url)
    expect(result.items).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.failed).toBe(true)
  })

  it('marks a successful read as not failed', async () => {
    const http = fakeHttp({ [url]: page([1], null) })
    expect((await fetchPagedItems<{ n: number }>(http, url)).failed).toBe(false)
  })
})
