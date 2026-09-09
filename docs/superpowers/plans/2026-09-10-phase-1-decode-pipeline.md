# TxLens Phase 1: Decode Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste an Ethereum transaction hash and see its decoded call activity, with the data source's quality declared on screen.

**Architecture:** A Nitro server route fetches a transaction from a layered set of upstream sources, resolves an ABI per touched address through a fallback ladder, decodes calls and logs with viem, and returns one typed JSON payload. A Vue page renders it. Every module that transforms data is pure and fixture-tested; the route only orchestrates.

**Tech Stack:** Nuxt (Vue 3, Nitro) · TypeScript strict · viem · Vitest · Biome · Cloudflare Pages

**Resolved versions (Task 1, 2026-09-10):** Nuxt 4.5.2 · Vue 3.5.42 · Nitro 2.13.4 · vue-router 5.3.1 · viem 2.56.3 · TypeScript 5.9.3 (pinned — see note) · Vitest 5.0.0 · Biome 2.5.12 · vue-tsc 3.3.11 · Node 24.11.0 · pnpm 10.28.0.
**Directory layout:** Nuxt 4 — client code lives under `app/` (`app/app.vue`, `app/pages/`, `app/components/`); `server/` and `shared/` sit at the repo root. This matches the plan's file structure as written.

**Spec:** `docs/SPEC.md` — read it alongside this plan. Sections 4, 5 and 9 are normative for this phase.

**Covers:** Spec milestones M0, M1, M2, M3.
**Explicitly out of scope for this phase:** value graph and Sankey (M4–M5), narrative engine (M6), caching (M7), landing page polish (M8), multi-chain (M9), gas breakdown (M10).

## Global Constraints

Copied from `docs/SPEC.md` and `CLAUDE.md`. Every task inherits these.

- **Read-only. No wallet connection, ever.** No wagmi, no walletconnect, no `window.ethereum`.
- **No LLM anywhere.** No model SDKs in `package.json`.
- **The client never talks to an RPC or upstream API.** All upstream calls go through Nitro server routes.
- **Always declare data provenance.** Any response derived from a degraded source is labelled as such, in the payload and in the UI.
- **Contract-supplied strings are hostile input.** Token names, symbols, revert reasons: escaped, never `v-html`, length-capped at 64 characters for display.
- **TypeScript `strict: true`.** No `any` without an adjacent comment justifying it.
- **Visual direction:** instrument panel — dark slate, tabular numerals, mono for hashes. Do not import styling from sibling projects in the parent folder.
- **Node 20+**, pnpm.

## Interface conventions used throughout

- `Hex` means viem's `` `0x${string}` `` template type. Import from `viem`, never redefine.
- All on-chain integers cross module boundaries as `bigint`, and are serialised at the API edge as decimal **strings**. Never `number`.
- Addresses are stored lowercased. Use `normaliseAddress()` from Task 2 at every boundary.
- Every module that reaches the network takes an `HttpClient` (Task 5) as an argument. No module calls global `fetch` directly. This is what makes the suite network-free.

## File structure

```
shared/
  types.ts            domain model, shared by server and client
  chains.ts           chain registry
  address.ts          address normalisation + truncation
server/
  utils/
    http.ts           HttpClient interface + real implementation
    txref.ts          request validation
  sources/
    blockscout.ts     Blockscout v2 adapter
    registry.ts       ordered source list, provenance tagging
  abi/
    labelpack.ts      curated local ABIs and address labels
    labelpack.data.ts the curated data itself
    remote.ts         Sourcify + Blockscout verified-source lookups
    proxy.ts          EIP-1967 / EIP-1822 implementation detection
    resolve.ts        the resolution ladder
  decode/
    calls.ts          call input -> decoded function
    logs.ts           log -> decoded event
  api/
    tx/[chain]/[hash].get.ts
app/
  pages/index.vue
  pages/tx/[chain]/[hash].vue
  components/CallActivity.vue
  components/CallRow.vue
  components/ProvenanceChip.vue
  components/HashInput.vue
test/
  fixtures/blockscout/*.json
  helpers/fakeHttp.ts
```

---

### Task 1: Scaffold, tooling, CI, and a deployed shell

**Files:**
- Create: the Nuxt project, `biome.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.gitignore`, `LICENSE`, `README.md`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and a live Cloudflare Pages URL.

- [ ] **Step 1: Scaffold Nuxt**

Run in the repo root (the repo already contains `CLAUDE.md` and `docs/`, so scaffold in place):

```bash
pnpm dlx nuxi@latest init . --packageManager pnpm --gitInit false --force
```

Record the resolved Nuxt and Vue major versions in this plan's Tech Stack line once known. Do not assume a major version; the directory layout differs between Nuxt 3 and 4, and later tasks reference `app/` — if the scaffold produced a flat layout instead, keep the scaffold's layout and adjust paths consistently.

- [ ] **Step 2: Install dependencies**

```bash
pnpm add viem
pnpm add -D vitest @biomejs/biome typescript vue-tsc
```

- [ ] **Step 3: Enable TypeScript strict mode**

In `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  typescript: { strict: true, typeCheck: false },
  nitro: { preset: 'cloudflare-pages' },
  devtools: { enabled: true },
})
```

`typeCheck: false` keeps dev fast; CI runs `vue-tsc` separately.

- [ ] **Step 4: Add vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
```

- [ ] **Step 5: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "vue-tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write ."
  }
}
```

- [ ] **Step 6: Write the smoke test**

