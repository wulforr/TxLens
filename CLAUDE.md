# TxLens

Paste an EVM transaction hash, get a plain-English narrative, a token-flow diagram,
and a gas breakdown.

**`docs/SPEC.md` is the source of truth.** Read it before touching decoding,
resolution, or the flow reducers.

## Hard constraints

1. **Read-only. No wallet connection, ever.** Nothing is signed, nothing is sent.
   This is stated on the landing page because it is what makes strangers willing to
   paste a hash.
2. **No LLM anywhere.** The narrative is rule-based, which makes it deterministic,
   instant, and free. A model call here would be a regression.
3. **The client never talks to an RPC.** All upstream calls go through Nitro server
   routes. Keys stay server-side.
4. **Always declare data provenance.** The UI shows which source answered
   (`callTracer` / internal transactions / logs only). Never present a degraded
   result as a complete one.
5. **The landing page must render with every upstream down.** The three demo
   transactions are committed as static JSON.
6. **Value must be conserved.** The flow reducers may collapse, net, and group, but
   total in must equal total out per asset. There is a property test for this; do
   not weaken it.
7. **Contract-supplied strings are hostile input.** Token names, symbols, and
   revert reasons are escaped and length-capped before rendering. Never
   `v-html` anything that came from a chain.

## Stack

Nuxt 3 · Vue 3 `<script setup>` · TypeScript strict · viem · Nitro on Cloudflare
Pages · Upstash Redis · d3-sankey · Vitest · Playwright · Biome.

## Commands

```
pnpm dev
pnpm test              # vitest, fixture-driven
pnpm test:e2e
pnpm typecheck
pnpm fixtures:record   # re-record upstream responses for a hash
```

## Where logic lives

```
server/sources/    one adapter per data source, common TxSource interface
server/abi/        the resolution ladder, incl. EIP-1967 proxy detection
server/decode/     calls + logs → decoded structures
server/flow/       build.ts (normalise) and reduce.ts (collapse/net/dust)
server/narrate/    one file per matcher, plus an ordered registry
server/api/        orchestration and caching ONLY — no business logic
app/components/    presentational, props-driven
```

Everything under `decode/`, `flow/`, and `narrate/` is pure and fixture-tested.
A new narrative pattern is a new file in `narrate/` plus a fixture, never a branch
inside an existing matcher.

## Caching

A finalized transaction is immutable, so the cache TTL is **forever**. Keys carry a
schema version, so improving the decoder invalidates everything without a manual
flush. Do not cache transactions still inside the chain's reorg horizon.

## Testing

Fixture-driven. Every capability lands with a recorded real transaction covering
it. The fixture set must keep covering: simple transfer, ERC-20, V2 swap, V3
multi-hop, NFT mint, 1155 batch, bridge deposit, proxy call, failed tx with a
custom error, and an unverified contract. Do not delete a fixture to make a test
pass.

## Visual direction

Instrument panel: dark slate, tabular numerals everywhere, mono for hashes, colour
used as categorical encoding rather than decoration. The Sankey must be
colour-blind safe and never rely on colour alone — every edge carries its asset
symbol. **Do not** reuse styling from the sibling projects in this folder — they
are deliberately unrelated.

## Out of scope — do not add

Wallet connection, portfolio or PnL tracking, address history, transaction
simulation, non-EVM chains, and any LLM call.
