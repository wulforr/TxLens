import { describe, expect, it } from 'vitest'
import { createAbiResolver } from '~~/server/abi/resolve'
import { decodeCallInput } from '~~/server/decode/calls'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const unknown = '0x3333333333333333333333333333333333333333'

// transfer(0x2222...2222, 123)
const TRANSFER_INPUT =
  '0xa9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000007b'

describe('decodeCallInput', () => {
  it('decodes a known function with named arguments', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput(TRANSFER_INPUT, resolver, usdc)
    expect(decoded.confidence).toBe('decoded')
    expect(decoded.functionName).toBe('transfer')
    expect(decoded.contractName).toBe('USDC')
    expect(decoded.args).toEqual([
      { name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' },
      { name: 'amount', type: 'uint256', value: '123' },
    ])
  })

  it('reports a native transfer for empty calldata', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput('0x', resolver, unknown)
    expect(decoded.confidence).toBe('nativeTransfer')
    expect(decoded.selector).toBeNull()
    expect(decoded.args).toEqual([])
  })

  it('falls back to a signature-only result when no abi resolves', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [{ id: 1, text_signature: 'transfer(address,uint256)' }],
      },
    })
    const decoded = await decodeCallInput(TRANSFER_INPUT, createAbiResolver(http, chain), unknown)
    expect(decoded.confidence).toBe('signatureOnly')
    expect(decoded.signature).toBe('transfer(address,uint256)')
    expect(decoded.args).toEqual([])
    expect(decoded.raw).toBe(TRANSFER_INPUT)
  })

  it('returns raw when even the selector is unknown', async () => {
    const decoded = await decodeCallInput(
      TRANSFER_INPUT,
      createAbiResolver(fakeHttp({}), chain),
      unknown,
    )
    expect(decoded.confidence).toBe('raw')
    expect(decoded.selector).toBe('0xa9059cbb')
    expect(decoded.functionName).toBeNull()
  })

  it('returns raw when the abi resolves but the selector is not in it', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput('0xdeadbeef', resolver, usdc)
    expect(decoded.confidence).toBe('raw')
    expect(decoded.contractName).toBe('USDC')
  })

  it('serialises bigint arguments as decimal strings, never numbers', async () => {
    const resolver = createAbiResolver(fakeHttp({}), chain)
    const decoded = await decodeCallInput(TRANSFER_INPUT, resolver, usdc)
    for (const arg of decoded.args) expect(typeof arg.value).toBe('string')
  })
})