Create `test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs typescript with bigint literals', () => {
    const value = 10n ** 18n
    expect(value.toString()).toBe('1000000000000000000')
  })
})
```

- [ ] **Step 7: Run the test to verify the toolchain**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 8: Configure Biome**

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": { "includes": ["**", "!**/.nuxt", "!**/.output", "!**/dist", "!**/node_modules"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

If the installed Biome major version rejects this schema, run `pnpm biome migrate --write` and keep the result.

- [ ] **Step 9: Add CI**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 10: Verify everything passes locally**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all four succeed. Fix any scaffold lint violations now rather than carrying them.

- [ ] **Step 11: Write the README stub**

Create `README.md`:

```markdown
# TxLens

Paste an EVM transaction hash. Get the call activity decoded, the token flows
diagrammed, and the gas accounted for.

Read-only. No wallet connection, ever.

- Design spec: [`docs/SPEC.md`](docs/SPEC.md)
- Working rules: [`CLAUDE.md`](CLAUDE.md)

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm test        # vitest, no network
pnpm typecheck
pnpm lint
```

## Licence

MIT
```

- [ ] **Step 12: Add MIT LICENSE**

Create `LICENSE` with the standard MIT text, copyright `2026 Shaurya Singh`.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold nuxt app with vitest, biome, and CI"
```

- [ ] **Step 14: Deploy the shell to Cloudflare Pages**

Connect the repo in the Cloudflare dashboard: build command `pnpm build`, output directory `dist`, Node 20. Push and confirm a live URL serves the default page.

Record the URL in `README.md` under the title, then commit:

```bash
git add README.md
git commit -m "docs: add live URL"
```

---

### Task 2: Domain types and address helpers

**Files:**
- Create: `shared/types.ts`, `shared/address.ts`
- Test: `test/address.test.ts`

**Interfaces:**
- Consumes: `Hex`, `Address` from `viem`.
- Produces:
  - `type TraceProvenance = 'callTracer' | 'internalTransactions' | 'logsOnly'`
  - `type CallActivity = { kind: 'tree'; root: RawCall } | { kind: 'flat'; calls: FlatCall[] } | { kind: 'none' }`
  - `interface RawTransaction`, `RawLog`, `RawCall`, `FlatCall`
  - `normaliseAddress(value: string): Address`
  - `truncateAddress(value: string, lead?: number, tail?: number): string`

- [ ] **Step 1: Write the failing test for address helpers**

Create `test/address.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normaliseAddress, truncateAddress } from '~~/shared/address'

describe('normaliseAddress', () => {
  it('lowercases a checksummed address', () => {
    expect(normaliseAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'))
      .toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  })

  it('throws on a malformed address', () => {
    expect(() => normaliseAddress('0x1234')).toThrow('invalid address')
  })
})

describe('truncateAddress', () => {
  it('keeps the leading and trailing characters', () => {
    expect(truncateAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'))
      .toBe('0xa0b869…06eb48')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/address.test.ts`
Expected: FAIL, cannot resolve `~~/shared/address`.

- [ ] **Step 3: Implement the address helpers**

Create `shared/address.ts`:

```ts
import type { Address } from 'viem'

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export function normaliseAddress(value: string): Address {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`invalid address: ${value}`)
  }
  return value.toLowerCase() as Address
}

export function truncateAddress(value: string, lead = 8, tail = 6): string {
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/address.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the domain model**

Create `shared/types.ts`:

```ts
import type { Address, Hex } from 'viem'

/** Which upstream answered, and therefore how complete the call data is. */
export type TraceProvenance = 'callTracer' | 'internalTransactions' | 'logsOnly'

export type CallKind =
  | 'CALL'
  | 'DELEGATECALL'
  | 'STATICCALL'
  | 'CALLCODE'
  | 'CREATE'
  | 'CREATE2'
  | 'SELFDESTRUCT'

/** A nested call frame. Only available from a real callTracer. */
export interface RawCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: bigint
  input: Hex
  output: Hex | null
  gasUsed: bigint | null
  error: string | null
  calls: RawCall[]
}

/** A single internal call with no parent/child information. */
export interface FlatCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: bigint
  error: string | null
}

/**
 * Call data, shaped by what the source could actually provide.
 * A flat list is NOT a tree with one level — the distinction is load-bearing
 * and the UI must render them differently. See docs/SPEC.md section 4.
 */
export type CallActivity =
  | { kind: 'tree'; root: RawCall }
  | { kind: 'flat'; calls: FlatCall[] }
  | { kind: 'none' }

export interface RawLog {
  address: Address
  topics: Hex[]
  data: Hex
  logIndex: number
}

export interface RawTransaction {
  chainId: number
  hash: Hex
  blockNumber: bigint
  timestamp: number
  from: Address
  to: Address | null
  value: bigint
  input: Hex
  status: 'success' | 'reverted'
  revertReason: string | null
  gasUsed: bigint
  effectiveGasPrice: bigint
  logs: RawLog[]
  activity: CallActivity
  provenance: TraceProvenance
  sourceName: string
}
```

- [ ] **Step 6: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts shared/address.ts test/address.test.ts
git commit -m "feat: add domain model and address helpers"
```

---

### Task 3: Chain registry

**Files:**
- Create: `shared/chains.ts`
- Test: `test/chains.test.ts`

**Interfaces:**
- Produces:
  - `interface ChainConfig { id: number; slug: string; name: string; nativeSymbol: string; nativeDecimals: number; blockscoutBase: string; reorgDepth: number }`
  - `CHAINS: readonly ChainConfig[]`
  - `getChain(slug: string): ChainConfig | undefined`

