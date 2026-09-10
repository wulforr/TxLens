# TxLens — design specification

> Paste an EVM transaction hash. Get the call tree in plain English, a diagram of
> every token that moved, and where the gas actually went.

Status: design approved, not yet implemented.
Visual direction: instrument panel — dark slate, tabular numerals, colour as categorical encoding. See the root README.

---

## 1. Why this exists

Block explorers show you a transaction as a wall of hexadecimal and a flat list of
"internal transactions". Understanding what actually happened — who paid whom,
through which contracts, and why it cost what it cost — is a skill people acquire
slowly and painfully.

TxLens renders the same data as three things a human can read: a **narrative**, a
**flow diagram**, and a **gas breakdown**.

### What it proves to a reader

- Modelling data from a hostile external system: inconsistent RPC support,
  missing ABIs, proxy contracts, and four different token standards.
- A layered fallback strategy where each data source has different guarantees,
  and the UI states which one answered.
- Recursive tree rendering and a non-trivial diagram (a Sankey over a
  multi-party value graph, which is not the tutorial case).
- A caching design where the correct TTL is *infinite*, and knowing why that is
  true is the whole insight.
- Vue and Nuxt used properly — server routes keeping keys off the client,
  suspense boundaries, URL as application state.

### Non-goals

- No wallet connection. Nothing is signed, nothing is sent. Read-only by design,
  and say so prominently — it removes the visitor's hesitation to paste a hash.
- No portfolio tracking, no PnL, no address history. One transaction at a time.
- No simulation of pending or hypothetical transactions.
- No non-EVM chains.
- No LLM anywhere. The narrative is rule-based, which makes it deterministic,
  free, and instant. This is a feature, not a compromise.

---

## 2. User journeys

### J1 — The ten-second visitor

Lands on `/`. Three example transactions are presented with names, not hashes:
"a sandwich attack", "a bridge deposit", "the Euler exploit". Clicks one. The page
paints from cache instantly with a narrative, a Sankey, and a call tree. No input
required.

### J2 — The person with a hash

Pastes it, picks a chain (or lets detection try each). Gets the same view at
`/tx/:chain/:hash`, which is a shareable, cacheable URL.

### J3 — The person reading a confusing swap

Expands the call tree, sees that their "simple swap" went through a router, two
pools, and a fee-on-transfer token. Hovers a frame, the corresponding edge in the
Sankey highlights. Understands where the slippage went.

### J4 — The engineer looking at the source

Follows the GitHub link because the diagram was good. Reads the ABI-resolution
section of the README. This is the actual conversion event that matters.

---

## 3. Architecture

```
┌──────────────────────── Browser (Vue 3) ────────────────────────┐
│  Narrative   Sankey (d3-sankey)   Call tree   Gas breakdown     │
│      ▲            ▲                    ▲            ▲           │
└──────┴────────────┴────────────────────┴────────────┴───────────┘
                             │  single JSON payload
┌────────────────────────────▼────────────────────────────────────┐
│  Nitro server routes  (Cloudflare Pages Functions)              │
│                                                                  │
│  GET /api/tx/:chain/:hash                                        │
│    1. cache lookup  ──────────────────────────► hit → return     │
│    2. fetch: receipt, tx, logs, internal calls                   │
│    3. resolve ABIs for every address touched                     │
│    4. decode: call inputs, event logs                            │
│    5. build value graph (native + ERC-20/721/1155)               │
│    6. interpret → narrative                                      │
│    7. cache forever (if finalized)                               │
└──────┬──────────────────┬───────────────────┬───────────────────┘
       │                  │                   │
 ┌─────▼──────┐   ┌───────▼────────┐   ┌──────▼──────┐
 │ Upstash    │   │  RPC / indexer │   │ ABI sources │
 │ Redis      │   │  layered       │   │ layered     │
 └────────────┘   └────────────────┘   └─────────────┘
```

The client never talks to an RPC directly. All keys stay in Nitro.

---

## 4. The hard part, one: getting trace data for free

`debug_traceTransaction` is the clean way to get a call tree, and almost no free
public RPC exposes it. The design is therefore a **layered source strategy**,
tried in order, with the answer tagged by which layer served it:

1. **Blockscout-family public APIs** — most major EVM chains have a public
   instance offering internal transactions, token transfers, and decoded input
   with no key required. This is the default and covers the common case.
2. **A keyed provider's `debug_traceTransaction` with `callTracer`** — richer
   (per-frame gas, revert reasons, failed subcalls) where the free tier allows it.
   Verify which providers still offer this on a free key at build time.
3. **Reconstruction from logs alone** — no call tree, but token flows and the
   narrative still work. Degraded, and labelled as such in the UI.

**Call data is a three-way union, not an optional tree.** Blockscout returns internal
transactions as a *flat list* with no parent information, so only a real `callTracer`
can ever produce nesting. The domain model is therefore
`{ kind: 'tree' } | { kind: 'flat' } | { kind: 'none' }`, which forces the UI to render
the degraded case honestly rather than drawing a one-level hierarchy that implies
structure the source never provided.

