import { describe, expect, it, vi } from 'vitest'
import type { TxSource } from '~~/server/sources/registry'
import { fetchTransaction } from '~~/server/sources/registry'
import { getChain } from '~~/shared/chains'
import type { RawTransaction } from '~~/shared/types'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const hash = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as const

function stubTx(sourceName: string): RawTransaction {
  return {
    chainId: 1,
    hash,
    blockNumber: 1n,
    timestamp: 0,
    from: '0x1111111111111111111111111111111111111111',
    to: null,
    value: 0n,
    input: '0x',
    status: 'success',
    revertReason: null,
    gasUsed: 0n,
    effectiveGasPrice: 0n,
    logs: [],
    activity: { kind: 'none' },
    coverage: { logs: 'complete', calls: 'complete' },
    provenance: 'logsOnly',
    sourceName,
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
      fetch: vi.fn(async () => {
        throw new Error('upstream exploded')
      }),
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
