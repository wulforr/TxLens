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
- Create: the Nuxt project, `biome.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `LICENSE`
- Modify: `.gitignore`, `README.md`, `nuxt.config.ts`, `package.json` — the scaffold generates all four
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and a live Cloudflare Pages URL.

- [x] **Step 1: Scaffold Nuxt**

Run in the repo root (the repo already contains `CLAUDE.md` and `docs/`, so scaffold in place):

```bash
pnpm dlx nuxi@latest init . -t minimal --packageManager pnpm --no-gitInit --force
```

`-t minimal` is required: `nuxi` refuses to run without an explicit template in a
non-interactive terminal. `--no-gitInit` is the correct negation — `--gitInit false`
would be parsed as a boolean flag followed by a positional directory argument.

Record the resolved Nuxt and Vue major versions in this plan's Tech Stack line once known. Do not assume a major version; the directory layout differs between Nuxt 3 and 4, and later tasks reference `app/` — if the scaffold produced a flat layout instead, keep the scaffold's layout and adjust paths consistently.

- [x] **Step 2: Install dependencies**

```bash
pnpm add viem
pnpm add -D vitest @biomejs/biome 'typescript@^5.9' vue-tsc
```

**Pin TypeScript below 7 deliberately.** A bare `pnpm add -D typescript` resolves to
the 7.x native compiler, which dropped the `typescript/lib/tsc` subpath export that
`vue-tsc` requires. The symptom is `pnpm typecheck` failing with
`ERR_PACKAGE_PATH_NOT_EXPORTED`, which does not obviously point at the version.

- [x] **Step 3: Enable TypeScript strict mode**

**Merge** these into the generated `nuxt.config.ts` rather than replacing the file —
the scaffold writes a `compatibilityDate` that Nitro warns about if it goes missing.

```ts
export default defineNuxtConfig({
  compatibilityDate: '<keep whatever the scaffold generated>',
  typescript: { strict: true, typeCheck: false },
  nitro: { preset: 'cloudflare-pages' },
  devtools: { enabled: true },
})
```

`typeCheck: false` keeps dev fast; CI runs `vue-tsc` separately.

- [x] **Step 4: Add vitest config**

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

- [x] **Step 5: Add scripts to package.json**

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

- [x] **Step 6: Write the smoke test**

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

- [x] **Step 7: Run the test to verify the toolchain**

Run: `pnpm test`
Expected: 1 passed.

- [x] **Step 8: Configure Biome**

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

On Biome 2.5 and later the `rules` block is written as `{ "preset": "recommended" }`
instead of `{ "recommended": true }` — use that form if the schema rejects the above.

**Do not blindly keep the output of `pnpm biome migrate --write`.** It rewrites
`"recommended": true` into `"preset": "none"`, which disables every lint rule while
still exiting 0 — a silent quality hole that looks like a passing lint step. After any
migrate, open the file and confirm the preset is `recommended`.

- [x] **Step 9: Add CI**

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

- [x] **Step 10: Verify everything passes locally**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all four succeed. Fix any scaffold lint violations now rather than carrying them.

- [x] **Step 11: Write the README stub**

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

- [x] **Step 12: Add MIT LICENSE**

Create `LICENSE` with the standard MIT text, copyright `2026 Shaurya Singh`.

- [x] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold nuxt app with vitest, biome, and CI"
```

- [~] **Step 14: Deploy the shell to Cloudflare Pages**  <!-- SKIPPED: requires a human in the Cloudflare dashboard; still pending -->

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

- [x] **Step 1: Write the failing test for address helpers**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/address.test.ts`
Expected: FAIL, cannot resolve `~~/shared/address`.

- [x] **Step 3: Implement the address helpers**

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

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/address.test.ts`
Expected: 3 passed.

- [x] **Step 5: Write the domain model**

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

- [x] **Step 6: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [x] **Step 7: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/chains.test.ts`
Expected: FAIL, cannot resolve `~~/shared/chains`.

- [x] **Step 3: Implement the registry**

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

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/chains.test.ts`
Expected: 5 passed.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/txref.test.ts`
Expected: FAIL, cannot resolve `~~/server/utils/txref`.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/txref.test.ts`
Expected: 6 passed.

- [x] **Step 5: Commit**

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
  - test helper `fakeHttp(routes: Record<string, unknown>): FakeHttpClient` — an `HttpClient` that also exposes a `calls: string[]` log

Every networked module takes an `HttpClient`. This is the single reason the whole suite runs without a network.

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/http.test.ts`
Expected: FAIL, cannot resolve `./helpers/fakeHttp`.

- [x] **Step 3: Implement the client interface and real client**

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

- [x] **Step 4: Implement the fake**

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

- [x] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run test/http.test.ts`
Expected: 3 passed.

- [x] **Step 6: Commit**

```bash
git add server/utils/http.ts test/helpers/fakeHttp.ts test/http.test.ts
git commit -m "feat: add injectable http client seam"
```

---

> **Before starting Task 6.** `nuxt build` emits
> `[cloudflare] Node.js compatibility is not enabled.` It is harmless while the app is
> static, but from Task 6 onward the server routes run real logic on Cloudflare. Enable
> the `nodejs_compat` compatibility flag in the Pages project settings when the
> deployment is wired up, and re-check the build warning then.

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

---

### Task 11: The ABI resolution ladder

**Files:**
- Create: `server/abi/resolve.ts`
- Test: `test/resolve.test.ts`

**Interfaces:**
- Consumes: `lookupLabel` (Task 8), `fetchBlockscoutAbi`/`fetchSourcifyAbi`/`fetchFourByteSignature` (Task 9), `resolveImplementation` (Task 10).
- Produces:
  - `type AbiResolution = { kind: 'full'; abi: Abi; name: string | null; source: AbiSource; via: Address | null } | { kind: 'signature'; signature: string } | { kind: 'unknown' }`
  - `type AbiSource = 'labelpack' | 'blockscout' | 'sourcify'`
  - `interface AbiResolver { forAddress(address: Address): Promise<AbiResolution>; forSelector(selector: Hex): Promise<string | null> }`
  - `createAbiResolver(http: HttpClient, chain: ChainConfig): AbiResolver`

**Ordering, and why:** the curated label pack wins outright. Then proxies are resolved *before* remote lookups, because a proxy's own verified ABI describes the proxy (upgrade and fallback functions) and not the logic being called — resolving the proxy's ABI would decode nothing useful while looking like success.

A resolver instance memoises per address for the life of one request, so a transaction touching the same contract twenty times does one lookup.

- [ ] **Step 1: Write the failing test**

