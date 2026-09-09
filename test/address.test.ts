import { describe, expect, it } from 'vitest'
import { normaliseAddress, truncateAddress } from '~~/shared/address'

describe('normaliseAddress', () => {
  it('lowercases a checksummed address', () => {
    expect(normaliseAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    )
  })

  it('throws on a malformed address', () => {
    expect(() => normaliseAddress('0x1234')).toThrow('invalid address')
  })
})

describe('truncateAddress', () => {
  it('keeps the leading and trailing characters', () => {
    expect(truncateAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe('0xa0b869…06eb48')
  })
})