**Both sub-endpoints paginate at 50 items.** Reading one page silently truncated large
transactions: a real 6.8M-gas transaction returned 50 logs and zero internal calls, when
it actually has 400 and 900. Pagination follows `next_page_params` up to a 20-page cap.

**Coverage is reported per section**, as `complete | truncated | unavailable`, and
surfaced on the page. `unavailable` is deliberately distinct from an empty section: a
transient upstream failure that reads as "no internal calls" is a wrong answer wearing
the costume of a right one.

The UI carries a small provenance chip: `trace: callTracer` / `trace: internal txs`
/ `trace: unavailable — flows only`. Being explicit about data quality is more
credible than pretending every transaction gets the same treatment.

## 5. The hard part, two: ABI resolution

Decoding is only as good as the ABI, and there is no single place to get one.
Resolution order per address:

1. **Local label pack** — a curated JSON of well-known contracts (major routers,
   bridges, stablecoins, common proxies) committed to the repo. Instant, offline,
   and gives the good demo transactions perfect output.
2. **Sourcify** — open, free, no key. Use the v2 contract endpoint
   (`/server/v2/contract/{chainId}/{address}?fields=abi`). The older
   `repo.sourcify.dev/contracts/{full,partial}_match/...` path redirects to a 404 that
   returns HTML, which fails *safely* as a JSON parse error — meaning this rung would
   sit permanently dead with green tests and no visible symptom. v2 also accepts either
   address casing, so the EIP-55 checksumming this spec previously required is moot.
3. **Explorer verified-source API** for the chain.
4. **Proxy detection**, in two rungs. First Blockscout's already-resolved
   `implementations` field, which is keyless and available now — note it keys the
   address as `address_hash`, not `address`. Second, once a keyed RPC source exists,
   reading the EIP-1967 implementation and beacon slots via `eth_getStorageAt`.
   Skipping proxy detection entirely is why most decoders show `0x` for half of all
   modern transactions.
5. **4byte selector lookup** — gives a function *name* but no argument types, so
   arguments render as raw words with a "signature only" marker.
6. **Unknown** — render the selector and the calldata, honestly.

Resolved ABIs are cached by `(chain, address)` indefinitely; a deployed contract's
code never changes.

## 6. The hard part, three: the value graph

Collect movements from four sources and normalise them into one edge type
`{ from, to, asset, amount, source }`:

- Native value on every call frame with non-zero `value`.
- ERC-20 `Transfer` logs.
- ERC-721 `Transfer` logs (amount is always 1, asset carries the token id).
- ERC-1155 `TransferSingle` / `TransferBatch`.

Then apply reductions before drawing, because a raw graph of a real swap is
unreadable:

- **Collapse pass-throughs.** An address that receives exactly X of an asset and
  immediately forwards exactly X becomes a labelled edge, not a node.
- **Net out round trips** between the same pair, with the gross figures kept
  available on hover.
- **Group dust** below a threshold into a single "other" edge.

The Sankey then has a chance of fitting on a screen. Node labels use ENS reverse
records where available, then the label pack, then a truncated address.

## 7. The narrative engine

A list of pattern matchers, evaluated in order, each returning a sentence and a
confidence. No model calls.

| Pattern | Detection | Output |
|---------|-----------|--------|
| Swap | value graph has a two-hop A→pool→B for one sender | "Swapped 1.4 ETH for 4,210 USDC via Uniswap V3, at an effective rate of …" |
| Approval | only `Approval` events, no transfers | "Granted <spender> permission to move … " |
| Bridge deposit | transfer into a known bridge + a deposit-shaped event | "Deposited … to <bridge>, destination chain <id>" |
| Mint | transfer from the zero address | "Minted …" |
| Sandwich victim | needs adjacent-transaction context | flagged, with a link — see open questions |
| Failed | receipt status 0 | "Reverted: <reason>" with the revert string decoded |
| Fallback | none matched | a structured summary of net flows per address |

Each matcher is a pure function over the normalised transaction model. That makes
them individually testable against recorded fixtures, which is the only way this
stays maintainable.

---

## 8. Caching

The insight worth putting on the landing page: **a finalized transaction is
immutable, so the correct cache TTL is forever.**

- Key: `tx:{chainId}:{hash}:{schemaVersion}`. The schema version means a decoder
  improvement invalidates everything without a manual flush.
- Only cache once the transaction is beyond the chain's reorg horizon. Before
  that, serve it but do not store it.
- Two layers: Upstash Redis for the payload, and `Cache-Control: public,
  max-age=31536000, immutable` on the response so Cloudflare's CDN answers most
  requests without invoking a function at all.
- The three demo transactions are additionally committed to the repo as static
  JSON, so the landing page works with every upstream dependency down.

Consequence: an HN front-page spike costs nothing, because it is overwhelmingly
requests for the same handful of hashes.

---

## 9. Module boundaries

