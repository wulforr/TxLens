export type HttpResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; reason: string }

export interface HttpClient {
  getJson<T>(url: string): Promise<HttpResult<T>>
  postJson<T>(url: string, body: unknown): Promise<HttpResult<T>>
}

/**
 * Cap how long one caller is willing to wait, independent of the client's own
 * timeout. Some upstream endpoints hang rather than fail; this turns a hang
 * into an ordinary miss so a faster fallback can take over.
 */
export function withTimeout(http: HttpClient, ms: number): HttpClient {
  const race = <T>(request: Promise<HttpResult<T>>): Promise<HttpResult<T>> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<HttpResult<T>>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, status: null, reason: 'timeout' }), ms)
    })
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer))
  }
  return {
    getJson: (url) => race(http.getJson(url)),
    postJson: (url, body) => race(http.postJson(url, body)),
  }
}

/**
 * Public Blockscout takes 5-8 seconds to answer `/logs` and
 * `/internal-transactions` for a heavy transaction, and this client fires both
 * at once. At the original 8s both aborted intermittently, and the honest
 * degradation path turned a complete transaction into `logs only` at random.
 * Measured against eth.blockscout.com on 2026-09-10.
 */
const DEFAULT_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 800
const MAX_RETRY_DELAY_MS = 3_000

export function createHttpClient(options: { timeoutMs?: number } = {}): HttpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Free public APIs rate-limit in bursts. One retry after a short pause turns
  // most 429s and 5xx blips into answers; more would only pile onto the limit.
  async function request<T>(url: string, init: RequestInit): Promise<HttpResult<T>> {
    const first = await attempt<T>(url, init)
    if (first.ok || !(first.status === null || first.status === 429 || first.status >= 500))
      return first
    await new Promise((resolve) => setTimeout(resolve, first.retryAfterMs ?? RETRY_DELAY_MS))
    return attempt<T>(url, init)
  }

  async function attempt<T>(
    url: string,
    init: RequestInit,
  ): Promise<HttpResult<T> & { retryAfterMs?: number }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'))
        return {
          ok: false,
          status: response.status,
          reason: `http ${response.status}`,
          retryAfterMs:
            retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS) : undefined,
        }
      }
      return { ok: true, data: (await response.json()) as T }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'request failed'
      return { ok: false, status: null, reason }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    getJson: <T>(url: string) => request<T>(url, { headers: { accept: 'application/json' } }),
    postJson: <T>(url: string, body: unknown) =>
      request<T>(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  }
}
