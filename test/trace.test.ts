import { describe, expect, it } from 'vitest'
import { applyTrace, fetchTraceCalls } from '~~/server/sources/trace'
import { withTimeout } from '~~/server/utils/http'
import { getChain } from '~~/shared/chains'
import type { RawTransaction } from '~~/shared/types'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const hash = '0xc28fad5e8d5e0ce6a2eaf67b6687be5d58113e16be590824d6cfa1a94467d0b7' as const
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const C = '0x3333333333333333333333333333333333333333'

const trace = {
  result: {
    type: 'CALL',
    from: A,
    to: B,
    value: '0x0',
    calls: [
      { type: 'CALL', from: B, to: C, value: '0xde0b6b3a7640000' },
      {
        type: 'CALL',
        from: B,
        to: A,
        value: '0x1',
        error: 'execution reverted',
        calls: [{ type: 'DELEGATECALL', from: A, to: C, value: '0x0' }],
      },
    ],
  },
}

describe('fetchTraceCalls', () => {
  it('flattens the call tree, leaving out the outer transaction itself', async () => {
    const calls = await fetchTraceCalls(
      fakeHttp({ [`POST ${chain.traceRpc}`]: trace }),
      chain,
      hash,
    )
    expect(calls?.map((c) => c.kind)).toEqual(['CALL', 'CALL', 'DELEGATECALL'])
    expect(calls?.[0]).toMatchObject({ from: B, to: C, value: 10n ** 18n, error: null })
  })

  it('marks everything under a reverted frame as reverted, since none of it happened', async () => {
    const calls = await fetchTraceCalls(
      fakeHttp({ [`POST ${chain.traceRpc}`]: trace }),
      chain,
      hash,
    )
    expect(calls?.[1]?.error).toBe('execution reverted')
    expect(calls?.[2]?.error).toBe('parent call reverted')
  })

  it('returns null when the node refuses or fails', async () => {
    expect(await fetchTraceCalls(fakeHttp({}), chain, hash)).toBeNull()
    expect(
      await fetchTraceCalls(
        fakeHttp({ [`POST ${chain.traceRpc}`]: { error: { message: 'no' } } }),
        chain,
        hash,
      ),
    ).toBeNull()
  })
})

describe('applyTrace', () => {
  it('replaces unavailable call data and says where it came from', () => {
    const tx = {
      activity: { kind: 'none' },
      coverage: { logs: 'complete', calls: 'unavailable' },
      provenance: 'logsOnly',
    } as unknown as RawTransaction
    const next = applyTrace(tx, [{ kind: 'CALL', from: A, to: B, value: 1n, error: null }])
    expect(next.coverage.calls).toBe('complete')
    expect(next.provenance).toBe('callTracer')
    expect(next.activity.kind).toBe('flat')
  })
})

describe('withTimeout', () => {
  it('gives up on a request that never answers', async () => {
    const hanging = {
      getJson: () => new Promise<never>(() => {}),
      postJson: () => new Promise<never>(() => {}),
    }
    const result = await withTimeout(hanging, 10).getJson('https://x.test')
    expect(result).toEqual({ ok: false, status: null, reason: 'timeout' })
  })
})
