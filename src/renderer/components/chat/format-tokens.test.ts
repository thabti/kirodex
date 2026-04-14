import { describe, it, expect } from 'vitest'
import { formatTokens } from './SlashPanels'

describe('formatTokens', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1)).toBe('1')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats thousands with K suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(1_500)).toBe('1.5K')
    expect(formatTokens(10_000)).toBe('10.0K')
    expect(formatTokens(999_999)).toBe('1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(10_000_000)).toBe('10.0M')
  })
})
