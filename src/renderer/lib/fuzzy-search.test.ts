import { describe, it, expect } from 'vitest'
import { fuzzyScore } from './fuzzy-search'

describe('fuzzyScore', () => {
  it('returns 0 for exact match', () => {
    expect(fuzzyScore('hello', 'hello')).toBe(0)
  })

  it('is case-insensitive for exact match', () => {
    expect(fuzzyScore('Hello', 'hello')).toBe(0)
    expect(fuzzyScore('hello', 'HELLO')).toBe(0)
  })

  it('returns 1 for prefix match', () => {
    expect(fuzzyScore('hel', 'hello')).toBe(1)
  })

  it('returns 2 + index for substring match', () => {
    expect(fuzzyScore('llo', 'hello')).toBe(4) // 2 + indexOf('llo') = 2 + 2
  })

  it('returns 2 for substring at start (same as prefix but not startsWith)', () => {
    // 'ell' is at index 1 in 'hello'
    expect(fuzzyScore('ell', 'hello')).toBe(3) // 2 + 1
  })

  it('returns null when no fuzzy match possible', () => {
    expect(fuzzyScore('xyz', 'hello')).toBeNull()
  })

  it('returns null when query chars not all found in order', () => {
    expect(fuzzyScore('ba', 'abc')).toBeNull()
  })

  it('returns a score for fuzzy character match', () => {
    // 'h' and 'o' are in 'hello' in order
    const score = fuzzyScore('ho', 'hello')
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThanOrEqual(100)
  })

  it('penalizes gaps in fuzzy match', () => {
    // 'hl' has a gap (skips 'e'), 'he' is contiguous
    const scoreWithGap = fuzzyScore('hl', 'hello')
    const scoreContiguous = fuzzyScore('he', 'hello')
    // contiguous should be prefix match (score 1), gap should be >= 100
    expect(scoreContiguous).toBe(1)
    expect(scoreWithGap).not.toBeNull()
    expect(scoreWithGap!).toBeGreaterThan(scoreContiguous!)
  })

  it('penalizes later first-match position', () => {
    const scoreEarly = fuzzyScore('ab', 'abcdef')
    const scoreLate = fuzzyScore('ef', 'abcdef')
    // 'ab' is prefix (1), 'ef' is substring at index 4 (2+4=6)
    expect(scoreEarly).toBeLessThan(scoreLate!)
  })

  it('handles single character query', () => {
    expect(fuzzyScore('h', 'hello')).toBe(1) // prefix
    expect(fuzzyScore('o', 'hello')).toBe(6) // substring at index 4: 2+4
  })

  it('handles empty query matching any target', () => {
    // empty query: q.length = 0, qi starts at 0, loop ends, qi < q.length is false
    // but first checks: t === q? '' === 'hello' no. t.startsWith('')? yes → returns 1
    expect(fuzzyScore('', 'hello')).toBe(1)
  })

  it('handles query longer than target', () => {
    expect(fuzzyScore('helloworld', 'hello')).toBeNull()
  })
})
