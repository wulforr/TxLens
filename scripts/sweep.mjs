#!/usr/bin/env node
// Run random real transactions through the full pipeline and report what the
// rules actually do with them: crashes, which pattern fired, warning signs, and
// samples to read by eye. Unit tests prove each rule does what was intended;
// this measures whether the rules fit real traffic.
//
//   pnpm dev --host 127.0.0.1          (in another terminal)
//   node scripts/sweep.mjs [count=200] [seed=1]
//
// Writes sweep-report.json and prints a summary. Uses only the free APIs the
// app uses, a few requests at a time.

const COUNT = Number(process.argv[2] ?? 200)
let seed = Number(process.argv[3] ?? 1)
const APP = process.env.APP ?? 'http://127.0.0.1:3000'
const BLOCKSCOUT = 'https://eth.blockscout.com/api/v2'
const CONCURRENCY = 2
const PER_BLOCK = 6

// Account-abstraction entry points: the transaction's sender is a bundler, not the user.
const ENTRY_POINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
])

// Deterministic, so a run can be repeated.
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32
  return seed / 2 ** 32
}
const pick = (items, n) => [...items].sort(() => random() - 0.5).slice(0, n)

async function json(url, timeoutMs = 120_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function sample() {
  const { body: stats } = await json(`${BLOCKSCOUT}/stats`)
  const latest = Number(stats.total_blocks)
  // Mostly recent traffic (what people will paste), some older history.
  const blocks = Array.from({ length: Math.ceil(COUNT / PER_BLOCK) + 4 }, (_, i) =>
    i % 3 === 2
      ? 12_000_000 + Math.floor(random() * (latest - 12_000_000))
      : latest - 100 - Math.floor(random() * 200_000),
  )
  const hashes = []
  for (const block of blocks) {
    if (hashes.length >= COUNT) break
    const { body } = await json(`${BLOCKSCOUT}/blocks/${block}/transactions`)
    hashes.push(...pick((body?.items ?? []).map((t) => t.hash), PER_BLOCK))
  }
  return hashes.slice(0, COUNT)
}

function inspect(hash, status, ms, p) {
  const row = { hash, status, ms }
  // 503 is the source saying "busy": an honest answer, counted apart from failures.
  if (status === 503) return { ...row, unavailable: true }
  if (status !== 200 || !p?.narrative) return { ...row, crash: true }
  const n = p.narrative
  const to = (p.to ?? '').toLowerCase()
  const flags = []
  if (!n.headline?.trim()) flags.push('empty-headline')
  if (n.headline.includes('raw units') || JSON.stringify(n.parts).includes('"raw":true'))
    flags.push('raw-units')
  if (n.confidence === 'low') flags.push('low-confidence')
  if (p.coverage.logs !== 'complete' || p.coverage.calls !== 'complete') flags.push('partial-data')
  if (ENTRY_POINTS.has(to)) flags.push('erc4337-bundle')
  if (/0x[0-9a-f]{6}…/.test(n.headline)) flags.push('hex-in-headline')
  if (n.matcher === 'fallback') flags.push('fallback')
  const unnamed = new Set(
    p.flow.flatMap((e) => [e.from, e.to]).filter((a) => !p.names[a]?.name),
  ).size
  return {
    ...row,
    matcher: n.matcher,
    headline: n.headline,
    details: n.details,
    flags,
    edges: p.flow.length,
    logs: p.logs.length,
    unnamed,
    provenance: p.provenance,
  }
}

const hashes = await sample()
console.log(`Sampled ${hashes.length} transactions. Explaining…`)
const rows = []
let next = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < hashes.length) {
      const hash = hashes[next++]
      const start = Date.now()
      try {
        const { status, body } = await json(`${APP}/api/tx/ethereum/${hash}`)
        rows.push(inspect(hash, status, Date.now() - start, body))
      } catch (error) {
        rows.push({ hash, status: null, ms: Date.now() - start, crash: true, error: String(error) })
      }
      if (rows.length % 20 === 0) console.log(`  ${rows.length}/${hashes.length}`)
    }
  }),
)

const ok = rows.filter((r) => !r.crash && !r.unavailable)
const count = (fn) => ok.filter(fn).length
const pct = (n, of = ok.length) => `${((100 * n) / Math.max(of, 1)).toFixed(1)}%`
const byMatcher = Object.groupBy(ok, (r) => r.matcher)
const flagNames = [...new Set(ok.flatMap((r) => r.flags))]

console.log(`\n${rows.length} run · ${rows.filter((r) => r.crash).length} failed · ${rows.filter((r) => r.unavailable).length} source busy · median ${
  ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)] ?? 0
} ms`)
console.log('\nPattern that fired:')
for (const [m, list] of Object.entries(byMatcher).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${m.padEnd(10)} ${String(list.length).padStart(4)}  ${pct(list.length)}`)
console.log('\nWarning signs:')
for (const f of flagNames) console.log(`  ${f.padEnd(16)} ${String(count((r) => r.flags.includes(f))).padStart(4)}`)
console.log('\nFailures:')
for (const r of rows.filter((r) => r.crash)) console.log(`  ${r.hash} status=${r.status} ${r.error ?? ''}`)

const { writeFile } = await import('node:fs/promises')
await writeFile(
  'sweep-report.json',
  JSON.stringify({ at: new Date().toISOString(), seed: process.argv[3] ?? 1, rows }, null, 2),
)
console.log('\nFull rows in sweep-report.json')
