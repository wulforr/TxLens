import { describe, expect, it } from 'vitest'
import { CHAINS, getChain } from '~~/shared/chains'

describe('getChain', () => {
  it('finds ethereum by slug', () => {
    expect(getChain('ethereum')?.id).toBe(1)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getChain('dogecoin')).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(getChain('Ethereum')?.id).toBe(1)
  })
})

describe('CHAINS', () => {
  it('has unique slugs and ids', () => {
    expect(new Set(CHAINS.map((c) => c.slug)).size).toBe(CHAINS.length)
    expect(new Set(CHAINS.map((c) => c.id)).size).toBe(CHAINS.length)
  })

  it('has no trailing slash on any base url', () => {
    for (const chain of CHAINS) {
      expect(chain.blockscoutBase.endsWith('/')).toBe(false)
    }
  })
})
