import { describe, expect, it } from 'vitest'
import { parseTxRef } from '~~/server/utils/txref'

const VALID = '0x2b0dc0b1d0e0e1f8c2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'

describe('parseTxRef', () => {
  it('accepts a valid chain and hash', () => {
    const result = parseTxRef('ethereum', VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ref.chain.id).toBe(1)
      expect(result.ref.hash).toBe(VALID)
    }
  })

  it('lowercases a mixed-case hash', () => {
    const result = parseTxRef('ethereum', VALID.toUpperCase().replace('0X', '0x'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.hash).toBe(VALID)
  })

  it('rejects an unknown chain', () => {
    expect(parseTxRef('dogecoin', VALID)).toEqual({ ok: false, reason: 'unknown chain' })
  })

  it('rejects a hash of the wrong length', () => {
    expect(parseTxRef('ethereum', '0xdeadbeef')).toEqual({
      ok: false,
      reason: 'invalid transaction hash',
    })
  })

  it('rejects a hash with non-hex characters', () => {
    const bad = `0x${'z'.repeat(64)}`
    expect(parseTxRef('ethereum', bad)).toEqual({ ok: false, reason: 'invalid transaction hash' })
  })

  it('rejects non-string input', () => {
    expect(parseTxRef(1, VALID)).toEqual({ ok: false, reason: 'unknown chain' })
    expect(parseTxRef('ethereum', null)).toEqual({ ok: false, reason: 'invalid transaction hash' })
  })
})