- [ ] **Step 1: Write the failing test**

Create `test/chains.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CHAINS, getChain } from '~~/shared/chains'

describe('getChain', () => {
  it('finds ethereum by slug', () => {
    expect(getChain('ethereum')?.id).toBe(1)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getChain('dogecoin')).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(getChain('Ethereum')?.id).toBe(1)
  })
})

describe('CHAINS', () => {
  it('has unique slugs and ids', () => {
    expect(new Set(CHAINS.map((c) => c.slug)).size).toBe(CHAINS.length)
    expect(new Set(CHAINS.map((c) => c.id)).size).toBe(CHAINS.length)
  })

  it('has no trailing slash on any base url', () => {
    for (const chain of CHAINS) {
      expect(chain.blockscoutBase.endsWith('/')).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/chains.test.ts`
Expected: FAIL, cannot resolve `~~/shared/chains`.

- [ ] **Step 3: Implement the registry**

Create `shared/chains.ts`. Phase 1 ships Ethereum only; the array shape is what later chains slot into.

```ts
export interface ChainConfig {
  id: number
  slug: string
  name: string
  nativeSymbol: string
  nativeDecimals: number
  /** Blockscout v2 API root, no trailing slash. */
  blockscoutBase: string
  /** Blocks to wait before a transaction is safe to cache forever. */
  reorgDepth: number
}

export const CHAINS: readonly ChainConfig[] = [
  {
    id: 1,
    slug: 'ethereum',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutBase: 'https://eth.blockscout.com',
    reorgDepth: 64,
  },
] as const

export function getChain(slug: string): ChainConfig | undefined {
  const wanted = slug.toLowerCase()
  return CHAINS.find((chain) => chain.slug === wanted)
}
```

Before committing, confirm the Blockscout base URL responds by hand:

```bash
curl -s "https://eth.blockscout.com/api/v2/stats" | head -c 200
```

If it does not, find the current public instance for Ethereum and use that. Do not commit a URL you have not seen respond.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/chains.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add shared/chains.ts test/chains.test.ts
git commit -m "feat: add chain registry"
```

---

### Task 4: Request validation

**Files:**
- Create: `server/utils/txref.ts`
- Test: `test/txref.test.ts`

**Interfaces:**
- Consumes: `getChain` (Task 3), `ChainConfig` (Task 3).
- Produces:
  - `interface TxRef { chain: ChainConfig; hash: Hex }`
  - `parseTxRef(chainSlug: unknown, hash: unknown): { ok: true; ref: TxRef } | { ok: false; reason: string }`

Validation happens before any upstream call, per `docs/SPEC.md` section 12.

- [ ] **Step 1: Write the failing test**

Create `test/txref.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseTxRef } from '~~/server/utils/txref'

const VALID = '0x2b0dc0b1d0e0e1f8c2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'

