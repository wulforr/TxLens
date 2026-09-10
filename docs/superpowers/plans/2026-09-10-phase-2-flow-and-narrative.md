# TxLens Phase 2: Value Flow and Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the decoded payload into a sentence a human can read, and a diagram of where the money went.

**Architecture:** Three pure layers on top of phase 1's output. Token metadata resolution gives symbols and decimals. A flow builder normalises native value and every token-transfer standard into one edge list. Reducers simplify that list without changing anyone's net position. Ordered rule-based matchers turn the reduced flow into a headline. No model calls anywhere.

**Tech Stack:** Unchanged, plus `d3-sankey` for the diagram.

**Spec:** `docs/SPEC.md` sections 6 (value graph) and 7 (narrative engine).

**Covers:** Spec milestones M4, M5, M6.
**Out of scope for this phase:** caching (M7), the landing page (M8), multi-chain (M9), the gas breakdown (M10), and sandwich detection (spec §14, explicitly v1.1).

## Why this phase exists

Phase 1 produced a correct decoder that reads like a tidier block explorer. Asked what a real
transaction did, a competent engineer looking at the page could not tell — the flows were there
in the event list, but nobody can net twelve `Transfer` events in their head. The narrative and
the diagram are not polish on top of phase 1; they are the product, and phase 1 was scaffolding
for them.

## Global Constraints

Everything from phase 1 still applies. Additionally:

- **No LLM.** The narrative is rule-based. This is in `CLAUDE.md` as a hard constraint and it is
  also what keeps the project free and deterministic.
- **Value must be conserved.** Reducers may collapse, net and group, but **no reduction may change
  any address's net position in any asset**. This is a property test, not a unit test, and it is
  the invariant that makes the diagram trustworthy.
- **Never state an amount without knowing its decimals.** An unresolved token renders as raw units
  with an explicit "raw units, decimals unknown" marker. Guessing 18 is how a display becomes a lie.
- **Every matcher is a pure function** in its own file, registered in an ordered list. A new pattern
  is a new file plus a fixture, never a branch inside an existing matcher.
- **The narrative states its confidence.** A matcher that fired on a partial read, or on a
  transaction with truncated coverage, says so.

## Interface conventions

- An asset is identified by a string key: `native`, `erc20:0x…`, or `nft:0x…:<tokenId>`.
- Amounts remain `bigint` through the pipeline and become decimal strings at the wire edge.
- Formatting to a human amount happens **only** in the presentation layer, and only when decimals
  are known.

## File structure

```
server/tokens/
  metadata.ts     TokenMeta, TokenResolver, label-pack-then-Blockscout ladder
server/flow/
  assets.ts       AssetRef, asset keys, native asset for a chain
  build.ts        RawTransaction + DecodedLog[] -> FlowEdge[]
  positions.ts    net position per address per asset (the invariant helper)
  reduce.ts       collapse pass-throughs, net round trips, group dust
server/narrate/
  types.ts        NarrativeContext, Narrative, Matcher
  registry.ts     ordered matcher list
  failed.ts approval.ts swap.ts mint.ts burn.ts transfer.ts fallback.ts
app/components/
  FlowSankey.vue  d3-sankey, presentational
  Narrative.vue   headline + detail lines
```

---

### Task 1: Token metadata resolution

**Files:** create `server/tokens/metadata.ts`; modify `server/abi/labelpack.data.ts`, `server/abi/labelpack.ts`; test `test/token-metadata.test.ts`

**Interfaces:**
- `type TokenStandard = 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'unknown'`
- `interface TokenMeta { address: Address; symbol: string | null; name: string | null; decimals: number | null; standard: TokenStandard }`
- `interface TokenResolver { forAddress(address: string): Promise<TokenMeta> }`
- `createTokenResolver(http: HttpClient, chain: ChainConfig): TokenResolver`

Ladder: curated label pack (instant, offline, correct for the demo transactions), then Blockscout
`/api/v2/tokens/{address}`, then unknown. Memoised per resolver instance.

**Two upstream facts, verified 2026-09-10:** `decimals` comes back as a **string** (`"6"`), and an
ERC-721 returns `decimals: null`. Parse defensively and never coerce a null to 18.

- [ ] **Step 1: Write the failing test** covering: label-pack hit makes no network call; Blockscout
  hit parses `"6"` to `6`; an ERC-721 yields `decimals: null` and `standard: 'ERC-721'`; an
  unresolvable address yields all-nulls and `standard: 'unknown'`; repeated lookups memoise.
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Extend the label pack** with `symbol` and `decimals` on each entry (USDT 6, USDC 6,
  DAI 18, WETH 18) and surface them through `lookupLabel`.
