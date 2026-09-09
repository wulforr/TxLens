import { describe, expect, it } from 'vitest'
import { LABELS, lookupLabel } from '~~/server/abi/labelpack'

describe('lookupLabel', () => {
  it('finds a known token regardless of address casing', () => {
    const lower = lookupLabel(1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    const upper = lookupLabel(1, '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48')
    expect(lower?.name).toBe('USDC')
    expect(upper?.name).toBe('USDC')
  })

  it('returns undefined for an unknown address', () => {
    expect(lookupLabel(1, '0x0000000000000000000000000000000000000dead')).toBeUndefined()
  })

  it('does not match the same address on a different chain', () => {
    expect(lookupLabel(999, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBeUndefined()
  })
})

describe('LABELS', () => {
  it('stores every address lowercased', () => {
    for (const entry of LABELS) {
      expect(entry.address).toBe(entry.address.toLowerCase())
    }
  })

  it('has no duplicate chain/address pairs', () => {
    const keys = LABELS.map((entry) => `${entry.chainId}:${entry.address}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
