import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('1.0.0'),
}))

import {
  makeAnonId,
  readLastVersion,
  writeLastVersion,
  resetAnalytics,
  track,
  isAnalyticsReady,
  initAnalytics,
} from './analytics'

beforeEach(() => {
  vi.clearAllMocks()
  resetAnalytics()
})

describe('makeAnonId', () => {
  it('returns a string', () => {
    const id = makeAnonId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns unique IDs', () => {
    const id1 = makeAnonId()
    const id2 = makeAnonId()
    expect(id1).not.toBe(id2)
  })

  it('uses crypto.randomUUID when available', () => {
    const id = makeAnonId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

describe('readLastVersion', () => {
  it('returns a string or null', () => {
    const result = readLastVersion()
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('does not throw', () => {
    expect(() => readLastVersion()).not.toThrow()
  })
})

describe('writeLastVersion', () => {
  it('does not throw', () => {
    expect(() => writeLastVersion('1.0.0')).not.toThrow()
  })
})

describe('isAnalyticsReady', () => {
  it('returns false initially', () => {
    expect(isAnalyticsReady()).toBe(false)
  })
})

describe('track', () => {
  it('is a no-op when analytics is not ready', () => {
    expect(() => track('app_opened', {})).not.toThrow()
  })

  it('accepts feature_used events', () => {
    expect(() => track('feature_used', { feature: 'git' })).not.toThrow()
  })

  it('accepts task_created events', () => {
    expect(() => track('task_created', { has_prompt: true })).not.toThrow()
  })
})

describe('resetAnalytics', () => {
  it('sets ready to false', () => {
    resetAnalytics()
    expect(isAnalyticsReady()).toBe(false)
  })

  it('does not throw when called multiple times', () => {
    expect(() => {
      resetAnalytics()
      resetAnalytics()
    }).not.toThrow()
  })
})

describe('initAnalytics', () => {
  it('returns false when disabled', async () => {
    const result = await initAnalytics({ enabled: false, distinctId: null })
    expect(result).toBe(false)
  })

  it('returns false in dev build', async () => {
    // import.meta.env.DEV is true in test environment
    const result = await initAnalytics({ enabled: true, distinctId: 'test-id' })
    expect(result).toBe(false)
  })

  it('returns false with null distinctId', async () => {
    const result = await initAnalytics({ enabled: true, distinctId: null })
    expect(result).toBe(false)
  })

  it('returns false with previousVersion', async () => {
    const result = await initAnalytics({ enabled: true, distinctId: 'id', previousVersion: '0.9.0' })
    expect(result).toBe(false)
  })
})
