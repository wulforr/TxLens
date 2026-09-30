import { describe, expect, it } from 'vitest'
import type { TokenMeta } from '~~/server/tokens/metadata'
import { formatLogArg } from '~~/shared/format'
import { groupEvents, labelParticipants, partUsd, toSteps, usdText } from '~~/shared/steps'
import type { WireFlowEdge } from '~~/shared/wire'

const SENDER = '0x1d4de31b7f1fefcacf4f59152b852a6a013fdd60'
const ROUTER = '0x07964f135f276412b3182a3b2407b8dd45000000'
const MAKER = '0xe3d41d19564922c9952f692c5dd0563030f5f2ef'
const HOP = '0x75cf59a923ade5c6c18c2c2a3ca3b1ab4d6f26e4'
const EOA = '0x388c818ca8b9251b393131c08a736a67ccb19297'
const ZERO = '0x0000000000000000000000000000000000000000'
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7'

const tokens: Record<string, TokenMeta> = {
  [`erc20:${USDT}`]: {
    address: USDT,
    symbol: 'USDT',
    name: 'Tether',
    decimals: 6,
    standard: 'ERC-20',
    iconUrl: null,
  },
}

const edge = (
  from: string,
  to: string,
  amount: string,
  order: number,
  native = false,
): WireFlowEdge =>
  ({
    from,
    to,
    amount,
    order,
    asset: native ? { kind: 'native' } : { kind: 'erc20', address: USDT },
    assetKey: native ? 'native' : `erc20:${USDT}`,
    origin: native ? 'native' : 'erc20',
  }) as WireFlowEdge

const names = {
  [ROUTER]: { name: 'TransitSwapRouterV5.1', isContract: true },
  [MAKER]: { name: null, isContract: true },
  [HOP]: { name: null, isContract: true },
  [EOA]: { name: null, isContract: false },
}

describe('labelParticipants', () => {
  const people = labelParticipants([SENDER, ROUTER, HOP, MAKER, EOA, ZERO], SENDER, names, tokens)

  it('calls the wallet that started the transaction the sender', () => {
    expect(people[SENDER]).toMatchObject({ label: 'Sender', role: 'sender' })
  })

  it('uses a known name, in words', () => {
    expect(people[ROUTER]).toMatchObject({ label: 'Transit Swap Router V5.1', role: 'named' })
  })

  it('gives unnamed addresses a stable alias by first appearance and kind', () => {
    expect(people[HOP]?.label).toBe('Contract A')
    expect(people[MAKER]?.label).toBe('Contract B')
    expect(people[EOA]?.label).toBe('Wallet A')
  })

  it('names the zero address for what it means', () => {
    expect(people[ZERO]).toMatchObject({ role: 'zero' })
  })

  it('keeps the full address on every participant', () => {
    expect(people[HOP]?.address).toBe(HOP)
  })
})

describe('toSteps', () => {
  it('tells the steps in transaction order', () => {
    const steps = toSteps(
      [edge(HOP, MAKER, '2', 2), edge(SENDER, ROUTER, '1000000', 0), edge(ROUTER, HOP, '5', 1)],
      tokens,
      {},
      'ETH',
    )
    expect(steps.map((s) => [s.from, s.to])).toEqual([
      [SENDER, ROUTER],
      [ROUTER, HOP],
      [HOP, MAKER],
    ])
  })

  it('marks newly created and destroyed tokens', () => {
    const steps = toSteps(
      [edge(ZERO, SENDER, '1', 0), edge(SENDER, ZERO, '1', 1)],
      tokens,
      {},
      'ETH',
    )
    expect(steps.map((s) => s.kind)).toEqual(['mint', 'burn'])
  })

  it('attaches a usd value only when the price is known', () => {
    const steps = toSteps(
      [edge(SENDER, ROUTER, '935118160', 0), edge(SENDER, EOA, '10', 1, true)],
      tokens,
      { [`erc20:${USDT}`]: 0.9997 },
      'ETH',
    )
    expect(steps[0]?.usd).toBeCloseTo(934.84, 2)
    expect(steps[1]?.usd).toBeNull()
  })

  it('carries the intermediaries a transfer passed through', () => {
    const steps = toSteps([{ ...edge(SENDER, EOA, '5', 0, true), via: [HOP] }], tokens, {}, 'ETH')
    expect(steps[0]?.via).toEqual([HOP])
  })

  it('prices an amount part for the headline', () => {
    const [step] = toSteps([edge(SENDER, ROUTER, '935118160', 0)], tokens, {}, 'ETH')
    expect(partUsd(step!.amount, tokens, { [`erc20:${USDT}`]: 1 })).toBeCloseTo(935.11816, 4)
    expect(partUsd(step!.amount, tokens, {})).toBeNull()
  })

  it('skips zero-amount edges, which moved nothing', () => {
    expect(toSteps([edge(SENDER, ROUTER, '0', 0)], tokens, {}, 'ETH')).toHaveLength(0)
  })
})

describe('usdText', () => {
  it.each([
    [934.8412, '≈ $934.84'],
    [1234567.8, '≈ $1,234,568'],
    [0.004, '< $0.01'],
    [0.42, '≈ $0.42'],
  ])('%s -> %s', (value, expected) => {
    expect(usdText(value)).toBe(expected)
  })
})

describe('groupEvents', () => {
  const log = (eventName: string | null, address: string, logIndex: number) =>
    ({
      eventName,
      address,
      logIndex,
      contractName: null,
      confidence: 'decoded',
      args: [],
      signature: null,
      topic0: null,
    }) as never

  it('collapses repeats of the same event from the same contract, keeping order', () => {
    const groups = groupEvents([
      log('MintClaimed', ROUTER, 0),
      log('Transfer', USDT, 1),
      log('MintClaimed', ROUTER, 2),
    ])
    expect(groups.map((g) => [g.eventName, g.items.length])).toEqual([
      ['MintClaimed', 2],
      ['Transfer', 1],
    ])
  })
})

describe('formatLogArg', () => {
  it('formats an amount emitted by a known token contract', () => {
    expect(formatLogArg(USDT, { name: 'value', type: 'uint256', value: '935118160' }, tokens)).toBe(
      '935.11816 USDT',
    )
  })

  it('leaves other arguments and unknown tokens alone', () => {
    expect(formatLogArg(USDT, { name: 'tick', type: 'int24', value: '5' }, tokens)).toBeNull()
    expect(formatLogArg(ROUTER, { name: 'value', type: 'uint256', value: '5' }, tokens)).toBeNull()
  })
})
