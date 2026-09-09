import { describe, expect, it } from 'vitest'
import { resolveImplementation } from '~~/server/abi/proxy'
import { getChain } from '~~/shared/chains'
import { fakeHttp } from './helpers/fakeHttp'

const chain = getChain('ethereum')!
const proxy = '0x1111111111111111111111111111111111111111'
const impl = '0x2222222222222222222222222222222222222222'
const url = `${chain.blockscoutBase}/api/v2/addresses/${proxy}`

describe('resolveImplementation', () => {
  // The live API returns implementations as { address_hash, name }, mixed case.
  it('returns the implementation address for a proxy', async () => {
    const http = fakeHttp({
      [url]: {
        is_contract: true,
        proxy_type: 'eip1967_oz',
        implementations: [
          { address_hash: '0x2222222222222222222222222222222222222222', name: 'V2' },
        ],
      },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBe(impl)
  })

  it('lowercases a checksummed implementation address', async () => {
    const http = fakeHttp({
      [url]: {
        is_contract: true,
        implementations: [{ address_hash: '0x43506849D7C04F9138D1A2050bbF3A0c054402dd' }],
      },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBe(
      '0x43506849d7c04f9138d1a2050bbf3a0c054402dd',
    )
  })

  // Older Blockscout releases name the field `address`.
  it('accepts the legacy address field', async () => {
    const http = fakeHttp({
      [url]: { is_contract: true, implementations: [{ address: impl }] },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBe(impl)
  })

  it('returns null for a non-proxy contract', async () => {
    const http = fakeHttp({ [url]: { is_contract: true, implementations: [] } })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })

  it('returns null when the field is missing entirely', async () => {
    const http = fakeHttp({ [url]: { is_contract: true } })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })

  it('returns null when the address lookup fails', async () => {
    expect(await resolveImplementation(fakeHttp({}), chain, proxy)).toBeNull()
  })

  it('ignores an implementation that points back at the proxy', async () => {
    const http = fakeHttp({
      [url]: { is_contract: true, implementations: [{ address_hash: proxy }] },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })

  it('returns null rather than throwing on a malformed implementation address', async () => {
    const http = fakeHttp({
      [url]: { is_contract: true, implementations: [{ address_hash: 'not-an-address' }] },
    })
    expect(await resolveImplementation(http, chain, proxy)).toBeNull()
  })
})