| Module | Responsibility |
|--------|----------------|
| `server/sources/*` | one adapter per data source, common `TxSource` interface |
| `server/abi/resolve.ts` | the resolution ladder, incl. proxy detection |
| `server/decode/calls.ts` | call tree → decoded frames (viem) |
| `server/decode/logs.ts` | logs → decoded events |
| `server/flow/build.ts` | decoded data → normalised edge list |
| `server/flow/reduce.ts` | the collapse/net/dust passes |
| `server/narrate/*` | one file per matcher + the ordered registry |
| `server/api/tx.get.ts` | orchestration and caching only, no logic |
| `app/components/FlowSankey.vue` | d3-sankey, presentational |
| `app/components/CallTree.vue` | recursive, presentational |

Everything under `flow/`, `narrate/`, and `decode/` is pure and covered by fixture
tests. The orchestration layer holds no business logic, so it needs no tests
beyond a smoke test.

---

## 10. Landing page

Route `/` is the product; `/tx/:chain/:hash` is a permalink.

1. **Hero.** `TxLens` / "What actually happened in this transaction?" A single
   input, focused on load, with the three named example transactions directly
   beneath it. "Read-only. No wallet connection, ever." sits under the input.
2. **Live demo.** Selecting an example renders the full view in place — narrative,
   Sankey, call tree, gas — from committed static JSON. Instant.
3. **How it works.** Architecture diagram plus the ABI resolution ladder from §5,
   rendered as a numbered list. That list is the most quietly impressive thing on
   the page.
4. **The hard part.** ~300 words on why the cache TTL is infinite and how the
   provenance chip works. Ends with the honest limitation: no trace, no call tree.
5. **Chains supported.** A short grid, each with the data source it uses.
6. **Footer.**

Diagram requirements: the Sankey must be legible on a phone (fall back to a
stacked flow list under ~640px), must use a colour-blind-safe categorical ramp for
assets, and must never rely on colour alone — every edge is labelled with its
asset symbol.

---

## 11. Hosting, cost, and degradation

| Concern | Plan |
|---------|------|
| App | Cloudflare Pages, Nuxt with the `cloudflare-pages` Nitro preset. |
| Cache | Upstash Redis free tier, with an eviction policy set so a full cache degrades to slower rather than broken. |
| Data | Public Blockscout-family APIs (no key) plus one keyed provider's free tier. |
| ENS | Resolved server-side, cached indefinitely. |

**Degradation path**, in order of severity:
1. Redis down → every request hits upstream. Slower, still correct.
2. Keyed provider exhausted → drop to public internal-transaction APIs, provenance
   chip changes, call-frame gas disappears.
3. All upstreams down → the three demo transactions still render from committed
   JSON, and the input shows a clear service-status message.

The landing page never depends on a live upstream call. Same rule as every other
project here.

### Abuse surface

- Hash and chain id are validated by regex and allowlist before any upstream call.
- Per-IP rate limit on cache misses only; cache hits are free and unlimited.
- No user content is ever rendered as HTML. Contract-supplied strings — token
  names, revert reasons — are the obvious injection vector and are escaped and
  length-capped.

---

## 12. Testing

- **Fixture-driven unit tests** are the core of this project. Record real RPC
  responses for ~20 transactions covering: simple transfer, ERC-20 transfer, V2
  swap, V3 multi-hop swap, NFT mint, 1155 batch, bridge deposit, proxy call,
  failed transaction with a custom error, and a transaction with an unverified
  contract. Every one becomes a snapshot test through the whole pipeline.
- **Reducer tests** assert that the collapse and netting passes do not lose value:
  total in must equal total out per asset, always. This is a genuine invariant and
  worth a property test.
- **Component tests** (Vitest + Testing Library) on the recursive call tree with a
  deep and a cyclic-looking fixture.
- **E2E** (Playwright): load `/`, click example one, assert the narrative text and
  that the Sankey rendered a known number of nodes.

---

## 13. Milestones

| # | Deliverable | Done when |
|---|-------------|-----------|
| M0 | Nuxt repo, CI, tokens, deployed shell | Live URL |
| M1 | Fetch + normalise one transaction, one chain | JSON endpoint returns a typed model |
| M2 | ABI ladder incl. proxy detection | Unverified-proxy fixture decodes correctly |
| M3 | Call tree decode + recursive UI | Deep fixture renders |
| M4 | Value graph + reduction passes | Invariant test passes on all fixtures |
| M5 | Sankey | Legible on desktop and phone |
| M6 | Narrative matchers (swap, approve, mint, fail) | Correct sentence for each fixture |
| M7 | Caching + provenance chip | Second load served from cache |
| M8 | Landing page + committed demo JSON | Works with network to upstreams blocked |
| M9 | Multi-chain (5 chains) | Chain grid accurate |
| M10 | Gas breakdown, README, GIF | Shippable |

---

## 14. Open questions

- **Sandwich detection** needs the neighbouring transactions in the block, which
  means fetching the block and analysing adjacent transactions. Worth it — it is
  the most spectacular demo — but scope it as v1.1, after M10.
- **Very large transactions** (thousands of log entries) will produce an unusable
  Sankey. Decide a node cap at M5 and design the "too complex to draw" state
  deliberately rather than letting it render badly.
- **Which keyed provider** for layer two. Decide at M1 by checking current free
  tiers for `debug_traceTransaction` support; the `TxSource` interface makes it a
  one-file change.
