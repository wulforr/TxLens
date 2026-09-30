import { describe, expect, it } from 'vitest'
import { EXAMPLES, FAMOUS } from '~~/shared/examples'

describe('EXAMPLES', () => {
  it('only links to well-formed, distinct transaction ids', () => {
    // A typo here is a broken first impression that no other test would catch.
    const all = [...FAMOUS, ...EXAMPLES]
    for (const example of all) expect(example.hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(new Set(all.map((e) => e.hash)).size).toBe(all.length)
  })
})
