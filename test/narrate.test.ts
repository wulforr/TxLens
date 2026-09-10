import { describe, expect, it } from 'vitest'
import type { DecodedLog } from '~~/server/decode/logs'
import { type AssetRef, NATIVE, ZERO_ADDRESS } from '~~/server/flow/assets'
import type { FlowEdge } from '~~/server/flow/build'
import { netPositions } from '~~/server/flow/positions'
import { RAW_UNITS_MARKER } from '~~/server/narrate/format'
import { narrate } from '~~/server/narrate/registry'
import type { NarrativeContext } from '~~/server/narrate/types'
import type { TokenMeta } from '~~/server/tokens/metadata'
import type { RawTransaction } from '~~/shared/types'

const ALICE = '0x1111111111111111111111111111111111111111' as const
const ROUTER = '0x2222222222222222222222222222222222222222' as const
const MAKER = '0x3333333333333333333333333333333333333333' as const
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7' as const
const COIN = '0x32708538a107253b51a735a724330a23106ca4ca' as const

const usdtAsset: AssetRef = { kind: 'erc20', address: USDT }
const coinAsset: AssetRef = { kind: 'erc20', address: COIN }

const tokens = new Map<string, TokenMeta>([
  [
    `erc20:${USDT}`,
    { address: USDT, symbol: 'USDT', name: 'Tether', decimals: 6, standard: 'ERC-20' },
  ],
  [`erc20:${COIN}`, { address: COIN, symbol: '01', name: '01', decimals: 18, standard: 'ERC-20' }],
])

function tx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    chainId: 1,
    hash: '0xaa',
    blockNumber: 1n,
    timestamp: 0,
    from: ALICE,
    to: ROUTER,
    value: 0n,
    input: '0x',
    status: 'success',
    revertReason: null,
    gasUsed: 1n,
    effectiveGasPrice: 1n,
    logs: [],
    activity: { kind: 'none' },
    coverage: { logs: 'complete', calls: 'complete' },
    provenance: 'internalTransactions',
    sourceName: 'blockscout',
    ...overrides,
  } as RawTransaction
}

const edge = (from: string, to: string, amount: bigint, asset: AssetRef = NATIVE): FlowEdge => ({
  from: from as `0x${string}`,
  to: to as `0x${string}`,
  asset,
  amount,
  origin: asset.kind === 'native' ? 'native' : 'erc20',
})

function ctx(edges: FlowEdge[], overrides: Partial<NarrativeContext> = {}): NarrativeContext {
  return {
    tx: tx(),
    logs: [],
    edges,
    positions: netPositions(edges),
    tokens,
    sender: ALICE,
    ...overrides,
  }
}

describe('narrate', () => {
  it('reports a revert before looking at any flows', () => {
    const result = narrate(
      ctx([edge(ALICE, ROUTER, 100n, usdtAsset)], {
        tx: tx({ status: 'reverted', revertReason: 'INSUFFICIENT_OUTPUT_AMOUNT' }),
      }),
    )
    expect(result.matcher).toBe('failed')
    expect(result.headline).toContain('INSUFFICIENT_OUTPUT_AMOUNT')
  })

  it('describes a swap with both amounts and both symbols', () => {
    const result = narrate(
      ctx([
        edge(ALICE, ROUTER, 935118160n, usdtAsset),
        edge(ROUTER, MAKER, 932312806n, usdtAsset),
        edge(MAKER, ALICE, 2336944687482834621909n, coinAsset),
      ]),
    )
    expect(result.matcher).toBe('swap')
    expect(result.headline).toBe('Swapped 935.11816 USDT for 2,336.944687 01')
  })

  it('names the router fee as a detail', () => {
    const result = narrate(
      ctx([
        edge(ALICE, ROUTER, 935118160n, usdtAsset),
        edge(ROUTER, MAKER, 932312806n, usdtAsset),
        edge(MAKER, ALICE, 2336944687482834621909n, coinAsset),
      ]),
    )
    expect(result.details.join(' ')).toContain('2.805354 USDT')
    expect(result.details.join(' ')).toContain('fee')
  })

  it('describes a plain transfer', () => {
    const result = narrate(ctx([edge(ALICE, MAKER, 5000000n, usdtAsset)]))
    expect(result.matcher).toBe('transfer')
    expect(result.headline).toBe('Sent 5 USDT to 0x333333…333333')
  })

  it('describes a mint', () => {
    const result = narrate(ctx([edge(ZERO_ADDRESS, ALICE, 1000000n, usdtAsset)]))
    expect(result.matcher).toBe('mint')
    expect(result.headline).toBe('Minted 1 USDT')
  })

  it('describes a burn', () => {
    const result = narrate(ctx([edge(ALICE, ZERO_ADDRESS, 1000000n, usdtAsset)]))
    expect(result.matcher).toBe('burn')
  })

  it('describes an approval when nothing moved', () => {
    const approvalLog = {
      confidence: 'decoded',
      address: USDT,
      contractName: 'USDT',
      eventName: 'Approval',
      signature: null,
      topic0: '0x00',
      logIndex: 0,
      args: [
        { name: 'owner', type: 'address', value: ALICE },
        { name: 'spender', type: 'address', value: ROUTER },
        { name: 'value', type: 'uint256', value: '100' },
      ],
    } as DecodedLog
    const result = narrate(ctx([], { logs: [approvalLog] }))
    expect(result.matcher).toBe('approval')
    expect(result.headline).toContain('Approved')
    expect(result.headline).toContain('USDT')
  })

  it('never renders an amount for a token whose decimals are unknown', () => {
    // Guessing 18 would print a number off by many orders of magnitude.
    const result = narrate(ctx([edge(ALICE, MAKER, 4242n, coinAsset)], { tokens: new Map() }))
    expect(result.headline).toContain(RAW_UNITS_MARKER)
    expect(result.headline).toContain('4242')
  })

  it('lowers confidence when the underlying read was truncated', () => {
    const result = narrate(
      ctx([edge(ALICE, MAKER, 5000000n, usdtAsset)], {
        tx: tx({ coverage: { logs: 'truncated', calls: 'complete' } }),
      }),
    )
    expect(result.confidence).toBe('low')
  })

  it('says so plainly when no value moved', () => {
    const result = narrate(ctx([]))
    expect(result.headline).toBe('No value moved')
  })

  it('always produces a non-empty headline', () => {
    for (const edges of [[], [edge(ALICE, MAKER, 1n)], [edge(MAKER, ALICE, 1n)]]) {
      expect(narrate(ctx(edges)).headline.length).toBeGreaterThan(0)
    }
  })
})
