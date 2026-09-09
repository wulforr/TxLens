import { describe, expect, it } from 'vitest'
import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeLogs } from '~~/server/decode/logs'
import { getChain } from '~~/shared/chains'
import type { RawLog } from '~~/shared/types'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const mystery = '0x3333333333333333333333333333333333333333'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const from = '0x0000000000000000000000001111111111111111111111111111111111111111'
const to = '0x0000000000000000000000002222222222222222222222222222222222222222'
const amount = '0x000000000000000000000000000000000000000000000000000000000000007b'

function erc20Transfer(address: string, logIndex = 0): RawLog {
  return { address, topics: [TRANSFER_TOPIC, from, to], data: amount, logIndex } as RawLog
}

describe('decodeLogs', () => {
  it('decodes a transfer using the resolved contract abi', async () => {
    const [log] = await decodeLogs([erc20Transfer(usdc)], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.eventName).toBe('Transfer')
    expect(log.contractName).toBe('USDC')
    expect(log.args).toEqual([
      { name: 'from', type: 'address', value: '0x1111111111111111111111111111111111111111' },
      { name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' },
      { name: 'value', type: 'uint256', value: '123' },
    ])
  })

  it('decodes a transfer on an unverified contract via the standard event abis', async () => {
    const [log] = await decodeLogs([erc20Transfer(mystery)], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.eventName).toBe('Transfer')
    expect(log.contractName).toBeNull()
  })

  it('decodes an erc-721 transfer, where tokenId is indexed', async () => {
    const nft: RawLog = {
      address: mystery,
      topics: [TRANSFER_TOPIC, from, to, amount],
      data: '0x',
      logIndex: 0,
    } as RawLog
    const [log] = await decodeLogs([nft], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('decoded')
    expect(log.args.at(-1)).toEqual({ name: 'tokenId', type: 'uint256', value: '123' })
  })

  it('returns raw for an event it cannot decode', async () => {
    const odd: RawLog = {
      address: mystery,
      topics: ['0xdeadbeef'],
      data: '0x',
      logIndex: 3,
    } as RawLog
    const [log] = await decodeLogs([odd], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('raw')
    expect(log.eventName).toBeNull()
    expect(log.topic0).toBe('0xdeadbeef')
    expect(log.logIndex).toBe(3)
  })

  it('handles an anonymous event with no topics at all', async () => {
    const anon: RawLog = { address: mystery, topics: [], data: '0x1234', logIndex: 1 } as RawLog
    const [log] = await decodeLogs([anon], createAbiResolver(fakeHttp({}), chain))
    expect(log.confidence).toBe('raw')
    expect(log.topic0).toBeNull()
  })

  it('preserves input order', async () => {
    const logs = [erc20Transfer(usdc, 5), erc20Transfer(mystery, 2)]
    const decoded = await decodeLogs(logs, createAbiResolver(fakeHttp({}), chain))
    expect(decoded.map((l) => l.logIndex)).toEqual([5, 2])
  })
})