- [ ] **Step 4: Implement the resolver.**
- [ ] **Step 5: Run, watch it pass. Commit** — `feat: resolve token symbol, decimals and standard`

---

### Task 2: The asset model and flow builder

**Files:** create `server/flow/assets.ts`, `server/flow/build.ts`; test `test/flow-build.test.ts`

**Interfaces:**
- `type AssetRef = { kind: 'native' } | { kind: 'erc20'; address: Address } | { kind: 'nft'; address: Address; tokenId: string }`
- `assetKey(asset: AssetRef): string`
- `interface FlowEdge { from: Address; to: Address; asset: AssetRef; amount: bigint; origin: 'native' | 'erc20' | 'erc721' | 'erc1155' }`
- `buildFlow(tx: RawTransaction, logs: DecodedLog[]): FlowEdge[]`

Four sources, normalised into one edge type:

| Source | Where it comes from |
|---|---|
| Native value | `tx.activity` flat calls with non-zero `value`, plus the outer `tx.value` |
| ERC-20 | `Transfer` logs whose third argument is named `value` |
| ERC-721 | `Transfer` logs whose third argument is named `tokenId` |
| ERC-1155 | `TransferSingle`, and `TransferBatch` expanded to one edge per id |

**The ERC-20/721 discriminator is the argument name, and that is not a hack.** Both standards emit
`Transfer` with the same topic0. They differ in whether the third parameter is indexed, which
changes the topic count, so only one of the two ABIs decodes any given log — and the winner's
parameter is named `value` or `tokenId` accordingly. The decoder already resolved that ambiguity;
this reads the answer.

- [ ] **Step 1: Write the failing test.** Cases: a plain ETH transfer; a single ERC-20 transfer; an
  NFT transfer producing a `nft:` asset with the token id; a 1155 batch expanding to N edges; a
  transaction with no transfers producing an empty list; zero-amount transfers being kept, not
  dropped (a zero-value `Transfer` is a real event and dropping it loses information).
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, watch it pass. Commit** — `feat: build a normalised value graph from logs and calls`

---

### Task 3: Net positions and the conservation invariant

**Files:** create `server/flow/positions.ts`; test `test/flow-positions.test.ts`

**Interfaces:**
- `type Positions = Map<string, Map<string, bigint>>` — address → assetKey → net
- `netPositions(edges: FlowEdge[]): Positions`
- `positionsEqual(a: Positions, b: Positions): boolean`

This exists purely so Task 4 can be held to the invariant. Building it as its own task, before the
reducers, is deliberate: writing the check after the optimisation is how you end up writing a check
the optimisation happens to pass.

- [ ] **Step 1: Write the failing test.** A single edge gives the sender a negative and the
  recipient an equal positive; positions across an asset always sum to zero; two structurally
  different edge lists with the same nets compare equal; a different net compares unequal.
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Implement. Commit** — `feat: compute net positions per address per asset`

---

### Task 4: Reducers

**Files:** create `server/flow/reduce.ts`; test `test/flow-reduce.test.ts`

**Interfaces:**
- `interface ReduceResult { edges: FlowEdge[]; collapsed: Address[]; netted: number }`
- `reduceFlow(edges: FlowEdge[]): ReduceResult`

Three passes, applied in order, each preserving net positions exactly:

1. **Collapse pass-throughs.** An address that receives exactly *N* of an asset and forwards exactly
   *N* of the same asset, and does nothing else, is a conduit. Remove it and connect its source
   directly to its destination. Its own net was zero, so nobody's position moves.
2. **Net round trips.** `A→B 100` and `B→A 40` of the same asset become `A→B 60`. Gross figures are
   retained on the edge for hover.
3. **Group dust.** Edges below a fraction of the largest edge for that asset collapse into one
   labelled "other" edge per address pair. Threshold is a named constant, not a magic number.

- [ ] **Step 1: Write the failing test**, and make the **property test** the centrepiece:

```ts
it('never changes anyone net position, on any input', () => {
  for (const edges of GENERATED_CASES) {
    expect(positionsEqual(netPositions(edges), netPositions(reduceFlow(edges).edges))).toBe(true)
  }
})
```

  Generate cases covering: a chain of conduits, a round trip, mixed assets between the same pair,
  a cycle A→B→C→A, self-transfers, and zero-amount edges. Then targeted tests: a three-hop conduit
  chain collapses to one edge; a partial round trip nets to the difference; an exact round trip
  nets to nothing; an address that forwards a *different* asset is **not** collapsed; an address
  that forwards a *different amount* is **not** collapsed.

- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, watch it pass. Commit** — `feat: reduce the value graph while preserving net positions`

---

### Task 5: The narrative engine

**Files:** create `server/narrate/types.ts`, `registry.ts`, and one file per matcher; test `test/narrate.test.ts`