Create `test/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAbiResolver } from '~~/server/abi/resolve'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const proxy = '0x1111111111111111111111111111111111111111'
const impl = '0x2222222222222222222222222222222222222222'
const plain = '0x3333333333333333333333333333333333333333'
const abi = [{ type: 'function', name: 'doThing', inputs: [], outputs: [], stateMutability: 'nonpayable' }]

const addressUrl = (a: string) => `${chain.blockscoutBase}/api/v2/addresses/${a}`
const contractUrl = (a: string) => `${chain.blockscoutBase}/api/v2/smart-contracts/${a}`

describe('createAbiResolver', () => {
  it('prefers the label pack and makes no network call', async () => {
    const http = fakeHttp({})
    const resolution = await createAbiResolver(http, chain).forAddress(usdc)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.source).toBe('labelpack')
      expect(resolution.name).toBe('USDC')
      expect(resolution.via).toBeNull()
    }
    expect(http.calls).toHaveLength(0)
  })

  it('resolves a proxy to its implementation abi and records via', async () => {
    const http = fakeHttp({
      [addressUrl(proxy)]: { implementations: [{ address: impl }] },
      [contractUrl(impl)]: { abi, name: 'LogicV3' },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(proxy)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.name).toBe('LogicV3')
      expect(resolution.via).toBe(impl)
    }
  })

  it('falls back to the address own abi when it is not a proxy', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [contractUrl(plain)]: { abi, name: 'Plain' },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(plain)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.source).toBe('blockscout')
      expect(resolution.via).toBeNull()
    }
  })

  it('returns unknown when nothing resolves', async () => {
    const resolution = await createAbiResolver(fakeHttp({}), chain).forAddress(plain)
    expect(resolution).toEqual({ kind: 'unknown' })
  })

  it('memoises repeated lookups of the same address', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [contractUrl(plain)]: { abi, name: 'Plain' },
    })
    const resolver = createAbiResolver(http, chain)
    await resolver.forAddress(plain)
    const callsAfterFirst = http.calls.length
    await resolver.forAddress(plain)
    expect(http.calls).toHaveLength(callsAfterFirst)
  })

  it('resolves a selector through 4byte', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [{ id: 1, text_signature: 'transfer(address,uint256)' }],
      },
    })
    expect(await createAbiResolver(http, chain).forSelector('0xa9059cbb')).toBe('transfer(address,uint256)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/resolve.test.ts`
Expected: FAIL, cannot resolve `~~/server/abi/resolve`.

- [ ] **Step 3: Implement**

Create `server/abi/resolve.ts`:

```ts
import type { Abi, Address, Hex } from 'viem'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import type { HttpClient } from '~~/server/utils/http'
import { lookupLabel } from './labelpack'
import { resolveImplementation } from './proxy'
import { fetchBlockscoutAbi, fetchFourByteSignature, fetchSourcifyAbi } from './remote'

export type AbiSource = 'labelpack' | 'blockscout' | 'sourcify'

export type AbiResolution =
  | { kind: 'full'; abi: Abi; name: string | null; source: AbiSource; via: Address | null }
  | { kind: 'signature'; signature: string }
  | { kind: 'unknown' }

export interface AbiResolver {
  forAddress(address: string): Promise<AbiResolution>
  forSelector(selector: Hex | string): Promise<string | null>
}

export function createAbiResolver(http: HttpClient, chain: ChainConfig): AbiResolver {
  const addressCache = new Map<Address, Promise<AbiResolution>>()
  const selectorCache = new Map<string, Promise<string | null>>()

  /** Label pack, then Blockscout verified source, then Sourcify. No proxy step. */
  async function direct(address: Address): Promise<AbiResolution | null> {
    const label = lookupLabel(chain.id, address)
    if (label?.abi) {
      return { kind: 'full', abi: label.abi, name: label.name, source: 'labelpack', via: null }
    }

    const blockscout = await fetchBlockscoutAbi(http, chain, address)
    if (blockscout) {
      return { kind: 'full', abi: blockscout.abi, name: blockscout.name, source: 'blockscout', via: null }
    }

    const sourcify = await fetchSourcifyAbi(http, chain.id, address)
    if (sourcify) {
      return { kind: 'full', abi: sourcify, name: null, source: 'sourcify', via: null }
    }

    return null
  }

  async function resolveAddress(address: Address): Promise<AbiResolution> {
    // 1. Curated wins outright, and costs nothing.
    const label = lookupLabel(chain.id, address)
    if (label?.abi) {
      return { kind: 'full', abi: label.abi, name: label.name, source: 'labelpack', via: null }
    }

    // 2. Proxy before remote: a proxy's own ABI describes the proxy, not the
    //    logic being called, so resolving it would decode nothing useful.
    const implementation = await resolveImplementation(http, chain, address)
    if (implementation) {
      const viaImpl = await direct(implementation)
      if (viaImpl?.kind === 'full') return { ...viaImpl, via: implementation }
    }

    // 3. The address's own verified source.
    const own = await direct(address)
    if (own) return own

    return { kind: 'unknown' }
  }

  return {
    forAddress(input: string) {
      const address = normaliseAddress(input)
      const cached = addressCache.get(address)
      if (cached) return cached
      const pending = resolveAddress(address)
      addressCache.set(address, pending)
      return pending
    },
    forSelector(selector: Hex | string) {
      const key = selector.toLowerCase()
      const cached = selectorCache.get(key)
      if (cached) return cached
      const pending = fetchFourByteSignature(http, key)
      selectorCache.set(key, pending)
      return pending
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/resolve.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/abi/resolve.ts test/resolve.test.ts
git commit -m "feat: add abi resolution ladder with proxy-first ordering"
```

---

### Task 12: Decode call inputs

**Files:**
- Create: `server/decode/calls.ts`
- Test: `test/decode-calls.test.ts`

**Interfaces:**
- Consumes: `AbiResolution`, `AbiResolver` (Task 11).
- Produces:
  - `interface DecodedArg { name: string; type: string; value: string }`
  - `interface DecodedCall { confidence: 'decoded' | 'signatureOnly' | 'raw' | 'nativeTransfer'; contractName: string | null; via: Address | null; functionName: string | null; signature: string | null; selector: Hex | null; args: DecodedArg[]; raw: Hex }`
  - `decodeCallInput(input: Hex, resolver: AbiResolver, target: Address | null): Promise<DecodedCall>`

`confidence` is what the UI renders differently. `raw` must never be dressed up as `decoded` — that is the honesty rule from `CLAUDE.md`.

- [ ] **Step 1: Write the failing test**

