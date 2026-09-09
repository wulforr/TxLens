import { describe, expect, it } from 'vitest'
import { createAbiResolver } from '~~/server/abi/resolve'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const proxy = '0x1111111111111111111111111111111111111111'
const impl = '0x2222222222222222222222222222222222222222'
const plain = '0x3333333333333333333333333333333333333333'
const abi = [
  { type: 'function', name: 'doThing', inputs: [], outputs: [], stateMutability: 'nonpayable' },
]

const addressUrl = (a: string) => `${chain.blockscoutBase}/api/v2/addresses/${a}`
const contractUrl = (a: string) => `${chain.blockscoutBase}/api/v2/smart-contracts/${a}`
const sourcifyUrl = (a: string) =>
  `https://sourcify.dev/server/v2/contract/${chain.id}/${a}?fields=abi`

describe('createAbiResolver', () => {
  it('prefers the label pack and makes no network call', async () => {
    const http = fakeHttp({})
    const resolution = await createAbiResolver(http, chain).forAddress(usdc)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.source).toBe('labelpack')
      expect(resolution.name).toBe('USDC')
      expect(resolution.via).toBeNull()
    }
    expect(http.calls).toHaveLength(0)
  })

  it('resolves a proxy to its implementation abi and records via', async () => {
    const http = fakeHttp({
      [addressUrl(proxy)]: { implementations: [{ address_hash: impl }] },
      [contractUrl(impl)]: { abi, name: 'LogicV3' },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(proxy)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.name).toBe('LogicV3')
      expect(resolution.via).toBe(impl)
    }
  })

  it('falls back to the address own abi when it is not a proxy', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [contractUrl(plain)]: { abi, name: 'Plain' },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(plain)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.source).toBe('blockscout')
      expect(resolution.via).toBeNull()
    }
  })

  it('falls back to sourcify when blockscout has no verified source', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [sourcifyUrl(plain)]: { abi },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(plain)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.source).toBe('sourcify')
      expect(resolution.abi).toEqual(abi)
    }
  })

  // A proxy whose implementation is itself unverified must still fall back to
  // the proxy's own ABI rather than giving up.
  it('falls back to the proxy own abi when the implementation is unverified', async () => {
    const http = fakeHttp({
      [addressUrl(proxy)]: { implementations: [{ address_hash: impl }] },
      [contractUrl(proxy)]: { abi, name: 'TheProxy' },
    })
    const resolution = await createAbiResolver(http, chain).forAddress(proxy)
    expect(resolution.kind).toBe('full')
    if (resolution.kind === 'full') {
      expect(resolution.name).toBe('TheProxy')
      expect(resolution.via).toBeNull()
    }
  })

  it('returns unknown when nothing resolves', async () => {
    const resolution = await createAbiResolver(fakeHttp({}), chain).forAddress(plain)
    expect(resolution).toEqual({ kind: 'unknown' })
  })

  it('memoises repeated lookups of the same address', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [contractUrl(plain)]: { abi, name: 'Plain' },
    })
    const resolver = createAbiResolver(http, chain)
    await resolver.forAddress(plain)
    const callsAfterFirst = http.calls.length
    await resolver.forAddress(plain)
    expect(http.calls).toHaveLength(callsAfterFirst)
  })

  it('memoises across address casings', async () => {
    const http = fakeHttp({
      [addressUrl(plain)]: { implementations: [] },
      [contractUrl(plain)]: { abi, name: 'Plain' },
    })
    const resolver = createAbiResolver(http, chain)
    await resolver.forAddress(plain)
    const callsAfterFirst = http.calls.length
    await resolver.forAddress(plain.toUpperCase().replace('0X', '0x'))
    expect(http.calls).toHaveLength(callsAfterFirst)
  })

  it('resolves a selector through 4byte', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [{ id: 1, text_signature: 'transfer(address,uint256)' }],
      },
    })
    expect(await createAbiResolver(http, chain).forSelector('0xa9059cbb')).toBe(
      'transfer(address,uint256)',
    )
  })

  it('memoises selector lookups', async () => {
    const http = fakeHttp({
      'https://www.4byte.directory/api/v1/signatures/?hex_signature=0xa9059cbb': {
        results: [{ id: 1, text_signature: 'transfer(address,uint256)' }],
      },
    })
    const resolver = createAbiResolver(http, chain)
    await resolver.forSelector('0xa9059cbb')
    await resolver.forSelector('0xA9059CBB')
    expect(http.calls).toHaveLength(1)
  })
})
