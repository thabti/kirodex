import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}))

import { useUpdateStore } from './updateStore'
import { track } from '@/lib/analytics'

beforeEach(() => {
  vi.clearAllMocks()
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

describe('updateStore', () => {
  it('starts with idle status', () => {
    expect(useUpdateStore.getState().status).toBe('idle')
  })

  it('setStatus updates status', () => {
    useUpdateStore.getState().setStatus('checking')
    expect(useUpdateStore.getState().status).toBe('checking')
  })

  it('setUpdateInfo stores update info', () => {
    const info = { version: '1.0.0', date: '2026-04-15', body: 'Release notes' }
    useUpdateStore.getState().setUpdateInfo(info)
    expect(useUpdateStore.getState().updateInfo).toEqual(info)
  })

  it('setUpdateInfo accepts null', () => {
    useUpdateStore.getState().setUpdateInfo({ version: '1.0.0' })
    useUpdateStore.getState().setUpdateInfo(null)
    expect(useUpdateStore.getState().updateInfo).toBeNull()
  })

  it('setProgress stores progress', () => {
    useUpdateStore.getState().setProgress({ downloaded: 500, total: 1000 })
    expect(useUpdateStore.getState().progress).toEqual({ downloaded: 500, total: 1000 })
  })

  it('setProgress accepts null', () => {
    useUpdateStore.getState().setProgress({ downloaded: 100, total: null })
    useUpdateStore.getState().setProgress(null)
    expect(useUpdateStore.getState().progress).toBeNull()
  })

  it('setError sets error and status to error', () => {
    useUpdateStore.getState().setError('Network failed')
    expect(useUpdateStore.getState().error).toBe('Network failed')
    expect(useUpdateStore.getState().status).toBe('error')
  })

  it('setError accepts null', () => {
    useUpdateStore.getState().setError('some error')
    useUpdateStore.getState().setError(null)
    expect(useUpdateStore.getState().error).toBeNull()
  })

  it('dismissVersion sets dismissedVersion and resets status to idle', () => {
    useUpdateStore.setState({ status: 'available' })
    useUpdateStore.getState().dismissVersion('1.0.0')
    expect(useUpdateStore.getState().dismissedVersion).toBe('1.0.0')
    expect(useUpdateStore.getState().status).toBe('idle')
  })

  it('dismissVersion tracks analytics event', () => {
    useUpdateStore.getState().dismissVersion('1.0.0')
    expect(track).toHaveBeenCalledWith('update_dismissed', { available_version: '1.0.0' })
  })

  it('dismissVersion handles localStorage error gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    // Should not throw — the store catches localStorage errors
    expect(() => useUpdateStore.getState().dismissVersion('1.0.0')).not.toThrow()
    expect(useUpdateStore.getState().dismissedVersion).toBe('1.0.0')
    spy.mockRestore()
  })

  it('reset clears status, updateInfo, progress, and error', () => {
    useUpdateStore.setState({
      status: 'error',
      updateInfo: { version: '1.0.0' },
      progress: { downloaded: 100, total: 200 },
      error: 'some error',
    })
    useUpdateStore.getState().reset()
    const s = useUpdateStore.getState()
    expect(s.status).toBe('idle')
    expect(s.updateInfo).toBeNull()
    expect(s.progress).toBeNull()
    expect(s.error).toBeNull()
  })

  it('setTriggerDownload stores callback', () => {
    const fn = vi.fn()
    useUpdateStore.getState().setTriggerDownload(fn)
    expect(useUpdateStore.getState().triggerDownload).toBe(fn)
  })

  it('setTriggerDownload accepts null', () => {
    useUpdateStore.getState().setTriggerDownload(vi.fn())
    useUpdateStore.getState().setTriggerDownload(null)
    expect(useUpdateStore.getState().triggerDownload).toBeNull()
  })

  it('setTriggerRestart stores callback', () => {
    const fn = vi.fn()
    useUpdateStore.getState().setTriggerRestart(fn)
    expect(useUpdateStore.getState().triggerRestart).toBe(fn)
  })

  it('setTriggerRestart accepts null', () => {
    useUpdateStore.getState().setTriggerRestart(vi.fn())
    useUpdateStore.getState().setTriggerRestart(null)
    expect(useUpdateStore.getState().triggerRestart).toBeNull()
  })

  it('all status transitions work', () => {
    const statuses = ['idle', 'checking', 'available', 'downloading', 'ready', 'error'] as const
    for (const status of statuses) {
      useUpdateStore.getState().setStatus(status)
      expect(useUpdateStore.getState().status).toBe(status)
    }
  })
})
