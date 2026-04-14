import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock AudioContext with proper class-based approach
const mockClose = vi.fn().mockResolvedValue(undefined)
const mockStart = vi.fn()
const mockStop = vi.fn()
const mockConnect = vi.fn()
const mockSetValueAtTime = vi.fn()
const mockExponentialRamp = vi.fn()

class MockAudioContext {
  currentTime = 0
  destination = {}
  close = mockClose
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: mockConnect,
      start: mockStart,
      stop: mockStop,
    }
  }
  createGain() {
    return {
      gain: { setValueAtTime: mockSetValueAtTime, exponentialRampToValueAtTime: mockExponentialRamp },
      connect: mockConnect,
    }
  }
}

vi.stubGlobal('AudioContext', MockAudioContext)

import { playNotificationSound } from './sounds'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('playNotificationSound', () => {
  it('creates two oscillators for two tones', () => {
    playNotificationSound()
    // Two tones: each calls start and stop
    expect(mockStart).toHaveBeenCalledTimes(2)
    expect(mockStop).toHaveBeenCalledTimes(2)
  })

  it('connects oscillators and gain nodes', () => {
    playNotificationSound()
    // Each tone: osc.connect(gain) + gain.connect(destination) = 4 total
    expect(mockConnect).toHaveBeenCalledTimes(4)
  })

  it('closes AudioContext after 1 second', () => {
    playNotificationSound()
    expect(mockClose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('does not throw when AudioContext is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playNotificationSound()).not.toThrow()
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  it('does not throw when AudioContext constructor throws', () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('not allowed') } })
    expect(() => playNotificationSound()).not.toThrow()
    vi.stubGlobal('AudioContext', MockAudioContext)
  })
})
