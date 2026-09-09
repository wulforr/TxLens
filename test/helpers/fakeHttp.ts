import type { HttpClient, HttpResult } from '~~/server/utils/http'

export interface FakeHttpClient extends HttpClient {
  calls: string[]
}

/**
 * An HttpClient backed by a url -> payload map.
 * An unconfigured url fails as a 404 rather than throwing, because that is
 * what the resolution ladders are built to handle.
 */
export function fakeHttp(routes: Record<string, unknown>): FakeHttpClient {
  const calls: string[] = []
  return {
    calls,
    async getJson<T>(url: string): Promise<HttpResult<T>> {
      calls.push(url)
      if (!(url in routes)) {
        return { ok: false, status: 404, reason: 'http 404' }
      }
      return { ok: true, data: routes[url] as T }
    },
  }
}