Create `test/decode-calls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeCallInput } from '~~/server/decode/calls'
import { createAbiResolver } from '~~/server/abi/resolve'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const unknown = '0x3333333333333333333333333333333333333333'

// transfer(0x2222...2222, 123)
const TRANSFER_INPUT =
  '0xa9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000007b'

describe('decodeCallInput', () => {
  it('decodes a known function with named arguments', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput(TRANSFER_INPUT, resolver, usdc)
    expect(decoded.confidence).toBe('decoded')
    expect(decoded.functionName).toBe('transfer')
    expect(decoded.contractName).toBe('USDC')
    expect(decoded.args).toEqual([
      { name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' },
      { name: 'amount', type: 'uint256', value: '123' },
    ])
  })

  it('reports a native transfer for empty calldata', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput('0x', resolver, unknown)
    expect(decoded.confidence).toBe('nativeTransfer')
    expect(decoded.selector).toBeNull()
    expect(decoded.args).toEqual([])
  })

  it('falls back to a signature-only result when no abi resolves', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [{ id: 1, text_signature: 'transfer(address,uint256)' }],
      },
    })
    const decoded = await decodeCallInput(TRANSFER_INPUT, createAbiResolver(http, chain), unknown)
    expect(decoded.confidence).toBe('signatureOnly')
    expect(decoded.signature).toBe('transfer(address,uint256)')
    expect(decoded.args).toEqual([])
    expect(decoded.raw).toBe(TRANSFER_INPUT)
  })

  it('returns raw when even the selector is unknown', async () => {
    const decoded = await decodeCallInput(TRANSFER_INPUT, createAbiResolver(fakeHttp({}), chain), unknown)
    expect(decoded.confidence).toBe('raw')
    expect(decoded.selector).toBe('0xa9059cbb')
    expect(decoded.functionName).toBeNull()
  })

  it('returns raw when the abi resolves but the selector is not in it', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput('0xdeadbeef', resolver, usdc)
    expect(decoded.confidence).toBe('raw')
    expect(decoded.contractName).toBe('USDC')
  })

  it('serialises bigint arguments as decimal strings, never numbers', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput(TRANSFER_INPUT, resolver, usdc)
    for (const arg of decoded.args) expect(typeof arg.value).toBe('string')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/decode-calls.test.ts`
Expected: FAIL, cannot resolve `~~/server/decode/calls`.

- [ ] **Step 3: Implement**

Create `server/decode/calls.ts`:

```ts
import { type AbiFunction, type Address, type Hex, decodeFunctionData, slice } from 'viem'
import type { AbiResolver } from '~~/server/abi/resolve'

export interface DecodedArg {
  name: string
  type: string
  value: string
}

export interface DecodedCall {
  /** How much we actually know. The UI renders each of these differently. */
  confidence: 'decoded' | 'signatureOnly' | 'raw' | 'nativeTransfer'
  contractName: string | null
  via: Address | null
  functionName: string | null
  signature: string | null
  selector: Hex | null
  args: DecodedArg[]
  raw: Hex
}

/** Everything crossing the API edge is a string. bigints do not survive JSON. */
function stringifyValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(', ')}]`
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  return String(value)
}

export async function decodeCallInput(
  input: Hex,
  resolver: AbiResolver,
  target: Address | null,
): Promise<DecodedCall> {
  const base: DecodedCall = {
    confidence: 'raw',
    contractName: null,
    via: null,
    functionName: null,
    signature: null,
    selector: null,
    args: [],
    raw: input,
  }

  if (!input || input === '0x' || input.length < 10) {
    return { ...base, confidence: 'nativeTransfer' }
  }

  const selector = slice(input, 0, 4)
  const withSelector: DecodedCall = { ...base, selector }

  const resolution = target ? await resolver.forAddress(target) : { kind: 'unknown' as const }

  if (resolution.kind === 'full') {
    const named = { ...withSelector, contractName: resolution.name, via: resolution.via }
    try {
      const { functionName, args } = decodeFunctionData({ abi: resolution.abi, data: input })
      const entry = resolution.abi.find(
        (item): item is AbiFunction => item.type === 'function' && item.name === functionName,
      )
      const inputs = entry?.inputs ?? []
      return {
        ...named,
        confidence: 'decoded',
        functionName,
        signature: `${functionName}(${inputs.map((i) => i.type).join(',')})`,
        args: (args ?? []).map((value, index) => ({
          name: inputs[index]?.name || `arg${index}`,
          type: inputs[index]?.type ?? 'unknown',
          value: stringifyValue(value),
        })),
      }
    } catch {
      // The ABI resolved but does not contain this selector — a proxy pointing
      // at the wrong implementation, or an ABI that is simply incomplete.
      return named
    }
  }

  const signature = await resolver.forSelector(selector)
  if (signature) {
    // A name with no argument types. Do not attempt to decode arguments from
    // it: a 4byte signature is a guess, and wrong arguments are worse than none.
    return { ...withSelector, confidence: 'signatureOnly', signature, functionName: signature.split('(')[0] }
  }

  return withSelector
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/decode-calls.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/decode/calls.ts test/decode-calls.test.ts
git commit -m "feat: decode call inputs with graded confidence"
```

---

### Task 13: Decode logs

**Files:**
- Create: `server/decode/logs.ts`
- Test: `test/decode-logs.test.ts`

**Interfaces:**
- Consumes: `RawLog` (Task 2), `AbiResolver` (Task 11), `DecodedArg` (Task 12), `ERC20_ABI`/`ERC721_ABI`/`ERC1155_ABI`/`WETH_ABI` (Task 8).
- Produces:
  - `interface DecodedLog { confidence: 'decoded' | 'raw'; address: Address; contractName: string | null; eventName: string | null; signature: string | null; args: DecodedArg[]; topic0: Hex | null; logIndex: number }`
  - `decodeLogs(logs: RawLog[], resolver: AbiResolver): Promise<DecodedLog[]>`

**Why a standard-event fallback exists:** `Transfer` has the same topic0 on every ERC-20 in existence, so an unverified token's transfers are still decodable. ERC-20 and ERC-721 `Transfer` differ only in whether the third parameter is indexed, which changes the topic count — so trying both and keeping whichever decodes is correct, not a hack.

- [ ] **Step 1: Write the failing test**

Create `test/decode-logs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RawLog } from '~~/shared/types'
import { decodeLogs } from '~~/server/decode/logs'
import { createAbiResolver } from '~~/server/abi/resolve'
import { fakeHttp } from './helpers/fakeHttp'
import { getChain } from '~~/shared/chains'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const mystery = '0x3333333333333333333333333333333333333333'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const from = '0x0000000000000000000000001111111111111111111111111111111111111111'
const to = '0x0000000000000000000000002222222222222222222222222222222222222222'
const amount = '0x000000000000000000000000000000000000000000000000000000000000007b'

