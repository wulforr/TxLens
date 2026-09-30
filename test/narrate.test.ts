import { describe, expect, it } from 'vitest'
import type { DecodedLog } from '~~/server/decode/logs'
import { type AssetRef, NATIVE, ZERO_ADDRESS } from '~~/server/flow/assets'
import type { FlowEdge } from '~~/server/flow/build'
import { netPositions } from '~~/server/flow/positions'
import { narrate } from '~~/server/narrate/registry'
import type { NarrativeContext } from '~~/server/narrate/types'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { RAW_UNITS_MARKER } from '~~/shared/format'
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
    {
      address: USDT,
      symbol: 'USDT',
      name: 'Tether',
      decimals: 6,
      standard: 'ERC-20',
      iconUrl: null,
    },
  ],
  [
    `erc20:${COIN}`,
    { address: COIN, symbol: '01', name: '01', decimals: 18, standard: 'ERC-20', iconUrl: null },
  ],
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
  order: 0,
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
    // The outcome leads in plain words; the developer string is quoted underneath.
    expect(result.headline).toBe('This transaction failed and was undone')
    expect(result.details[0]).toContain('“INSUFFICIENT_OUTPUT_AMOUNT”')
  })

  it('caps a contract-supplied revert reason before it reaches the page', () => {
    const result = narrate(
      ctx([], { tx: tx({ status: 'reverted', revertReason: 'x'.repeat(5000) }) }),
    )
    expect(result.details[0]?.length).toBeLessThan(200)
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
    expect(result.headline).toBe('Swapped 935.11816 USDT for 2,336.94 01')
  })

  it('keeps each amount structured so a symbol like "01" never reads as digits', () => {
    const withIcon = new Map(tokens)
    withIcon.set(`erc20:${USDT}`, {
      ...tokens.get(`erc20:${USDT}`)!,
      iconUrl: 'https://i.example/usdt.png',
    })
    const result = narrate(
      ctx(
        [
          edge(ALICE, ROUTER, 935118160n, usdtAsset),
          edge(ROUTER, MAKER, 932312806n, usdtAsset),
          edge(MAKER, ALICE, 2336944687482834621909n, coinAsset),
        ],
        { tokens: withIcon },
      ),
    )
    const amounts = result.parts.filter((p) => p.kind === 'amount')
    expect(amounts).toMatchObject([
      { value: '935.11816', symbol: 'USDT', iconUrl: 'https://i.example/usdt.png' },
      { value: '2,336.94', symbol: '01', iconUrl: null, address: COIN },
    ])
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

  it('names the service taking the fee and only the services the money passed through', () => {
    const POOL = '0x000000000004444c5dc75cb358380d2e3de08a90'
    const log = (address: string) =>
      ({
        confidence: 'decoded',
        address,
        contractName: null,
        eventName: 'Swap',
        signature: null,
        topic0: '0x00',
        logIndex: 0,
        args: [],
      }) as unknown as DecodedLog
    const result = narrate(
      ctx(
        [
          edge(ALICE, ROUTER, 935118160n, usdtAsset),
          edge(ROUTER, MAKER, 932312806n, usdtAsset),
          edge(MAKER, ALICE, 2336944687482834621909n, coinAsset),
        ],
        {
          logs: [log(USDT), log(MAKER), log(POOL)],
          names: {
            [ROUTER]: { name: 'TransitSwapRouterV5.1', isContract: true },
            [MAKER]: { name: 'NativeRFQPool', isContract: true },
            [POOL]: { name: 'Uniswap V4: Pool Manager', isContract: true },
            [USDT]: { name: 'USDT Stablecoin', isContract: true },
          },
        },
      ),
    )
    expect(result.details).toContain(
      'Transit Swap Router V5.1 kept 2.805354 USDT as a service fee.',
    )
    // Every name listed also appears in the steps: the pool only emitted an event,
    // and the token contract is already in the headline.
    expect(result.details).toContain('Passed through Transit Swap Router V5.1 and Native RFQ Pool.')
  })

  it('describes a plain transfer', () => {
    const result = narrate(ctx([edge(ALICE, MAKER, 5000000n, usdtAsset)]))
    expect(result.matcher).toBe('transfer')
    expect(result.headline).toBe('Sent 5 USDT to 0x333333…333333')
  })

  it('names the recipient in the headline when the source knows it', () => {
    const result = narrate(
      ctx([edge(ALICE, MAKER, 5000000n, usdtAsset)], {
        names: { [MAKER]: { name: 'Lido: Execution Layer Rewards Vault', isContract: true } },
      }),
    )
    expect(result.headline).toBe('Sent 5 USDT to Lido: Execution Layer Rewards Vault')
  })

  it('describes a mint', () => {
    const result = narrate(ctx([edge(ZERO_ADDRESS, ALICE, 1000000n, usdtAsset)]))
    expect(result.matcher).toBe('mint')
    expect(result.headline).toBe('Created 1 USDT for the sender')
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
    expect(result.headline).toContain('permission to spend')
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

  it('never claims nothing moved when value moved between other addresses', () => {
    // An exploit: the attacker's wallet calls a contract, and the profit lands in
    // that contract. The wallet's own balance is unchanged; "no value moved"
    // would be a false statement about a very expensive transaction.
    const EXPLOIT = '0x4444444444444444444444444444444444444444'
    const POOL = '0x5555555555555555555555555555555555555555'
    const result = narrate(
      ctx([edge(POOL, EXPLOIT, 8000000000n, usdtAsset), edge(POOL, MAKER, 1000000n, usdtAsset)], {
        names: {
          [EXPLOIT]: { name: 'Euler Exploit Contract 1', isContract: true },
          [POOL]: { name: 'Euler Pool', isContract: true },
        },
        prices: new Map([[`erc20:${USDT}`, 1]]),
      }),
    )
    expect(result.headline).not.toContain('No value moved')
    expect(result.headline).toBe('Euler Exploit Contract 1 came out ahead by 8,000 USDT')
    expect(result.details).toContain('Euler Pool lost 8,001 USDT (≈ $8,001).')
    expect(result.details.join(' ')).toContain('sender’s own balance didn’t change')
  })

  it('calls an unnamed winner by its role, not by a pronoun', () => {
    const POOL = '0x5555555555555555555555555555555555555555'
    const result = narrate(
      ctx([edge(POOL, ROUTER, 8000000000n, usdtAsset)], {
        prices: new Map([[`erc20:${USDT}`, 1]]),
      }),
    )
    expect(result.headline).toBe('The contract the sender called came out ahead by 8,000 USDT')
  })

  it('still describes movement without prices, rather than inventing a ranking', () => {
    const result = narrate(ctx([edge(MAKER, ROUTER, 5000000n, usdtAsset)], { prices: new Map() }))
    expect(result.headline).not.toContain('No value moved')
    expect(result.headline).toContain('2 addresses')
  })

  it('says where received value came from, valued by USD', () => {
    const BRIDGE = '0x6666666666666666666666666666666666666666'
    const result = narrate(
      ctx([edge(BRIDGE, ALICE, 173600n * 10n ** 18n)], {
        names: { [BRIDGE]: { name: 'Ronin Bridge V1', isContract: true } },
        prices: new Map([['native', 3000]]),
      }),
    )
    expect(result.matcher).toBe('received')
    expect(result.headline).toBe('Received 173,600 ETH from Ronin Bridge V1')
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
