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

export function createHttpClient(options: { timeoutMs?: number } = {}): HttpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request<T>(url: string, init: RequestInit): Promise<HttpResult<T>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        return { ok: false, status: response.status, reason: `http ${response.status}` }
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
