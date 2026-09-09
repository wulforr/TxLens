export type HttpResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; reason: string }

export interface HttpClient {
  getJson<T>(url: string): Promise<HttpResult<T>>
}

const DEFAULT_TIMEOUT_MS = 8_000

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
