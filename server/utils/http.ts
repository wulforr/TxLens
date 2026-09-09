export type HttpResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; reason: string }

export interface HttpClient {
  getJson<T>(url: string): Promise<HttpResult<T>>
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

  return {
    async getJson<T>(url: string): Promise<HttpResult<T>> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
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
    },
  }
}
