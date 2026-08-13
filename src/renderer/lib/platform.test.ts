import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPlatform } from './platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectPlatform', () => {
  it.each([
    ['MacIntel', 'Mozilla/5.0', 'macos'],
    ['Win32', 'Mozilla/5.0', 'windows'],
    ['Linux x86_64', 'Mozilla/5.0', 'linux'],
  ] as const)('maps %s to %s controls', (platform, userAgent, expected) => {
    vi.stubGlobal('navigator', { platform, userAgent })
    expect(detectPlatform()).toBe(expected)
  })

  it('uses the user agent when platform metadata is unavailable', () => {
    vi.stubGlobal('navigator', { platform: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    expect(detectPlatform()).toBe('windows')
  })
})
