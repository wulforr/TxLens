import { describe, expect, it } from 'vitest'
import type { RawTransaction } from '~~/shared/types'
import { toWire } from '~~/shared/wire'

const EXTRA = {
  narrative: {
    headline: 'No value moved',
    parts: [{ kind: 'text' as const, text: 'No value moved' }],
    details: [],
    matcher: 'fallback',
    confidence: 'high' as const,
  },
  flow: [],
  tokens: new Map(),
}

const tx: RawTransaction = {
  chainId: 1,
  hash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
  blockNumber: 21000000n,
  confirmations: 100,
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
  coverage: { logs: 'complete', calls: 'complete' },
  names: {},
  provenance: 'internalTransactions',
  sourceName: 'blockscout',
}

const call = {
  confidence: 'nativeTransfer' as const,
  contractName: null,
  via: null,
  functionName: null,
  signature: null,
  selector: null,
  args: [],
  raw: '0x' as const,
}

describe('toWire', () => {
  it('serialises every bigint as a decimal string', () => {
    const wire = toWire(tx, call, [], EXTRA)
    expect(wire.blockNumber).toBe('21000000')
    expect(wire.value).toBe('1000000000000000000')
    expect(wire.gasUsed).toBe('52000')
    expect(wire.effectiveGasPrice).toBe('12000000000')
  })

  it('computes the fee as gasUsed times effectiveGasPrice', () => {
    expect(toWire(tx, call, [], EXTRA).feeWei).toBe((52000n * 12000000000n).toString())
  })

  it('serialises flat call values as strings and keeps the kind discriminator', () => {
    const wire = toWire(tx, call, [], EXTRA)
    expect(wire.activity.kind).toBe('flat')
    if (wire.activity.kind === 'flat') {
      expect(wire.activity.calls[0].value).toBe('500000000000000000')
    }
  })

  it('survives JSON round-tripping without loss', () => {
    const wire = toWire(tx, call, [], EXTRA)
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire)
  })

  it('carries provenance and source name through', () => {
    const wire = toWire(tx, call, [], EXTRA)
    expect(wire.provenance).toBe('internalTransactions')
    expect(wire.sourceName).toBe('blockscout')
  })

  it('carries the narrative through', () => {
    expect(toWire(tx, call, [], EXTRA).narrative.headline).toBe('No value moved')
  })

  it('serialises flow amounts as strings', () => {
    const wire = toWire(tx, call, [], {
      ...EXTRA,
      flow: [
        {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          asset: { kind: 'native' } as const,
          amount: 1000000000000000000n,
          origin: 'native' as const,
          order: 0,
        },
      ],
    })
    expect(wire.flow[0].amount).toBe('1000000000000000000')
    expect(wire.flow[0].assetKey).toBe('native')
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire)
  })

  it('carries coverage through so the ui can flag an incomplete read', () => {
    expect(toWire(tx, call, [], EXTRA).coverage).toEqual({ logs: 'complete', calls: 'complete' })
  })
})
