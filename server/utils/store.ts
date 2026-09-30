/** The slice of a key-value store this app needs. Nitro's useStorage() satisfies it. */
export interface KeyValueStore {
  getItem(key: string): Promise<unknown>
  setItem(key: string, value: unknown): Promise<void>
}

/**
 * Caching is an optimisation, never a dependency. A missing KV binding, a full
 * disk or a flaky driver must degrade to "no cache", not to a failed page.
 */
export function bestEffortStore(store: KeyValueStore): KeyValueStore {
  return {
    async getItem(key) {
      try {
        return await store.getItem(key)
      } catch {
        return null
      }
    },
    async setItem(key, value) {
      try {
        await store.setItem(key, value)
      } catch {
        // best effort: the page still works, it just recomputes next time
      }
    },
  }
}