**Interfaces:**
- `interface NarrativeContext { tx: RawTransaction; logs: DecodedLog[]; edges: FlowEdge[]; positions: Positions; tokens: Map<string, TokenMeta>; sender: Address }`
- `interface Narrative { headline: string; details: string[]; matcher: string; confidence: 'high' | 'low' }`
- `type Matcher = (ctx: NarrativeContext) => Narrative | null`
- `MATCHERS: readonly { name: string; match: Matcher }[]`
- `narrate(ctx: NarrativeContext): Narrative`

Evaluated in order, first non-null wins:

| Matcher | Fires when | Headline shape |
|---|---|---|
| `failed` | `tx.status === 'reverted'` | `Reverted: <decoded reason>` |
| `approval` | Approval events and no transfers | `Approved <spender> to spend <token>` |
| `swap` | Sender's net is negative in one asset and positive in another | `Swapped 935.12 USDT for 2,336.94 01` |
| `mint` | An edge from the zero address to the sender | `Minted <amount> <token>` |
| `burn` | An edge from the sender to the zero address | `Burned <amount> <token>` |
| `transfer` | Exactly one asset moves, sender negative, one recipient positive | `Sent 100 USDC to <recipient>` |
| `fallback` | Nothing matched | A structured summary of the sender's net position changes |

`details` carries the supporting lines — the fee taken, the venues touched, the route. The swap
matcher should name intermediate venues from resolved contract names when it can, and say nothing
when it cannot.

**Confidence is `low`** when `tx.coverage` reports anything other than `complete`, because a
narrative computed over a truncated event list may be wrong. Say so rather than sounding certain.

- [ ] **Step 1: Write the failing test**, one fixture per matcher, plus: a reverted transaction
  never reaches the swap matcher; a swap over truncated coverage reports `confidence: 'low'`; an
  unknown-decimals token renders raw units with the marker rather than a wrong number; the fallback
  always produces something, never an empty string.
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Implement, one file per matcher.**
- [ ] **Step 4: Run, watch it pass. Commit** — `feat: add rule-based narrative engine`

---

### Task 6: Wire flow and narrative into the payload

**Files:** modify `shared/wire.ts`, `server/api/tx/[chain]/[hash].get.ts`; test extend `test/wire.test.ts`

Add to `TxPayload`: `narrative: Narrative`, `flow: WireFlowEdge[]`, and `tokens: Record<string, WireToken>`.
Amounts serialise as decimal strings; the client formats using the token map.

- [ ] Steps: failing test → implement → JSON round-trip test passes → commit
  `feat: return narrative and value flow from the api`

---

### Task 7: The narrative on the page

**Files:** create `app/components/Narrative.vue`; modify the transaction page; test extend `test/components.test.ts`

The narrative goes **above everything else**, in larger type. It is the answer to the question the
page exists to answer, so it should be the first thing read, before the hash.

- [ ] Steps: failing component test → implement → verify in a browser against the four phase-1
  transactions → commit `feat: lead the transaction page with the narrative`

---

### Task 8: The flow diagram

**Files:** create `app/components/FlowSankey.vue`; modify the transaction page

`d3-sankey` for layout, SVG for rendering. Requirements from spec §10:

- Legible on a phone — below 640px, fall back to a stacked flow list rather than a squeezed diagram.
- A colour-blind-safe categorical ramp for assets, and **every edge labelled with its asset symbol**,
  so colour is never the only encoding.
- A node cap. Past it, render the "too complex to draw" state deliberately rather than badly — the
  900-internal-call transaction from phase 1 is the test case.

- [ ] Steps: install `d3-sankey`, failing test on the layout adapter → implement → verify at desktop
  and mobile widths → commit `feat: add token flow sankey`

---

## Phase 2 exit criteria

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.
- [ ] The conservation property test passes over every generated case.
- [ ] The phase-1 aggregator transaction produces a correct one-sentence headline naming both
      amounts and both symbols.
- [ ] A reverted, an approval, and an NFT transaction each produce their own correct narrative.
- [ ] No amount is ever displayed without known decimals, or without the raw-units marker.
- [ ] The 900-call transaction renders without hanging the tab.
- [ ] Still no LLM SDK, no wallet library.

## Open questions

- **Dust threshold.** A fraction of the largest edge is scale-free but arbitrary. Decide the constant
  at Task 4 with real transactions, and state it on screen where it applies.
- **Native value double-counting.** WETH deposit and withdraw move value between ETH and WETH in a
  way that can look like value appearing or vanishing. Decide at Task 2 whether to treat WETH
  wrapping as a distinct edge kind, and add a fixture either way.
- **Sender identification.** `tx.from` is the EOA, but for a smart-contract wallet the economically
  interesting actor differs. Out of scope here; note it as a limitation on the page.
