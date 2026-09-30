import type { Hex } from 'viem'
import type { HttpClient } from '~~/server/utils/http'
import { normaliseAddress } from '~~/shared/address'
import type { ChainConfig } from '~~/shared/chains'
import type { CallKind, FlatCall, RawTransaction } from '~~/shared/types'

interface TraceFrame {
  type: string
  from: string
  to?: string
  value?: string
  error?: string
  calls?: TraceFrame[]
}

const KINDS = new Set<CallKind>([
  'CALL',
  'DELEGATECALL',
  'STATICCALL',
  'CALLCODE',
  'CREATE',
  'CREATE2',
  'SELFDESTRUCT',
])

/**
 * Internal calls from a node's execution trace (debug_traceTransaction with
 * callTracer). The fallback for when the indexer stalls, which it does on older
 * transactions it hasn't traced yet — the Ronin and Euler exploits among them.
 *
 * The outer frame is left out: it is the transaction itself, already counted.
 * Everything beneath a reverted frame is marked reverted too, because none of
 * it happened and its value must not be counted as moved.
 */
export async function fetchTraceCalls(
  http: HttpClient,
  chain: ChainConfig,
  hash: Hex,
): Promise<FlatCall[] | null> {
  if (!chain.traceRpc) return null
  const response = await http.postJson<{ result?: TraceFrame }>(chain.traceRpc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'debug_traceTransaction',
    params: [hash, { tracer: 'callTracer' }],
  })
  if (!response.ok || !response.data.result) return null

  const calls: FlatCall[] = []
  const walk = (frame: TraceFrame, inherited: string | null, isRoot: boolean) => {
    const error = inherited ?? frame.error ?? null
    if (!isRoot) {
      const kind = frame.type.toUpperCase() as CallKind
      calls.push({
        kind: KINDS.has(kind) ? kind : 'CALL',
        from: normaliseAddress(frame.from),
        to: frame.to ? normaliseAddress(frame.to) : null,
        value: frame.value ? BigInt(frame.value) : 0n,
        error,
      })
    }
    const passDown = frame.error ? 'parent call reverted' : inherited
    for (const child of frame.calls ?? [])
      walk(child, isRoot ? (frame.error ? 'parent call reverted' : null) : passDown, false)
  }
  walk(response.data.result, null, true)
  return calls
}

export function applyTrace(tx: RawTransaction, calls: FlatCall[]): RawTransaction {
  return {
    ...tx,
    activity: calls.length > 0 ? { kind: 'flat', calls } : { kind: 'none' },
    coverage: { ...tx.coverage, calls: 'complete' },
    provenance: 'callTracer',
  }
}