describe('parseTxRef', () => {
  it('accepts a valid chain and hash', () => {
    const result = parseTxRef('ethereum', VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ref.chain.id).toBe(1)
      expect(result.ref.hash).toBe(VALID)
    }
  })

  it('lowercases a mixed-case hash', () => {
    const result = parseTxRef('ethereum', VALID.toUpperCase().replace('0X', '0x'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.hash).toBe(VALID)
  })

  it('rejects an unknown chain', () => {
    expect(parseTxRef('dogecoin', VALID)).toEqual({ ok: false, reason: 'unknown chain' })
  })

  it('rejects a hash of the wrong length', () => {
    expect(parseTxRef('ethereum', '0xdeadbeef')).toEqual({ ok: false, reason: 'invalid transaction hash' })
  })

  it('rejects a hash with non-hex characters', () => {
    const bad = `0x${'z'.repeat(64)}`
    expect(parseTxRef('ethereum', bad)).toEqual({ ok: false, reason: 'invalid transaction hash' })
  })

  it('rejects non-string input', () => {
    expect(parseTxRef(1, VALID)).toEqual({ ok: false, reason: 'unknown chain' })
    expect(parseTxRef('ethereum', null)).toEqual({ ok: false, reason: 'invalid transaction hash' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/txref.test.ts`
Expected: FAIL, cannot resolve `~~/server/utils/txref`.

- [ ] **Step 3: Implement**

Create `server/utils/txref.ts`:

```ts
import type { Hex } from 'viem'
import { type ChainConfig, getChain } from '~~/shared/chains'

export interface TxRef {
  chain: ChainConfig
  hash: Hex
}

export type TxRefResult = { ok: true; ref: TxRef } | { ok: false; reason: string }

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

export function parseTxRef(chainSlug: unknown, hash: unknown): TxRefResult {
  if (typeof chainSlug !== 'string') return { ok: false, reason: 'unknown chain' }
  const chain = getChain(chainSlug)
  if (!chain) return { ok: false, reason: 'unknown chain' }

  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
    return { ok: false, reason: 'invalid transaction hash' }
  }

  return { ok: true, ref: { chain, hash: hash.toLowerCase() as Hex } }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/txref.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/utils/txref.ts test/txref.test.ts
git commit -m "feat: validate chain and hash before any upstream call"
```

---

### Task 5: The HTTP seam

**Files:**
- Create: `server/utils/http.ts`, `test/helpers/fakeHttp.ts`
- Test: `test/http.test.ts`

**Interfaces:**
- Produces:
  - `interface HttpClient { getJson<T>(url: string): Promise<HttpResult<T>> }`
  - `type HttpResult<T> = { ok: true; data: T } | { ok: false; status: number | null; reason: string }`
  - `createHttpClient(options?: { timeoutMs?: number }): HttpClient`
  - test helper `fakeHttp(routes: Record<string, unknown>): HttpClient`

Every networked module takes an `HttpClient`. This is the single reason the whole suite runs without a network.

- [ ] **Step 1: Write the failing test**

Create `test/http.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/http.test.ts`
Expected: FAIL, cannot resolve `./helpers/fakeHttp`.

- [ ] **Step 3: Implement the client interface and real client**

Create `server/utils/http.ts`:

```ts
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
```

- [ ] **Step 4: Implement the fake**

Create `test/helpers/fakeHttp.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run test/http.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add server/utils/http.ts test/helpers/fakeHttp.ts test/http.test.ts
git commit -m "feat: add injectable http client seam"
```

---

### Task 6: Blockscout adapter

**Files:**
- Create: `server/sources/blockscout.ts`, `test/fixtures/blockscout/transfer.json`
- Test: `test/blockscout.test.ts`

**Interfaces:**
- Consumes: `HttpClient` (Task 5), `RawTransaction`/`CallActivity`/`RawLog`/`FlatCall` (Task 2), `ChainConfig` (Task 3), `normaliseAddress` (Task 2).
- Produces: `fetchFromBlockscout(http: HttpClient, chain: ChainConfig, hash: Hex): Promise<RawTransaction | null>`

**On fixtures:** unit tests run against a fixture authored here, so they are deterministic and offline. Step 1 also has you check the fixture against the live API once, by hand. If the real shape differs, update the fixture *and* the `Blockscout*` interfaces together, keeping the field names the real API uses — then adjust the assertions to match the real values. The mapping logic and the assertions about normalisation, unit conversion, and provenance stay the same either way.

- [ ] **Step 1: Check the real response shape once, by hand**

```bash
curl -s "https://eth.blockscout.com/api/v2/transactions/0x2b0dc0b1d0e0e1f8c2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809" | head -c 1500
```

That hash is a placeholder and will 404. Replace it with any real recent Ethereum transaction hash — take one from the Blockscout homepage's recent transactions list. Do the same for the `/logs` and `/internal-transactions` sub-paths. Note the field names you actually see; you will need them in Step 3.

- [ ] **Step 2: Write the fixture**

Create `test/fixtures/blockscout/transfer.json`. This models a transaction that calls a contract, emits one log, and makes one internal ETH transfer:

```json
{
  "transaction": {
    "hash": "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    "block_number": 21000000,
    "timestamp": "2026-01-15T10:30:00.000000Z",
    "from": { "hash": "0x1111111111111111111111111111111111111111" },
    "to": { "hash": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    "value": "1000000000000000000",
    "raw_input": "0xa9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000007b",
    "status": "ok",
    "revert_reason": null,
    "gas_used": "52000",
    "gas_price": "12000000000"
  },
  "logs": {
    "items": [
      {
        "address": { "hash": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
        "topics": [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x0000000000000000000000001111111111111111111111111111111111111111",
          "0x0000000000000000000000002222222222222222222222222222222222222222"
        ],
        "data": "0x000000000000000000000000000000000000000000000000000000000000007b",
        "index": 0
      }
    ]
  },
  "internal": {
    "items": [
      {
        "type": "call",
        "from": { "hash": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
        "to": { "hash": "0x3333333333333333333333333333333333333333" },
        "value": "500000000000000000",
        "error": null
      }
    ]
  }
}
```

- [ ] **Step 3: Write the failing test**

Create `test/blockscout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/blockscout/transfer.json'
import { fakeHttp } from './helpers/fakeHttp'
import { fetchFromBlockscout } from '~~/server/sources/blockscout'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const hash = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as const
const base = `${chain.blockscoutBase}/api/v2/transactions/${hash}`

function routes(overrides: Record<string, unknown> = {}) {
  return {
    [base]: fixture.transaction,
    [`${base}/logs`]: fixture.logs,
    [`${base}/internal-transactions`]: fixture.internal,
    ...overrides,
  }
}

describe('fetchFromBlockscout', () => {
  it('returns null when the transaction is not found', async () => {
    const result = await fetchFromBlockscout(fakeHttp({}), chain, hash)
    expect(result).toBeNull()
  })

  it('maps core transaction fields', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.chainId).toBe(1)
    expect(tx.hash).toBe(hash)
    expect(tx.blockNumber).toBe(21000000n)
    expect(tx.value).toBe(1000000000000000000n)
    expect(tx.gasUsed).toBe(52000n)
    expect(tx.effectiveGasPrice).toBe(12000000000n)
    expect(tx.status).toBe('success')
    expect(tx.revertReason).toBeNull()
    expect(tx.sourceName).toBe('blockscout')
  })

  it('lowercases every address', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.to).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    expect(tx.logs[0].address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  })

  it('converts the ISO timestamp to unix seconds', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.timestamp).toBe(Math.floor(Date.parse('2026-01-15T10:30:00.000Z') / 1000))
  })

  it('reports flat call activity, never a tree', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.activity.kind).toBe('flat')
    if (tx.activity.kind === 'flat') {
      expect(tx.activity.calls).toHaveLength(1)
      expect(tx.activity.calls[0].kind).toBe('CALL')
      expect(tx.activity.calls[0].value).toBe(500000000000000000n)
    }
    expect(tx.provenance).toBe('internalTransactions')
  })

  it('degrades to logsOnly when internal transactions are unavailable', async () => {
    const withoutInternal = routes()
    delete (withoutInternal as Record<string, unknown>)[`${base}/internal-transactions`]
    const tx = (await fetchFromBlockscout(fakeHttp(withoutInternal), chain, hash))!
    expect(tx.activity.kind).toBe('none')
    expect(tx.provenance).toBe('logsOnly')
    expect(tx.logs).toHaveLength(1)
  })

  it('degrades to logsOnly when internal transactions are empty', async () => {
    const tx = (await fetchFromBlockscout(
      fakeHttp(routes({ [`${base}/internal-transactions`]: { items: [] } })),
      chain,
      hash,
    ))!
    expect(tx.provenance).toBe('logsOnly')
  })

  it('maps a reverted transaction', async () => {
    const reverted = { ...fixture.transaction, status: 'error', revert_reason: 'ERC20: insufficient balance' }
    const tx = (await fetchFromBlockscout(fakeHttp(routes({ [base]: reverted })), chain, hash))!
    expect(tx.status).toBe('reverted')
    expect(tx.revertReason).toBe('ERC20: insufficient balance')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run test/blockscout.test.ts`
Expected: FAIL, cannot resolve `~~/server/sources/blockscout`.

- [ ] **Step 5: Implement the adapter**

Create `server/sources/blockscout.ts`:

```ts
import type { Hex } from 'viem'
import type { CallActivity, CallKind, FlatCall, RawLog, RawTransaction } from '~~/shared/types'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import type { HttpClient } from '~~/server/utils/http'

interface BlockscoutAddress {
  hash: string
}

interface BlockscoutTransaction {
  hash: string
  block_number: number
  timestamp: string
  from: BlockscoutAddress
  to: BlockscoutAddress | null
  value: string
  raw_input: string
  status: string
  revert_reason: string | null
  gas_used: string
  gas_price: string
}

interface BlockscoutLogItem {
  address: BlockscoutAddress
  topics: (string | null)[]
  data: string
  index: number
}

interface BlockscoutInternalItem {
  type: string
  from: BlockscoutAddress
  to: BlockscoutAddress | null
  value: string
  error: string | null
}

const CALL_KINDS: Record<string, CallKind> = {
  call: 'CALL',
  delegatecall: 'DELEGATECALL',
  staticcall: 'STATICCALL',
  callcode: 'CALLCODE',
  create: 'CREATE',
  create2: 'CREATE2',
  selfdestruct: 'SELFDESTRUCT',
}

function toBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n
  return BigInt(value)
}

function toCallKind(value: string): CallKind {
  return CALL_KINDS[value.toLowerCase()] ?? 'CALL'
}

export async function fetchFromBlockscout(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
): Promise<RawTransaction | null> {
  const base = `${chain.blockscoutBase}/api/v2/transactions/${hash}`

  const core = await http.getJson<BlockscoutTransaction>(base)
  if (!core.ok) return null

  const [logsResult, internalResult] = await Promise.all([
    http.getJson<{ items: BlockscoutLogItem[] }>(`${base}/logs`),
    http.getJson<{ items: BlockscoutInternalItem[] }>(`${base}/internal-transactions`),
  ])

  const logs: RawLog[] = logsResult.ok
    ? logsResult.data.items.map((item) => ({
        address: normaliseAddress(item.address.hash),
        topics: item.topics.filter((topic): topic is string => topic !== null) as Hex[],
        data: item.data as Hex,
        logIndex: item.index,
      }))
    : []

  const internalItems = internalResult.ok ? internalResult.data.items : []
  const calls: FlatCall[] = internalItems.map((item) => ({
    kind: toCallKind(item.type),
    from: normaliseAddress(item.from.hash),
    to: item.to ? normaliseAddress(item.to.hash) : null,
    value: toBigInt(item.value),
    error: item.error,
  }))

  // Blockscout returns internal transactions as a flat list with no parent
  // information, so this can never be a tree. Only a real callTracer can be.
  const activity: CallActivity = calls.length > 0 ? { kind: 'flat', calls } : { kind: 'none' }

  return {
    chainId: chain.id,
    hash,
    blockNumber: BigInt(core.data.block_number),
    timestamp: Math.floor(Date.parse(core.data.timestamp) / 1000),
    from: normaliseAddress(core.data.from.hash),
    to: core.data.to ? normaliseAddress(core.data.to.hash) : null,
    value: toBigInt(core.data.value),
    input: (core.data.raw_input ?? '0x') as Hex,
    status: core.data.status === 'ok' ? 'success' : 'reverted',
    revertReason: core.data.revert_reason,
    gasUsed: toBigInt(core.data.gas_used),
    effectiveGasPrice: toBigInt(core.data.gas_price),
    logs,
    activity,
    provenance: calls.length > 0 ? 'internalTransactions' : 'logsOnly',
    sourceName: 'blockscout',
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run test/blockscout.test.ts`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add server/sources/blockscout.ts test/blockscout.test.ts test/fixtures/blockscout/transfer.json
git commit -m "feat: add blockscout source adapter with flat call activity"
```

---

### Task 7: Source registry

**Files:**
- Create: `server/sources/registry.ts`
- Test: `test/registry.test.ts`

**Interfaces:**
- Consumes: `fetchFromBlockscout` (Task 6), `HttpClient` (Task 5).
- Produces:
  - `interface TxSource { name: string; fetch(http: HttpClient, chain: ChainConfig, hash: Hex): Promise<RawTransaction | null> }`
  - `SOURCES: readonly TxSource[]`
  - `fetchTransaction(http, chain, hash, sources?): Promise<RawTransaction | null>`

Ordered fallback. Phase 1 has one source; the ordering machinery exists so that adding a `callTracer` source later is a registry entry, not a rewrite.

- [ ] **Step 1: Write the failing test**

Create `test/registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { RawTransaction } from '~~/shared/types'
import type { TxSource } from '~~/server/sources/registry'
import { fetchTransaction } from '~~/server/sources/registry'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const hash = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as const

function stubTx(sourceName: string): RawTransaction {
  return {
    chainId: 1, hash, blockNumber: 1n, timestamp: 0,
    from: '0x1111111111111111111111111111111111111111',
    to: null, value: 0n, input: '0x', status: 'success', revertReason: null,
    gasUsed: 0n, effectiveGasPrice: 0n, logs: [],
    activity: { kind: 'none' }, provenance: 'logsOnly', sourceName,
  }
}

function source(name: string, result: RawTransaction | null): TxSource {
  return { name, fetch: vi.fn(async () => result) }
}

describe('fetchTransaction', () => {
  it('returns the first source that answers', async () => {
    const first = source('first', stubTx('first'))
    const second = source('second', stubTx('second'))
    const result = await fetchTransaction(fakeHttp({}), chain, hash, [first, second])
    expect(result?.sourceName).toBe('first')
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('falls through to the next source when one returns null', async () => {
    const result = await fetchTransaction(fakeHttp({}), chain, hash, [
      source('first', null),
      source('second', stubTx('second')),
    ])
    expect(result?.sourceName).toBe('second')
  })

  it('falls through when a source throws', async () => {
    const throwing: TxSource = {
      name: 'throwing',
      fetch: vi.fn(async () => { throw new Error('upstream exploded') }),
    }
    const result = await fetchTransaction(fakeHttp({}), chain, hash, [
      throwing,
      source('second', stubTx('second')),
    ])
    expect(result?.sourceName).toBe('second')
  })

  it('returns null when every source fails', async () => {
    const result = await fetchTransaction(fakeHttp({}), chain, hash, [
      source('a', null),
      source('b', null),
    ])
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/registry.test.ts`
Expected: FAIL, cannot resolve `~~/server/sources/registry`.

- [ ] **Step 3: Implement**

Create `server/sources/registry.ts`:

```ts
import type { Hex } from 'viem'
import type { RawTransaction } from '~~/shared/types'
import type { ChainConfig } from '~~/shared/chains'
import type { HttpClient } from '~~/server/utils/http'
import { fetchFromBlockscout } from './blockscout'

export interface TxSource {
  name: string
  fetch(http: HttpClient, chain: ChainConfig, hash: Hex): Promise<RawTransaction | null>
}

/**
 * Ordered best-first. A source that cannot answer returns null and the next
 * one is tried. A source that throws is treated the same way — one broken
 * upstream must not take the page down.
 */
export const SOURCES: readonly TxSource[] = [
  { name: 'blockscout', fetch: fetchFromBlockscout },
]

export async function fetchTransaction(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
  sources: readonly TxSource[] = SOURCES,
): Promise<RawTransaction | null> {
  for (const source of sources) {
    try {
      const result = await source.fetch(http, chain, hash)
      if (result) return result
    } catch (error) {
      console.warn(`[txlens] source ${source.name} failed`, error)
    }
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/registry.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/sources/registry.ts test/registry.test.ts
git commit -m "feat: add ordered source registry with fallback"
```

---

### Task 8: Local label pack

**Files:**
- Create: `server/abi/labelpack.data.ts`, `server/abi/labelpack.ts`
- Test: `test/labelpack.test.ts`

**Interfaces:**
- Produces:
  - `interface LabelEntry { chainId: number; address: Address; name: string; abi: Abi | null }`
  - `lookupLabel(chainId: number, address: string): LabelEntry | undefined`

The label pack is what makes the demo transactions decode perfectly with zero network calls, and it is the first rung of the resolution ladder in Task 11.

- [ ] **Step 1: Write the failing test**

Create `test/labelpack.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LABELS, lookupLabel } from '~~/server/abi/labelpack'

describe('lookupLabel', () => {
  it('finds a known token regardless of address casing', () => {
    const lower = lookupLabel(1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    const upper = lookupLabel(1, '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48')
    expect(lower?.name).toBe('USDC')
    expect(upper?.name).toBe('USDC')
  })

  it('returns undefined for an unknown address', () => {
    expect(lookupLabel(1, '0x0000000000000000000000000000000000000dead')).toBeUndefined()
  })

  it('does not match the same address on a different chain', () => {
    expect(lookupLabel(999, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBeUndefined()
  })
})

describe('LABELS', () => {
  it('stores every address lowercased', () => {
    for (const entry of LABELS) {
      expect(entry.address).toBe(entry.address.toLowerCase())
    }
  })

  it('has no duplicate chain/address pairs', () => {
    const keys = LABELS.map((entry) => `${entry.chainId}:${entry.address}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/labelpack.test.ts`
Expected: FAIL, cannot resolve `~~/server/abi/labelpack`.

- [ ] **Step 3: Verify every address before writing it down**

A wrong address in the label pack is a silent correctness bug — it will confidently mislabel someone's transaction. For each address in the next step, open `https://eth.blockscout.com/address/<address>` and confirm the contract name matches. Do not skip this.

- [ ] **Step 4: Write the label data**

Create `server/abi/labelpack.data.ts`:

```ts
import { type Abi, parseAbi } from 'viem'

/** The subset of ERC-20 that matters for decoding transfers and approvals. */
export const ERC20_ABI: Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

export const ERC721_ABI: Abi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
])

export const ERC1155_ABI: Abi = parseAbi([
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
])

export const WETH_ABI: Abi = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
])

interface RawLabel {
  chainId: number
  address: string
  name: string
  abi: Abi | null
}

/**
 * Curated, verified by hand. Every address here was checked on a block
 * explorer before being added — see the plan's Task 8 Step 3.
 */
export const RAW_LABELS: RawLabel[] = [
  { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC', abi: ERC20_ABI },
  { chainId: 1, address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'USDT', abi: ERC20_ABI },
  { chainId: 1, address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI', abi: ERC20_ABI },
  { chainId: 1, address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', name: 'WETH', abi: [...WETH_ABI, ...ERC20_ABI] },
]
```

If any address fails verification in Step 3, remove it rather than guessing a replacement. A short label pack is fine; a wrong one is not.

- [ ] **Step 5: Write the lookup**

Create `server/abi/labelpack.ts`:

```ts
import type { Abi, Address } from 'viem'
import { RAW_LABELS } from './labelpack.data'

export interface LabelEntry {
  chainId: number
  address: Address
  name: string
  abi: Abi | null
}

export const LABELS: readonly LabelEntry[] = RAW_LABELS.map((entry) => ({
  ...entry,
  address: entry.address.toLowerCase() as Address,
}))

const INDEX = new Map<string, LabelEntry>(
  LABELS.map((entry) => [`${entry.chainId}:${entry.address}`, entry]),
)

export function lookupLabel(chainId: number, address: string): LabelEntry | undefined {
  return INDEX.get(`${chainId}:${address.toLowerCase()}`)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run test/labelpack.test.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add server/abi/labelpack.ts server/abi/labelpack.data.ts test/labelpack.test.ts
git commit -m "feat: add curated address label pack"
```

---

### Task 9: Remote ABI lookups

**Files:**
- Create: `server/abi/remote.ts`
- Test: `test/remote-abi.test.ts`

**Interfaces:**
- Consumes: `HttpClient` (Task 5), `ChainConfig` (Task 3).
- Produces:
  - `fetchBlockscoutAbi(http, chain, address): Promise<{ abi: Abi; name: string | null } | null>`
  - `fetchSourcifyAbi(http, chainId, address): Promise<Abi | null>`
  - `fetchFourByteSignature(http, selector): Promise<string | null>`

**Gotcha to preserve:** Sourcify paths use the **EIP-55 checksummed** address, while everything else in this codebase is lowercase. `getAddress()` from viem does the conversion. Getting this wrong produces a silent 404 and looks like an unverified contract.

- [ ] **Step 1: Write the failing test**

Create `test/remote-abi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fetchBlockscoutAbi, fetchFourByteSignature, fetchSourcifyAbi } from '~~/server/abi/remote'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const lower = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const checksummed = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const abi = [{ type: 'function', name: 'transfer', inputs: [], outputs: [], stateMutability: 'nonpayable' }]

describe('fetchBlockscoutAbi', () => {
  it('returns the abi and contract name for a verified contract', async () => {
    const http = fakeHttp({
      [`${chain.blockscoutBase}/api/v2/smart-contracts/${lower}`]: { abi, name: 'FiatTokenV2_2' },
    })
    expect(await fetchBlockscoutAbi(http, chain, lower)).toEqual({ abi, name: 'FiatTokenV2_2' })
  })

  it('returns null for an unverified contract', async () => {
    expect(await fetchBlockscoutAbi(fakeHttp({}), chain, lower)).toBeNull()
  })

  it('returns null when the response has no abi', async () => {
    const http = fakeHttp({
      [`${chain.blockscoutBase}/api/v2/smart-contracts/${lower}`]: { abi: null, name: 'Thing' },
    })
    expect(await fetchBlockscoutAbi(http, chain, lower)).toBeNull()
  })
})

describe('fetchSourcifyAbi', () => {
  it('requests the checksummed address, not the lowercase one', async () => {
    const http = fakeHttp({
      [`https://repo.sourcify.dev/contracts/full_match/1/${checksummed}/metadata.json`]: {
        output: { abi },
      },
    })
    expect(await fetchSourcifyAbi(http, 1, lower)).toEqual(abi)
    expect(http.calls[0]).toContain(checksummed)
  })

  it('falls back to partial_match when full_match is absent', async () => {
    const http = fakeHttp({
      [`https://repo.sourcify.dev/contracts/partial_match/1/${checksummed}/metadata.json`]: {
        output: { abi },
      },
    })
    expect(await fetchSourcifyAbi(http, 1, lower)).toEqual(abi)
    expect(http.calls).toHaveLength(2)
  })

  it('returns null when neither match exists', async () => {
    expect(await fetchSourcifyAbi(fakeHttp({}), 1, lower)).toBeNull()
  })
})

