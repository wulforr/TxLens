import { describe, expect, it } from 'vitest'
import { fetchBlockscoutAbi, fetchFourByteSignature, fetchSourcifyAbi } from '~~/server/abi/remote'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const lower = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const abi = [
  { type: 'function', name: 'transfer', inputs: [], outputs: [], stateMutability: 'nonpayable' },
]

describe('fetchBlockscoutAbi', () => {
  it('returns the abi and contract name for a verified contract', async () => {
    const http = fakeHttp({
      [`${chain.blockscoutBase}/api/v2/smart-contracts/${lower}`]: { abi, name: 'FiatTokenV2_2' },
    })
    expect(await fetchBlockscoutAbi(http, chain, lower)).toEqual({ abi, name: 'FiatTokenV2_2' })
  })

  it('returns null for an unverified contract', async () => {
    expect(await fetchBlockscoutAbi(fakeHttp({}), chain, lower)).toBeNull()
  })

  it('returns null when the response has no abi', async () => {
    const http = fakeHttp({
      [`${chain.blockscoutBase}/api/v2/smart-contracts/${lower}`]: { abi: null, name: 'Thing' },
    })
    expect(await fetchBlockscoutAbi(http, chain, lower)).toBeNull()
  })

  it('always requests the lowercase address', async () => {
    const http = fakeHttp({})
    await fetchBlockscoutAbi(http, chain, '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48')
    expect(http.calls[0]).toBe(`${chain.blockscoutBase}/api/v2/smart-contracts/${lower}`)
  })
})

describe('fetchSourcifyAbi', () => {
  it('asks the v2 contract endpoint for just the abi field', async () => {
    const http = fakeHttp({
      [`https://sourcify.dev/server/v2/contract/1/${lower}?fields=abi`]: { abi },
    })
    expect(await fetchSourcifyAbi(http, 1, lower)).toEqual(abi)
    expect(http.calls).toHaveLength(1)
  })

  it('normalises the address casing before asking', async () => {
    const http = fakeHttp({
      [`https://sourcify.dev/server/v2/contract/1/${lower}?fields=abi`]: { abi },
    })
    expect(await fetchSourcifyAbi(http, 1, '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48')).toEqual(
      abi,
    )
  })

  it('returns null when the contract is not verified', async () => {
    expect(await fetchSourcifyAbi(fakeHttp({}), 1, lower)).toBeNull()
  })

  it('returns null when the response carries no abi', async () => {
    const http = fakeHttp({
      [`https://sourcify.dev/server/v2/contract/1/${lower}?fields=abi`]: { abi: null },
    })
    expect(await fetchSourcifyAbi(http, 1, lower)).toBeNull()
  })
})

describe('fetchFourByteSignature', () => {
  it('returns the oldest signature for a selector', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [
          { id: 1111734, text_signature: 'workMyDirefulOwner(uint256,uint256)' },
          { id: 145, text_signature: 'transfer(address,uint256)' },
        ],
      },
    })
    expect(await fetchFourByteSignature(http, '0xa9059cbb')).toBe('transfer(address,uint256)')
  })

  it('returns null when there are no results', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xdeadbeef': { results: [] },
    })
    expect(await fetchFourByteSignature(http, '0xdeadbeef')).toBeNull()
  })

  it('returns null when the lookup itself fails', async () => {
    expect(await fetchFourByteSignature(fakeHttp({}), '0xa9059cbb')).toBeNull()
  })
})
