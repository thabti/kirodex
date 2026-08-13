import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IS_MACOS } from '@/lib/platform'
import { useModifierKeys } from './useModifierKeys'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useModifierKeys', () => {
  it('shows hints for the platform modifier and hides them on release', () => {
    const { result } = renderHook(() => useModifierKeys())
    const key = IS_MACOS ? 'Meta' : 'Control'

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }))
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key }))
    })
    expect(result.current).toBe(false)
  })

  it('clears a visible hint when the window loses focus', () => {
    const { result } = renderHook(() => useModifierKeys())
    const key = IS_MACOS ? 'Meta' : 'Control'

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }))
      vi.advanceTimersByTime(100)
      window.dispatchEvent(new Event('blur'))
    })

    expect(result.current).toBe(false)
  })
})