describe('fetchFourByteSignature', () => {
  it('returns the oldest signature for a selector', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [
          { id: 900, text_signature: 'wrong_decoy(uint256)' },
          { id: 145, text_signature: 'transfer(address,uint256)' },
        ],
      },
    })
    expect(await fetchFourByteSignature(http, '0xa9059cbb')).toBe('transfer(address,uint256)')
  })

  it('returns null when there are no results', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xdeadbeef': { results: [] },
    })
    expect(await fetchFourByteSignature(http, '0xdeadbeef')).toBeNull()
  })
})
```

The 4byte test encodes a real behaviour: a selector can have many registered signatures, some deliberately planted to mislead. Lowest id means earliest registered, which is the least-bad heuristic.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/remote-abi.test.ts`
Expected: FAIL, cannot resolve `~~/server/abi/remote`.

- [ ] **Step 3: Implement**

Create `server/abi/remote.ts`:

```ts
import { type Abi, type Hex, getAddress } from 'viem'
import type { ChainConfig } from '~~/shared/chains'
import type { HttpClient } from '~~/server/utils/http'

export async function fetchBlockscoutAbi(
  http: HttpClient,
  chain: ChainConfig,
  address: string,
): Promise<{ abi: Abi; name: string | null } | null> {
  const url = `${chain.blockscoutBase}/api/v2/smart-contracts/${address.toLowerCase()}`
  const result = await http.getJson<{ abi: Abi | null; name: string | null }>(url)
  if (!result.ok || !result.data.abi) return null
  return { abi: result.data.abi, name: result.data.name ?? null }
}

export async function fetchSourcifyAbi(
  http: HttpClient,
  chainId: number,
  address: string,
): Promise<Abi | null> {
  // Sourcify indexes by EIP-55 checksummed address. Requesting the lowercase
  // form 404s silently and looks identical to an unverified contract.
  const checksummed = getAddress(address)
  for (const match of ['full_match', 'partial_match'] as const) {
    const url = `https://repo.sourcify.dev/contracts/${match}/${chainId}/${checksummed}/metadata.json`
    const result = await http.getJson<{ output?: { abi?: Abi } }>(url)
    if (result.ok && result.data.output?.abi) return result.data.output.abi
  }
  return null
}

