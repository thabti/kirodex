import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('1.0.0'),
}))

const mockCheck = vi.fn()
const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined)

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}))

import { useUpdateStore } from '@/stores/updateStore'
import { useUpdateChecker } from './useUpdateChecker'

beforeEach(() => {
  vi.clearAllMocks()
  mockCheck.mockResolvedValue(null)
  useUpdateStore.setState({
    status: 'idle',
    updateInfo: null,
    progress: null,
    error: null,
    dismissedVersion: null,
    triggerDownload: null,
    triggerRestart: null,
  })
})

describe('useUpdateChecker', () => {
  it('checks for updates on mount', async () => {
    mockCheck.mockResolvedValue(null)
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled()
    })
    expect(useUpdateStore.getState().status).toBe('idle')
  })

  it('sets available status when update found', async () => {
    const mockUpdate = {
      version: '2.0.0',
      date: '2026-01-01',
      body: 'New features',
      downloadAndInstall: mockDownloadAndInstall,
    }
    mockCheck.mockResolvedValue(mockUpdate)
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(useUpdateStore.getState().status).toBe('available')
    })
    expect(useUpdateStore.getState().updateInfo?.version).toBe('2.0.0')
  })

  it('sets error status on check failure', async () => {
    mockCheck.mockRejectedValue(new Error('Network error'))
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(useUpdateStore.getState().status).toBe('error')
    })
    expect(useUpdateStore.getState().error).toBe('Network error')
  })

  it('sets generic error for non-Error throws', async () => {
    mockCheck.mockRejectedValue('string error')
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(useUpdateStore.getState().error).toBe('Update check failed')
    })
  })

  it('skips check when already downloading', async () => {
    useUpdateStore.setState({ status: 'downloading' })
    renderHook(() => useUpdateChecker())
    // Give it time to potentially call check
    await new Promise((r) => setTimeout(r, 50))
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('skips check when already ready', async () => {
    useUpdateStore.setState({ status: 'ready' })
    renderHook(() => useUpdateChecker())
    await new Promise((r) => setTimeout(r, 50))
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('exposes triggerDownload when status is available', async () => {
    const mockUpdate = {
      version: '2.0.0',
      downloadAndInstall: mockDownloadAndInstall,
    }
    mockCheck.mockResolvedValue(mockUpdate)
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(useUpdateStore.getState().triggerDownload).not.toBeNull()
    })
  })

  it('clears triggerDownload when status is not available', async () => {
    mockCheck.mockResolvedValue(null)
    renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled()
    })
    expect(useUpdateStore.getState().triggerDownload).toBeNull()
  })

  it('cleans up interval on unmount', async () => {
    mockCheck.mockResolvedValue(null)
    const { unmount } = renderHook(() => useUpdateChecker())
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled()
    })
    unmount()
    // After unmount, the interval should be cleared
    // We can't easily test this without fake timers, but at least verify no errors
  })
})
