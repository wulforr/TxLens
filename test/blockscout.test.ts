import { describe, expect, it } from 'vitest'
import { fetchFromBlockscout } from '~~/server/sources/blockscout'
import { getChain } from '~~/shared/chains'
import fixture from './fixtures/blockscout/transfer.json'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const hash = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as const
const base = `${chain.blockscoutBase}/api/v2/transactions/${hash}`

function routes(overrides: Record<string, unknown> = {}) {
  return {
    [base]: fixture.transaction,
    [`${base}/logs`]: fixture.logs,
    [`${base}/internal-transactions`]: fixture.internal,
    ...overrides,
  }
}

describe('fetchFromBlockscout', () => {
  it('returns null when the transaction is not found', async () => {
    const result = await fetchFromBlockscout(fakeHttp({}), chain, hash)
    expect(result).toBeNull()
  })

  it('maps core transaction fields', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.chainId).toBe(1)
    expect(tx.hash).toBe(hash)
    expect(tx.blockNumber).toBe(21000000n)
    expect(tx.value).toBe(1000000000000000000n)
    expect(tx.gasUsed).toBe(52000n)
    expect(tx.effectiveGasPrice).toBe(12000000000n)
    expect(tx.status).toBe('success')
    expect(tx.revertReason).toBeNull()
    expect(tx.sourceName).toBe('blockscout')
  })

  it('lowercases every address', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.to).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    expect(tx.logs[0].address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  })

  it('converts the ISO timestamp to unix seconds', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.timestamp).toBe(Math.floor(Date.parse('2026-01-15T10:30:00.000Z') / 1000))
  })

  // Blockscout pads `topics` out to four entries with nulls. Those are absence,
  // not data, and must not reach the decoder.
  it('drops the null topic padding', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.logs[0].topics).toHaveLength(3)
    expect(tx.logs[0].topics[0]).toBe(
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    )
    expect(tx.logs[0].logIndex).toBe(1863)
  })

  it('reports flat call activity, never a tree', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.activity.kind).toBe('flat')
    if (tx.activity.kind === 'flat') {
      expect(tx.activity.calls).toHaveLength(1)
      expect(tx.activity.calls[0].kind).toBe('CALL')
      expect(tx.activity.calls[0].value).toBe(500000000000000000n)
    }
    expect(tx.provenance).toBe('internalTransactions')
  })

  it('degrades to logsOnly when internal transactions are unavailable', async () => {
    const withoutInternal = routes()
    delete (withoutInternal as Record<string, unknown>)[`${base}/internal-transactions`]
    const tx = (await fetchFromBlockscout(fakeHttp(withoutInternal), chain, hash))!
    expect(tx.activity.kind).toBe('none')
    expect(tx.provenance).toBe('logsOnly')
    expect(tx.logs).toHaveLength(1)
  })

  it('degrades to logsOnly when internal transactions are empty', async () => {
    const tx = (await fetchFromBlockscout(
      fakeHttp(routes({ [`${base}/internal-transactions`]: { items: [] } })),
      chain,
      hash,
    ))!
    expect(tx.provenance).toBe('logsOnly')
  })

  // The live API returns revert_reason as a decoded object, not a string.
  it('carries confirmations, which decide whether the result is final', async () => {
    const tx = (await fetchFromBlockscout(fakeHttp(routes()), chain, hash))!
    expect(tx.confirmations).toBe(145369)
  })

  it('harvests a human name for every address it sees, at no extra request', async () => {
    const http = fakeHttp(routes())
    const tx = (await fetchFromBlockscout(http, chain, hash))!
    // ENS wins, then a name-type tag, then the contract name.
    expect(tx.names['0x1111111111111111111111111111111111111111']).toEqual({
      name: 'alice.eth',
      isContract: false,
    })
    expect(tx.names['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48']).toEqual({
      name: 'USDC Stablecoin',
      isContract: true,
    })
    expect(tx.names['0x3333333333333333333333333333333333333333']).toEqual({
      name: 'PoolManager',
      isContract: true,
    })
    expect(http.calls).toHaveLength(3)
  })

  it('maps a reverted transaction with a decoded Error(string)', async () => {
    const reverted = {
      ...fixture.transaction,
      status: 'error',
      result: 'Reverted',
      revert_reason: {
        method_call: 'Error(string reason)',
        method_id: '08c379a0',
        parameters: [{ name: 'reason', type: 'string', value: 'ERC20: insufficient balance' }],
      },
    }
    const tx = (await fetchFromBlockscout(fakeHttp(routes({ [base]: reverted })), chain, hash))!
    expect(tx.status).toBe('reverted')
    expect(tx.revertReason).toBe('ERC20: insufficient balance')
  })

  it('renders a custom error revert as a signature with its arguments', async () => {
    const reverted = {
      ...fixture.transaction,
      status: 'error',
      result: 'Reverted',
      revert_reason: {
        method_call: 'InvalidStatusForWithdrawal(uint8 status)',
        method_id: 'fecf1ec0',
        parameters: [{ name: 'status', type: 'uint8', value: '2' }],
      },
    }
    const tx = (await fetchFromBlockscout(fakeHttp(routes({ [base]: reverted })), chain, hash))!
    expect(tx.revertReason).toBe('InvalidStatusForWithdrawal(2)')
  })

  it('falls back to the raw revert payload when it could not be decoded', async () => {
    const reverted = {
      ...fixture.transaction,
      status: 'error',
      result: 'Reverted',
      revert_reason: { raw: '0x08c379a0deadbeef' },
    }
    const tx = (await fetchFromBlockscout(fakeHttp(routes({ [base]: reverted })), chain, hash))!
    expect(tx.revertReason).toBe('0x08c379a0deadbeef')
  })

  it('reverts with no reason at all leave revertReason null', async () => {
    const reverted = { ...fixture.transaction, status: 'error', result: 'Reverted' }
    const tx = (await fetchFromBlockscout(fakeHttp(routes({ [base]: reverted })), chain, hash))!
    expect(tx.status).toBe('reverted')
    expect(tx.revertReason).toBeNull()
  })
})
