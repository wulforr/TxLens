import { describe, expect, it } from 'vitest'
import type { DecodedLog } from '~~/server/decode/logs'
import { assetKey } from '~~/server/flow/assets'
import { buildFlow } from '~~/server/flow/build'
import type { RawTransaction } from '~~/shared/types'

const alice = '0x1111111111111111111111111111111111111111'
const bob = '0x2222222222222222222222222222222222222222'
const carol = '0x3333333333333333333333333333333333333333'
const usdt = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const bayc = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'

function tx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    chainId: 1,
    hash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 1n,
    confirmations: 100,
    timestamp: 0,
    from: alice,
    to: bob,
    value: 0n,
    input: '0x',
    status: 'success',
    revertReason: null,
    gasUsed: 21000n,
    effectiveGasPrice: 1n,
    logs: [],
    activity: { kind: 'none' },
    coverage: { logs: 'complete', calls: 'complete' },
    names: {},
    provenance: 'internalTransactions',
    sourceName: 'blockscout',
    ...overrides,
  }
}

function log(name: string, address: string, args: [string, string, string][]): DecodedLog {
  return {
    confidence: 'decoded',
    address: address as `0x${string}`,
    contractName: null,
    eventName: name,
    signature: null,
    args: args.map(([n, t, v]) => ({ name: n, type: t, value: v })),
    topic0: '0x00',
    logIndex: 0,
  }
}

describe('buildFlow', () => {
  it('emits an edge for outer native value', () => {
    const edges = buildFlow(tx({ value: 1000n }), [])
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ from: alice, to: bob, amount: 1000n, origin: 'native' })
    expect(assetKey(edges[0].asset)).toBe('native')
  })

  it('ignores zero outer value', () => {
    expect(buildFlow(tx({ value: 0n }), [])).toHaveLength(0)
  })

  it('emits edges for native value moved by internal calls', () => {
    const edges = buildFlow(
      tx({
        activity: {
          kind: 'flat',
          calls: [
            { kind: 'CALL', from: bob, to: carol, value: 500n, error: null },
            { kind: 'STATICCALL', from: bob, to: carol, value: 0n, error: null },
          ],
        },
      }),
      [],
    )
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ from: bob, to: carol, amount: 500n })
  })

  it('reads an erc-20 transfer from its value argument', () => {
    const edges = buildFlow(tx(), [
      log('Transfer', usdt, [
        ['from', 'address', alice],
        ['to', 'address', bob],
        ['value', 'uint256', '935118160'],
      ]),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].amount).toBe(935118160n)
    expect(assetKey(edges[0].asset)).toBe(`erc20:${usdt}`)
    expect(edges[0].origin).toBe('erc20')
  })

  it('reads an erc-721 transfer as a distinct nft asset carrying the token id', () => {
    // Same event name and topic0 as ERC-20. The argument name is the
    // discriminator, because only one of the two abis can decode a given log.
    const edges = buildFlow(tx(), [
      log('Transfer', bayc, [
        ['from', 'address', alice],
        ['to', 'address', bob],
        ['tokenId', 'uint256', '4023'],
      ]),
    ])
    expect(edges[0].amount).toBe(1n)
    expect(assetKey(edges[0].asset)).toBe(`nft:${bayc}:4023`)
    expect(edges[0].origin).toBe('erc721')
  })

  it('expands a 1155 batch into one edge per id', () => {
    const edges = buildFlow(tx(), [
      log('TransferBatch', bayc, [
        ['operator', 'address', alice],
        ['from', 'address', alice],
        ['to', 'address', bob],
        ['ids', 'uint256[]', '[1, 2]'],
        ['values', 'uint256[]', '[10, 20]'],
      ]),
    ])
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.amount)).toEqual([10n, 20n])
    expect(edges.map((e) => assetKey(e.asset))).toEqual([`nft:${bayc}:1`, `nft:${bayc}:2`])
  })

  it('keeps a zero-amount transfer, because it is a real event', () => {
    const edges = buildFlow(tx(), [
      log('Transfer', usdt, [
        ['from', 'address', alice],
        ['to', 'address', bob],
        ['value', 'uint256', '0'],
      ]),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].amount).toBe(0n)
  })

  it('counts no value on delegate and static calls, which run code without transferring', () => {
    // A proxy DELEGATECALLs its implementation with the caller's value repeated
    // on the frame. Counting it would invent a second transfer of the same money.
    const edges = buildFlow(
      tx({
        activity: {
          kind: 'flat',
          calls: [
            { kind: 'DELEGATECALL', from: bob, to: carol, value: 500n, error: null },
            { kind: 'STATICCALL', from: bob, to: carol, value: 500n, error: null },
            { kind: 'CALLCODE', from: bob, to: carol, value: 500n, error: null },
            { kind: 'CALL', from: bob, to: alice, value: 500n, error: null },
          ],
        },
      }),
      [],
    )
    expect(edges.map((e) => e.to)).toEqual([alice])
  })

  it('ignores value on an internal call that reverted, because it never moved', () => {
    const edges = buildFlow(
      tx({
        activity: {
          kind: 'flat',
          calls: [{ kind: 'CALL', from: bob, to: carol, value: 500n, error: 'reverted' }],
        },
      }),
      [],
    )
    expect(edges).toHaveLength(0)
  })

  it('treats a WETH withdrawal as the holder giving their WETH back to the contract', () => {
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const edges = buildFlow(tx(), [
      log('Withdrawal', WETH, [
        ['src', 'address', alice],
        ['wad', 'uint256', '173600'],
      ]),
    ])
    expect(edges[0]).toMatchObject({ from: alice, to: WETH, amount: 173600n })
    expect(assetKey(edges[0]!.asset)).toBe(`erc20:${WETH}`)
  })

  it('treats a WETH deposit as the contract issuing WETH to the holder', () => {
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const edges = buildFlow(tx(), [
      log('Deposit', WETH, [
        ['dst', 'address', alice],
        ['wad', 'uint256', '5'],
      ]),
    ])
    expect(edges[0]).toMatchObject({ from: WETH, to: alice, amount: 5n })
  })

  it('does not read a Deposit event from some other contract as WETH', () => {
    const edges = buildFlow(tx(), [
      log('Deposit', usdt, [
        ['dst', 'address', alice],
        ['wad', 'uint256', '5'],
      ]),
    ])
    expect(edges).toHaveLength(0)
  })

  it('skips logs it could not decode', () => {
    const raw: DecodedLog = { ...log('Transfer', usdt, []), confidence: 'raw', eventName: null }
    expect(buildFlow(tx(), [raw])).toHaveLength(0)
  })

  it('ignores approvals, which move nothing', () => {
    const edges = buildFlow(tx(), [
      log('Approval', usdt, [
        ['owner', 'address', alice],
        ['spender', 'address', bob],
        ['value', 'uint256', '100'],
      ]),
    ])
    expect(edges).toHaveLength(0)
  })
})