export async function fetchFourByteSignature(
  http: HttpClient,
  selector: Hex | string,
): Promise<string | null> {
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`
  const result = await http.getJson<{ results: { id: number; text_signature: string }[] }>(url)
  if (!result.ok || result.data.results.length === 0) return null
  // Many selectors have multiple registrations, some planted to mislead.
  // Lowest id means registered earliest, which is the least-bad heuristic.
  const oldest = [...result.data.results].sort((a, b) => a.id - b.id)[0]
  return oldest.text_signature
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/remote-abi.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add server/abi/remote.ts test/remote-abi.test.ts
git commit -m "feat: add sourcify, blockscout, and 4byte abi lookups"
```

---

### Task 10: Proxy implementation detection

**Files:**
- Create: `server/abi/proxy.ts`
- Test: `test/proxy.test.ts`

**Interfaces:**
- Consumes: `HttpClient` (Task 5), `ChainConfig` (Task 3), `normaliseAddress` (Task 2).
- Produces: `resolveImplementation(http, chain, address): Promise<Address | null>`

**Deviation from `docs/SPEC.md` section 5, recorded deliberately:** the spec calls for reading EIP-1967 storage slots via `eth_getStorageAt`. That needs an RPC endpoint, and phase 1 is keyless. Blockscout's address endpoint already exposes a resolved `implementations` array, so use that now. When a keyed RPC source lands (spec section 4, layer two), add slot reading as a second rung here — the function signature does not change. Update `docs/SPEC.md` section 5 to describe both rungs.

- [ ] **Step 1: Write the failing test**

Create `test/proxy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveImplementation } from '~~/server/abi/proxy'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const proxy = '0x1111111111111111111111111111111111111111'
const impl = '0x2222222222222222222222222222222222222222'
const url = `${chain.blockscoutBase}/api/v2/addresses/${proxy}`

describe('resolveImplementation', () => {
  it('returns the implementation address for a proxy', async () => {
    const http = fakeHttp({
      [url]: { is_contract: true, implementations: [{ address: impl.toUpperCase() }] },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBe(impl)
  })

  it('returns null for a non-proxy contract', async () => {
    const http = fakeHttp({ [url]: { is_contract: true, implementations: [] } })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })

  it('returns null when the field is missing entirely', async () => {
    const http = fakeHttp({ [url]: { is_contract: true } })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })

  it('returns null when the address lookup fails', async () => {
    expect(await resolveImplementation(fakeHttp({}), chain, proxy)).toBeNull()
  })

  it('ignores an implementation that points back at the proxy', async () => {
    const http = fakeHttp({
      [url]: { is_contract: true, implementations: [{ address: proxy }] },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })
})
```

The self-reference test exists because a proxy pointing at itself would send Task 11's ladder into an infinite loop.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/proxy.test.ts`
Expected: FAIL, cannot resolve `~~/server/abi/proxy`.

- [ ] **Step 3: Implement**

Create `server/abi/proxy.ts`:

```ts
import type { Address } from 'viem'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import type { HttpClient } from '~~/server/utils/http'

interface BlockscoutAddressResponse {
  is_contract?: boolean
  implementations?: { address: string }[]
}

/**
 * Resolve a proxy to the contract that actually holds the logic.
 * Uses Blockscout's already-resolved implementations field, which keeps phase 1
 * keyless. See the plan's Task 10 for why this is not EIP-1967 slot reading yet.
 */
export async function resolveImplementation(
  http: HttpClient,
  chain: ChainConfig,
  address: string,
): Promise<Address | null> {
  const proxy = normaliseAddress(address)
  const url = `${chain.blockscoutBase}/api/v2/addresses/${proxy}`
  const result = await http.getJson<BlockscoutAddressResponse>(url)
  if (!result.ok) return null

  const first = result.data.implementations?.[0]?.address
  if (!first) return null

  const implementation = normaliseAddress(first)
  // A proxy that reports itself would loop the resolution ladder forever.
  if (implementation === proxy) return null
  return implementation
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/proxy.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/abi/proxy.ts test/proxy.test.ts
git commit -m "feat: resolve proxy implementations before abi lookup"
```