function erc20Transfer(address: string, logIndex = 0): RawLog {
  return { address, topics: [TRANSFER_TOPIC, from, to], data: amount, logIndex } as RawLog
}

describe('decodeLogs', () => {
  it('decodes a transfer using the resolved contract abi', async () => {
    const [log] = await decodeLogs([erc20Transfer(usdc)], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.eventName).toBe('Transfer')
    expect(log.contractName).toBe('USDC')
    expect(log.args).toEqual([
      { name: 'from', type: 'address', value: '0x1111111111111111111111111111111111111111' },
      { name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' },
      { name: 'value', type: 'uint256', value: '123' },
    ])
  })

  it('decodes a transfer on an unverified contract via the standard event abis', async () => {
    const [log] = await decodeLogs([erc20Transfer(mystery)], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.eventName).toBe('Transfer')
    expect(log.contractName).toBeNull()
  })

  it('decodes an erc-721 transfer, where tokenId is indexed', async () => {
    const nft: RawLog = {
      address: mystery,
      topics: [TRANSFER_TOPIC, from, to, amount],
      data: '0x',
      logIndex: 0,
    } as RawLog
    const [log] = await decodeLogs([nft], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.args.at(-1)).toEqual({ name: 'tokenId', type: 'uint256', value: '123' })
  })

  it('returns raw for an event it cannot decode', async () => {
    const odd: RawLog = { address: mystery, topics: ['0xdeadbeef'], data: '0x', logIndex: 3 } as RawLog
    const [log] = await decodeLogs([odd], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('raw')
    expect(log.eventName).toBeNull()
    expect(log.topic0).toBe('0xdeadbeef')
    expect(log.logIndex).toBe(3)
  })

  it('handles an anonymous event with no topics at all', async () => {
    const anon: RawLog = { address: mystery, topics: [], data: '0x1234', logIndex: 1 } as RawLog
    const [log] = await decodeLogs([anon], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('raw')
    expect(log.topic0).toBeNull()
  })

  it('preserves input order', async () => {
    const logs = [erc20Transfer(usdc, 5), erc20Transfer(mystery, 2)]
    const decoded = await decodeLogs(logs, createAbiResolver(fakeHttp({}), chain))
    expect(decoded.map((l) => l.logIndex)).toEqual([5, 2])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/decode-logs.test.ts`
Expected: FAIL, cannot resolve `~~/server/decode/logs`.

- [ ] **Step 3: Implement**

Create `server/decode/logs.ts`:

```ts
import { type Abi, type AbiEvent, type Address, type Hex, decodeEventLog } from 'viem'
import type { RawLog } from '~~/shared/types'
import type { AbiResolver } from '~~/server/abi/resolve'
import { ERC1155_ABI, ERC20_ABI, ERC721_ABI, WETH_ABI } from '~~/server/abi/labelpack.data'
import type { DecodedArg } from './calls'

export interface DecodedLog {
  confidence: 'decoded' | 'raw'
  address: Address
  contractName: string | null
  eventName: string | null
  signature: string | null
  args: DecodedArg[]
  topic0: Hex | null
  logIndex: number
}

/**
 * Tried when a contract's own ABI is unavailable or does not contain the event.
 * Standard event topics are identical across every implementation, so an
 * unverified token's transfers still decode.
 */
const STANDARD_ABIS: Abi[] = [ERC20_ABI, ERC721_ABI, ERC1155_ABI, WETH_ABI]

function stringifyValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(', ')}]`
  if (value === null || value === undefined) return ''
  return String(value)
}

function attempt(abi: Abi, log: RawLog): Pick<DecodedLog, 'eventName' | 'signature' | 'args'> | null {
  try {
    const { eventName, args } = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    const entry = abi.find(
      (item): item is AbiEvent => item.type === 'event' && item.name === eventName,
    )
    const inputs = entry?.inputs ?? []
    const values = args as Record<string, unknown> | readonly unknown[] | undefined

    const mapped: DecodedArg[] = inputs.map((input, index) => {
      const name = input.name || `arg${index}`
      const raw = Array.isArray(values)
        ? values[index]
        : (values as Record<string, unknown> | undefined)?.[name]
      return { name, type: input.type, value: stringifyValue(raw) }
    })

    return {
      eventName,
      signature: `${eventName}(${inputs.map((i) => i.type).join(',')})`,
      args: mapped,
    }
  } catch {
    return null
  }
}

export async function decodeLogs(logs: RawLog[], resolver: AbiResolver): Promise<DecodedLog[]> {
  return Promise.all(
    logs.map(async (log): Promise<DecodedLog> => {
      const resolution = await resolver.forAddress(log.address)
      const contractName = resolution.kind === 'full' ? resolution.name : null

      const base: DecodedLog = {
        confidence: 'raw',
        address: log.address,
        contractName,
        eventName: null,
        signature: null,
        args: [],
        topic0: (log.topics[0] as Hex | undefined) ?? null,
        logIndex: log.logIndex,
      }

      if (log.topics.length === 0) return base

      const candidates: Abi[] = resolution.kind === 'full' ? [resolution.abi, ...STANDARD_ABIS] : STANDARD_ABIS

      for (const abi of candidates) {
        const decoded = attempt(abi, log)
        if (decoded) return { ...base, confidence: 'decoded', ...decoded }
      }

      return base
    }),
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/decode-logs.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/decode/logs.ts test/decode-logs.test.ts
git commit -m "feat: decode logs with standard event fallback"
```

---

### Task 14: The API route

**Files:**
- Create: `shared/wire.ts`, `server/api/tx/[chain]/[hash].get.ts`
- Test: `test/wire.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `interface TxPayload` — the wire format, all integers as decimal strings
  - `toWire(tx: RawTransaction, call: DecodedCall, logs: DecodedLog[]): TxPayload`
  - `GET /api/tx/:chain/:hash`

The route orchestrates and nothing else. `toWire` holds the serialisation and is unit-tested; the route itself needs no test beyond the e2e in Task 16.

- [ ] **Step 1: Write the failing test**

Create `test/wire.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RawTransaction } from '~~/shared/types'
import { toWire } from '~~/shared/wire'

const tx: RawTransaction = {
  chainId: 1,
  hash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
  blockNumber: 21000000n,
  timestamp: 1768473000,
  from: '0x1111111111111111111111111111111111111111',
  to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  value: 1000000000000000000n,
  input: '0x',
  status: 'success',
  revertReason: null,
  gasUsed: 52000n,
  effectiveGasPrice: 12000000000n,
  logs: [],
  activity: {
    kind: 'flat',
    calls: [
      {
        kind: 'CALL',
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        value: 500000000000000000n,
        error: null,
      },
    ],
  },
  provenance: 'internalTransactions',
  sourceName: 'blockscout',
}

const call = {
  confidence: 'nativeTransfer' as const,
  contractName: null, via: null, functionName: null, signature: null,
  selector: null, args: [], raw: '0x' as const,
}

describe('toWire', () => {
  it('serialises every bigint as a decimal string', () => {
    const wire = toWire(tx, call, [])
    expect(wire.blockNumber).toBe('21000000')
    expect(wire.value).toBe('1000000000000000000')
    expect(wire.gasUsed).toBe('52000')
    expect(wire.effectiveGasPrice).toBe('12000000000')
  })

  it('computes the fee as gasUsed times effectiveGasPrice', () => {
    expect(toWire(tx, call, []).feeWei).toBe((52000n * 12000000000n).toString())
  })

  it('serialises flat call values as strings and keeps the kind discriminator', () => {
    const wire = toWire(tx, call, [])
    expect(wire.activity.kind).toBe('flat')
    if (wire.activity.kind === 'flat') {
      expect(wire.activity.calls[0].value).toBe('500000000000000000')
    }
  })

  it('survives JSON round-tripping without loss', () => {
    const wire = toWire(tx, call, [])
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire)
  })

  it('carries provenance and source name through', () => {
    const wire = toWire(tx, call, [])
    expect(wire.provenance).toBe('internalTransactions')
    expect(wire.sourceName).toBe('blockscout')
  })
})
```

The JSON round-trip test is the one that catches a stray `bigint` anywhere in the payload — `JSON.stringify` throws on them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/wire.test.ts`
Expected: FAIL, cannot resolve `~~/shared/wire`.

- [ ] **Step 3: Implement the wire format**

Create `shared/wire.ts`:

```ts
import type { Address, Hex } from 'viem'
import type { CallKind, RawTransaction, TraceProvenance } from './types'
import type { DecodedCall } from '~~/server/decode/calls'
import type { DecodedLog } from '~~/server/decode/logs'

export interface WireFlatCall {
  kind: CallKind
  from: Address
  to: Address | null
  value: string
  error: string | null
}

export type WireActivity =
  | { kind: 'flat'; calls: WireFlatCall[] }
  | { kind: 'none' }

export interface TxPayload {
  chainId: number
  hash: Hex
  blockNumber: string
  timestamp: number
  from: Address
  to: Address | null
  value: string
  status: 'success' | 'reverted'
  revertReason: string | null
  gasUsed: string
  effectiveGasPrice: string
  feeWei: string
  call: DecodedCall
  logs: DecodedLog[]
  activity: WireActivity
  provenance: TraceProvenance
  sourceName: string
}

export function toWire(tx: RawTransaction, call: DecodedCall, logs: DecodedLog[]): TxPayload {
  const activity: WireActivity =
    tx.activity.kind === 'flat'
      ? {
          kind: 'flat',
          calls: tx.activity.calls.map((c) => ({
            kind: c.kind,
            from: c.from,
            to: c.to,
            value: c.value.toString(),
            error: c.error,
          })),
        }
      : { kind: 'none' }

  return {
    chainId: tx.chainId,
    hash: tx.hash,
    blockNumber: tx.blockNumber.toString(),
    timestamp: tx.timestamp,
    from: tx.from,
    to: tx.to,
    value: tx.value.toString(),
    status: tx.status,
    revertReason: tx.revertReason,
    gasUsed: tx.gasUsed.toString(),
    effectiveGasPrice: tx.effectiveGasPrice.toString(),
    feeWei: (tx.gasUsed * tx.effectiveGasPrice).toString(),
    call,
    logs,
    activity,
    provenance: tx.provenance,
    sourceName: tx.sourceName,
  }
}
```

`RawTransaction.activity` can be `{ kind: 'tree' }` in the domain model, but no phase 1 source produces one, so `toWire` maps it to `none`. When a callTracer source lands, extend `WireActivity` with a `tree` variant and the compiler will point at every place that needs updating.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/wire.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the route**

Create `server/api/tx/[chain]/[hash].get.ts`:

```ts
import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeCallInput } from '~~/server/decode/calls'
import { decodeLogs } from '~~/server/decode/logs'
import { fetchTransaction } from '~~/server/sources/registry'
import { createHttpClient } from '~~/server/utils/http'
import { parseTxRef } from '~~/server/utils/txref'
import { toWire } from '~~/shared/wire'

export default defineEventHandler(async (event) => {
  const parsed = parseTxRef(
    getRouterParam(event, 'chain'),
    getRouterParam(event, 'hash'),
  )
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.reason })
  }

  const { chain, hash } = parsed.ref
  const http = createHttpClient()

  const tx = await fetchTransaction(http, chain, hash)
  if (!tx) {
    throw createError({ statusCode: 404, statusMessage: 'transaction not found' })
  }

  const resolver = createAbiResolver(http, chain)
  const [call, logs] = await Promise.all([
    decodeCallInput(tx.input, resolver, tx.to),
    decodeLogs(tx.logs, resolver),
  ])

  return toWire(tx, call, logs)
})
```

- [ ] **Step 6: Verify the route against a real transaction**

```bash
pnpm dev
```

In another terminal, using a real recent Ethereum hash:

```bash
curl -s "http://localhost:3000/api/tx/ethereum/<REAL_HASH>" | head -c 2000
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/api/tx/ethereum/0xdeadbeef"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/api/tx/dogecoin/<REAL_HASH>"
```

Expected: a JSON payload, then `400`, then `400`. If the first returns 404, the Blockscout field names differ from Task 6's fixture — fix the fixture, the interfaces, and the test together, and say so in your report.

- [ ] **Step 7: Commit**

```bash
git add shared/wire.ts server/api test/wire.test.ts
git commit -m "feat: add tx api route with string-serialised wire format"
```

---

### Task 15: Presentational components

**Files:**
- Create: `app/components/ProvenanceChip.vue`, `app/components/CallRow.vue`, `app/components/CallActivity.vue`
- Test: `test/components.test.ts`

**Interfaces:**
- Consumes: `TraceProvenance` (Task 2), `WireActivity`/`TxPayload` (Task 14), `DecodedCall` (Task 12).
- Produces: three prop-driven components. None of them fetches anything.

If the scaffold from Task 1 produced a Nuxt 3 layout with no `app/` directory, put these in `components/` instead and keep the rest of the plan's paths consistent with that choice.

- [ ] **Step 1: Install component testing dependencies**

```bash
pnpm add -D @vue/test-utils happy-dom
```

- [ ] **Step 2: Write the failing test**

Create `test/components.test.ts`:

```ts
// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CallActivity from '~~/app/components/CallActivity.vue'
import CallRow from '~~/app/components/CallRow.vue'
import ProvenanceChip from '~~/app/components/ProvenanceChip.vue'

describe('ProvenanceChip', () => {
  it('names the degraded source plainly', () => {
    const wrapper = mount(ProvenanceChip, { props: { provenance: 'logsOnly' } })
    expect(wrapper.text()).toContain('logs only')
    expect(wrapper.text()).toContain('no call data')
  })

  it('names the best source', () => {
    const wrapper = mount(ProvenanceChip, { props: { provenance: 'callTracer' } })
    expect(wrapper.text()).toContain('full trace')
  })
})

describe('CallRow', () => {
  const decoded = {
    confidence: 'decoded' as const,
    contractName: 'USDC',
    via: null,
    functionName: 'transfer',
    signature: 'transfer(address,uint256)',
    selector: '0xa9059cbb' as const,
    args: [{ name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' }],
    raw: '0xa9059cbb' as const,
  }

  it('shows the function name and arguments when decoded', () => {
    const wrapper = mount(CallRow, { props: { call: decoded } })
    expect(wrapper.text()).toContain('transfer')
    expect(wrapper.text()).toContain('USDC')
    expect(wrapper.text()).toContain('to')
  })

  it('marks a signature-only result as unverified rather than showing it plainly', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, confidence: 'signatureOnly', args: [] } },
    })
    expect(wrapper.text()).toContain('signature only')
  })

  it('shows the selector and raw calldata when nothing decoded', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, confidence: 'raw', functionName: null, args: [] } },
    })
    expect(wrapper.text()).toContain('0xa9059cbb')
  })

  it('escapes a hostile contract name instead of rendering it as markup', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, contractName: '<img src=x onerror=alert(1)>' } },
    })
    expect(wrapper.html()).not.toContain('<img')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('truncates an absurdly long contract name', () => {
    const wrapper = mount(CallRow, { props: { call: { ...decoded, contractName: 'A'.repeat(500) } } })
    expect(wrapper.text()).not.toContain('A'.repeat(200))
  })
})

describe('CallActivity', () => {
  it('renders a flat list of internal calls', () => {
    const wrapper = mount(CallActivity, {
      props: {
        activity: {
          kind: 'flat',
          calls: [
            {
              kind: 'CALL',
              from: '0x1111111111111111111111111111111111111111',
              to: '0x2222222222222222222222222222222222222222',
              value: '500000000000000000',
              error: null,
            },
          ],
        },
      },
    })
    expect(wrapper.findAll('[data-test="call"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('0.5')
  })

  it('says so plainly when there is no call data, rather than rendering nothing', () => {
    const wrapper = mount(CallActivity, { props: { activity: { kind: 'none' } } })
    expect(wrapper.text()).toContain('No internal call data')
  })
})
```

The escaping test is a direct check of a `CLAUDE.md` hard constraint. Do not delete it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run test/components.test.ts`
Expected: FAIL, cannot resolve the components.

- [ ] **Step 4: Implement ProvenanceChip**

Create `app/components/ProvenanceChip.vue`:

```vue
<script setup lang="ts">
import type { TraceProvenance } from '~~/shared/types'

const props = defineProps<{ provenance: TraceProvenance }>()

const COPY: Record<TraceProvenance, { label: string; detail: string; tone: string }> = {
  callTracer: { label: 'full trace', detail: 'nested call frames and per-frame gas', tone: 'good' },
  internalTransactions: { label: 'internal transactions', detail: 'flat call list, no nesting', tone: 'partial' },
  logsOnly: { label: 'logs only', detail: 'no call data available for this transaction', tone: 'degraded' },
}

const copy = computed(() => COPY[props.provenance])
</script>

<template>
  <span class="chip" :data-tone="copy.tone" :title="copy.detail">
    <span class="dot" />
    {{ copy.label }}
    <span class="detail">{{ copy.detail }}</span>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5ch;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 2px;
  color: var(--text-dim);
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--tone); align-self: center; }
.chip[data-tone='good'] { --tone: var(--ok); }
.chip[data-tone='partial'] { --tone: var(--warn); }
.chip[data-tone='degraded'] { --tone: var(--bad); }
.detail { color: var(--text-faint); }
</style>
```

- [ ] **Step 5: Implement CallRow**

Create `app/components/CallRow.vue`:

```vue
<script setup lang="ts">
import type { DecodedCall } from '~~/server/decode/calls'
import { truncateAddress } from '~~/shared/address'

const props = defineProps<{ call: DecodedCall }>()

/** Contract-supplied strings are hostile input. Cap them. See CLAUDE.md. */
const MAX_NAME = 64
const safeName = computed(() => {
  const name = props.call.contractName
  if (!name) return null
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME)}…` : name
})
</script>

<template>
  <div class="row" :data-confidence="call.confidence">
    <div class="head">
      <span v-if="safeName" class="contract">{{ safeName }}</span>
      <span v-if="call.functionName" class="fn">{{ call.functionName }}</span>
      <code v-else-if="call.selector" class="selector">{{ call.selector }}</code>
      <span v-if="call.confidence === 'signatureOnly'" class="flag">signature only — arguments not decoded</span>
      <span v-else-if="call.confidence === 'raw'" class="flag">could not decode</span>
      <span v-else-if="call.confidence === 'nativeTransfer'" class="flag">plain transfer, no calldata</span>
    </div>

    <dl v-if="call.args.length" class="args">
      <template v-for="arg in call.args" :key="arg.name">
        <dt>{{ arg.name }} <span class="type">{{ arg.type }}</span></dt>
        <dd>{{ arg.type === 'address' ? truncateAddress(arg.value) : arg.value }}</dd>
      </template>
    </dl>

    <p v-if="call.via" class="via">
      decoded through implementation <code>{{ truncateAddress(call.via) }}</code>
    </p>
  </div>
</template>

<style scoped>
.row { border: 1px solid var(--line); padding: 0.75rem 1rem; }
.head { display: flex; flex-wrap: wrap; gap: 0.75ch; align-items: baseline; }
.contract { color: var(--text-dim); font-size: 0.8rem; }
.fn { font-family: var(--font-mono); color: var(--accent); }
.selector { font-family: var(--font-mono); color: var(--text-faint); }
.flag { font-size: 0.75rem; color: var(--warn); }
.args { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1.5rem; margin: 0.75rem 0 0; }
dt { font-size: 0.8rem; color: var(--text-dim); }
.type { color: var(--text-faint); }
dd { margin: 0; font-family: var(--font-mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.via { margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--text-faint); }
.row[data-confidence='raw'] { border-left: 2px solid var(--bad); }
.row[data-confidence='signatureOnly'] { border-left: 2px solid var(--warn); }
</style>
```

- [ ] **Step 6: Implement CallActivity**

Create `app/components/CallActivity.vue`:

```vue
<script setup lang="ts">
import { formatEther } from 'viem'
import type { WireActivity } from '~~/shared/wire'
import { truncateAddress } from '~~/shared/address'

defineProps<{ activity: WireActivity }>()

function eth(value: string): string {
  return `${formatEther(BigInt(value))} ETH`
}
</script>

<template>
  <section>
    <ul v-if="activity.kind === 'flat'" class="list">
      <li v-for="(call, index) in activity.calls" :key="index" data-test="call" class="call">
        <span class="kind">{{ call.kind }}</span>
        <code>{{ truncateAddress(call.from) }}</code>
        <span class="arrow">→</span>
        <code>{{ call.to ? truncateAddress(call.to) : 'contract creation' }}</code>
        <span v-if="call.value !== '0'" class="value">{{ eth(call.value) }}</span>
        <span v-if="call.error" class="error">{{ call.error }}</span>
      </li>
    </ul>

    <p v-else class="empty">
      No internal call data. This source only exposes event logs for this
      transaction, so calls that moved no tokens are invisible here.
    </p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; background: var(--line); }
.call {
  display: flex; flex-wrap: wrap; gap: 1ch; align-items: baseline;
  background: var(--bg); padding: 0.5rem 0.75rem;
  font-family: var(--font-mono); font-size: 0.8rem; font-variant-numeric: tabular-nums;
}
.kind { color: var(--text-faint); min-width: 11ch; }
.arrow { color: var(--text-faint); }
.value { color: var(--accent); margin-left: auto; }
.error { color: var(--bad); }
.empty { color: var(--text-dim); font-size: 0.875rem; max-width: 60ch; }
</style>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run test/components.test.ts`
Expected: 9 passed.

- [ ] **Step 8: Commit**

```bash
git add app/components test/components.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add call activity and provenance components"
```

---

### Task 16: Pages, styling, and the first real render

**Files:**
- Create: `app/assets/base.css`, `app/app.vue`, `app/pages/index.vue`, `app/pages/tx/[chain]/[hash].vue`
- Modify: `nuxt.config.ts`
- Test: manual verification (steps below); automated e2e arrives in phase 2

**Interfaces:**
- Consumes: `TxPayload` (Task 14), the three components (Task 15).
- Produces: the routes `/` and `/tx/:chain/:hash`.

- [ ] **Step 1: Write the base stylesheet**

Create `app/assets/base.css`. Instrument-panel direction per `CLAUDE.md`: dark slate, tabular numerals, mono for hashes.

```css
:root {
  --bg: #0d1117;
  --bg-raised: #161b22;
  --line: #232b36;
  --text: #e6edf3;
  --text-dim: #9aa7b4;
  --text-faint: #5f6b78;
  --accent: #a78bfa;
  --ok: #3fb950;
  --warn: #d29922;
  --bad: #f85149;
  --font-ui: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
}

a { color: var(--accent); }
code { font-family: var(--font-mono); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Register the stylesheet**

In `nuxt.config.ts`, add `css: ['~/assets/base.css']` alongside the existing options. If the scaffold is Nuxt 3 without an `app/` directory, the path is `~/assets/base.css` relative to the project root either way — verify the file resolves by loading the dev server.

- [ ] **Step 3: Write the app shell**

Create `app/app.vue`:

```vue
<template>
  <div class="shell">
    <header>
      <NuxtLink to="/" class="brand">TxLens</NuxtLink>
      <span class="tagline">read-only · no wallet connection, ever</span>
    </header>
    <main><NuxtPage /></main>
  </div>
</template>

<style scoped>
.shell { max-width: 60rem; margin: 0 auto; padding: 2rem 1.25rem 6rem; }
header { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 3rem; flex-wrap: wrap; }
.brand { font-family: var(--font-mono); font-size: 1.1rem; text-decoration: none; color: var(--text); }
.tagline { font-size: 0.75rem; color: var(--text-faint); }
</style>
```

- [ ] **Step 4: Write the index page**

Create `app/pages/index.vue`:

```vue
<script setup lang="ts">
const hash = ref('')
const router = useRouter()
const error = ref<string | null>(null)

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

function submit() {
  const value = hash.value.trim()
  if (!HASH_PATTERN.test(value)) {
    error.value = 'That does not look like a transaction hash — expected 0x followed by 64 hex characters.'
    return
  }
  error.value = null
  router.push(`/tx/ethereum/${value.toLowerCase()}`)
}
</script>

<template>
  <div>
    <h1>What actually happened in this transaction?</h1>

    <form @submit.prevent="submit">
      <label for="hash" class="sr-only">Transaction hash</label>
      <input
        id="hash"
        v-model="hash"
        placeholder="0x…"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="error ? 'true' : undefined"
      >
      <button type="submit">Decode</button>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <p class="note">Ethereum mainnet. More chains coming.</p>
  </div>
</template>

<style scoped>
h1 { font-size: 1.5rem; font-weight: 500; max-width: 24ch; margin: 0 0 2rem; }
form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
input {
  flex: 1 1 30rem; padding: 0.6rem 0.75rem; background: var(--bg-raised);
  border: 1px solid var(--line); color: var(--text); font-family: var(--font-mono); font-size: 0.85rem;
}
button {
  padding: 0.6rem 1.25rem; background: var(--accent); border: 0; color: #16121f;
  font-weight: 500; cursor: pointer;
}
.error { color: var(--bad); font-size: 0.85rem; }
.note { color: var(--text-faint); font-size: 0.8rem; margin-top: 2rem; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
</style>
```

- [ ] **Step 5: Write the transaction page**

Create `app/pages/tx/[chain]/[hash].vue`:

```vue
<script setup lang="ts">
import { formatEther } from 'viem'
import type { TxPayload } from '~~/shared/wire'
import { truncateAddress } from '~~/shared/address'

const route = useRoute()
const { chain, hash } = route.params as { chain: string; hash: string }

const { data, error, pending } = await useFetch<TxPayload>(`/api/tx/${chain}/${hash}`)

function eth(value: string): string {
  return `${formatEther(BigInt(value))} ETH`
}
</script>

<template>
  <div>
    <p v-if="pending">Decoding…</p>

    <div v-else-if="error" class="failed" role="alert">
      <h1>Could not decode this transaction</h1>
      <p>{{ error.statusMessage ?? 'Something went wrong upstream.' }}</p>
      <NuxtLink to="/">Try another hash</NuxtLink>
    </div>

    <article v-else-if="data">
      <header class="summary">
        <code class="hash">{{ data.hash }}</code>
        <div class="meta">
          <span :data-status="data.status">{{ data.status }}</span>
          <ProvenanceChip :provenance="data.provenance" />
        </div>
        <p v-if="data.revertReason" class="revert">Reverted: {{ data.revertReason }}</p>
      </header>

      <dl class="facts">
        <dt>From</dt><dd><code>{{ truncateAddress(data.from) }}</code></dd>
        <dt>To</dt><dd><code>{{ data.to ? truncateAddress(data.to) : 'contract creation' }}</code></dd>
        <dt>Value</dt><dd>{{ eth(data.value) }}</dd>
        <dt>Fee</dt><dd>{{ eth(data.feeWei) }}</dd>
        <dt>Gas used</dt><dd>{{ data.gasUsed }}</dd>
      </dl>

      <h2>Call</h2>
      <CallRow :call="data.call" />

      <h2>Internal calls</h2>
      <CallActivity :activity="data.activity" />

      <h2>Events <span class="count">{{ data.logs.length }}</span></h2>
      <ul class="logs">
        <li v-for="log in data.logs" :key="log.logIndex">
          <span class="event">{{ log.eventName ?? 'unknown event' }}</span>
          <span class="from">{{ log.contractName ?? truncateAddress(log.address) }}</span>
          <span v-if="log.confidence === 'raw'" class="flag">could not decode</span>
          <dl v-else class="args">
            <template v-for="arg in log.args" :key="arg.name">
              <dt>{{ arg.name }}</dt>
              <dd>{{ arg.type === 'address' ? truncateAddress(arg.value) : arg.value }}</dd>
            </template>
          </dl>
        </li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.summary { border-bottom: 1px solid var(--line); padding-bottom: 1rem; margin-bottom: 1.5rem; }
.hash { font-size: 0.8rem; color: var(--text-dim); overflow-wrap: anywhere; }
.meta { display: flex; gap: 1rem; align-items: center; margin-top: 0.75rem; flex-wrap: wrap; }
[data-status='success'] { color: var(--ok); }
[data-status='reverted'] { color: var(--bad); }
.revert { color: var(--bad); font-family: var(--font-mono); font-size: 0.8rem; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 2rem; margin: 0 0 2.5rem; }
dt { color: var(--text-dim); font-size: 0.85rem; }
dd { margin: 0; font-family: var(--font-mono); font-size: 0.85rem; }
h2 { font-size: 0.85rem; font-weight: 500; color: var(--text-dim); text-transform: uppercase;
     letter-spacing: 0.08em; margin: 2.5rem 0 0.75rem; }
.count { color: var(--text-faint); }
.logs { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; background: var(--line); }
.logs li { background: var(--bg); padding: 0.6rem 0.75rem; font-size: 0.8rem; }
.event { font-family: var(--font-mono); color: var(--accent); margin-right: 1ch; }
.from { color: var(--text-dim); }
.flag { color: var(--warn); margin-left: 1ch; }
.args { display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 1.5rem; margin: 0.4rem 0 0; }
.failed h1 { font-size: 1.1rem; }
</style>
```

- [ ] **Step 6: Verify by hand in a browser**

```bash
pnpm dev
```

Check each of these, and do not tick this step until all five hold:
1. `/` renders, the input is focusable, and submitting junk shows the inline error rather than navigating.
2. `/tx/ethereum/<a real hash>` renders a decoded call, internal calls, and events.
3. A transaction against an **unverified** contract shows `could not decode` rather than a blank area.
4. A **reverted** transaction shows the revert reason.
5. The provenance chip reads `internal transactions` or `logs only`, and matches what the API actually returned.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app nuxt.config.ts
git commit -m "feat: add index and transaction pages"
```

- [ ] **Step 9: Update the spec to match reality**

Two deliberate deviations were recorded during this phase. Fold both into `docs/SPEC.md` so the spec stays the source of truth:

1. **Section 4** — describe `CallActivity` as a three-way discriminated union (`tree` / `flat` / `none`), and state that Blockscout yields a flat list rather than a tree.
2. **Section 5** — describe proxy resolution as two rungs: Blockscout's resolved `implementations` field first (keyless, available now), EIP-1967 storage-slot reading second (arrives with the keyed RPC source).

```bash
git add docs/SPEC.md
git commit -m "docs: align spec with phase 1 call activity and proxy resolution"
```

---

## Phase 1 exit criteria

All of these must hold before phase 2 starts:

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes.
- [ ] The whole test suite runs with no network access.
- [ ] A real mainnet transaction renders end to end on the deployed URL.
- [ ] An unverified contract renders as undecoded rather than blank or fabricated.
- [ ] The provenance chip reflects the actual source that answered.
- [ ] No wallet library, no LLM SDK, and no `any` without a justifying comment.
- [ ] `docs/SPEC.md` matches what was built.

## Self-review record

Checked before handing this plan to an implementer.

**Spec coverage.** Spec §4 layers one and three are covered by Tasks 6–7; layer two (keyed `debug_traceTransaction`) is deferred to phase 2 and the `TxSource` interface exists for it. Spec §5's resolution ladder is Tasks 8–11, with the proxy-detection mechanism deviating deliberately and recorded in Task 10. Spec §6 (value graph), §7 (narrative), §8 (caching), and §10 items 1–2 (landing page) are phase 2 and later, listed as out of scope at the top of this plan. Spec §12's validation, rate-limit and escaping requirements are covered by Tasks 4, 15 and the route; per-IP rate limiting arrives with caching in phase 2.

**Placeholders.** None. Two places intentionally require the implementer to substitute a real transaction hash they pick themselves (Task 6 Step 1, Task 14 Step 6) — the surrounding assertions do not depend on which one.

**Type consistency.** `AbiResolver` exposes `forAddress` and `forSelector`, used under those names in Tasks 12 and 13. `DecodedCall.confidence` has four variants across Tasks 12, 15 and 16. `CallActivity` in the domain model has three variants; `WireActivity` deliberately has two, because no phase 1 source emits a tree, and Task 14 notes what to change when one does. `DecodedArg` is defined once in Task 12 and imported by Task 13 rather than redeclared.

## Execution handoff

Two options:

1. **Subagent-driven (recommended)** — a fresh subagent per task, with a review between each.
2. **Inline** — batch execution with checkpoints.
