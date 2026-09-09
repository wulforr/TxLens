import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs typescript with bigint literals', () => {
    const value = 10n ** 18n
    expect(value.toString()).toBe('1000000000000000000')
  })
})
