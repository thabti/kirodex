import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setInAppDragActive, setInAppDragData, useAttachments } from './useAttachments'

type DragDropCallback = (event: { payload: { type: 'over' | 'drop' | 'leave' | 'enter'; paths?: string[] } }) => void | Promise<void>

let dragDropCallback: DragDropCallback | null = null

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: vi.fn(async (callback: DragDropCallback) => {
      dragDropCallback = callback
      return vi.fn()
    }),
  }),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: {
    isDirectory: vi.fn(async () => false),
  },
}))

vi.mock('@/components/chat/attachment-utils', () => ({
  processDroppedFile: vi.fn(),
  processNativePath: vi.fn(),
}))

const waitForDragDropListener = async () => {
  await vi.waitFor(() => {
    expect(dragDropCallback).not.toBeNull()
  })
}

describe('useAttachments in-app drag via Tauri handler', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    vi.useFakeTimers()
    dragDropCallback = null
    setInAppDragData(null)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    setInAppDragData(null)
  })

  it('handles in-app file drop via Tauri onDragDropEvent with empty paths', async () => {
    const containerRef = { current: document.createElement('div') }
    const file = {
      path: '/tmp/example.ts',
      name: 'example.ts',
      dir: '/tmp',
      isDir: false,
      ext: '.ts',
      modifiedAt: 0,
    }

    const { result } = renderHook(() => useAttachments(undefined, undefined, true, containerRef))
    await waitForDragDropListener()

    setInAppDragActive(true)
    setInAppDragData({ type: 'file', data: file })

    // Tauri fires drop with empty paths for in-app drags
    await act(async () => {
      await dragDropCallback?.({ payload: { type: 'drop', paths: [] } })
    })

    expect(result.current.droppedFiles).toEqual([file])
  })

  it('handles in-app folder drop via Tauri onDragDropEvent', async () => {
    const containerRef = { current: document.createElement('div') }

    const { result } = renderHook(() => useAttachments(undefined, undefined, true, containerRef))
    await waitForDragDropListener()

    setInAppDragActive(true)
    setInAppDragData({ type: 'folder', path: '/tmp/my-folder' })

    await act(async () => {
      await dragDropCallback?.({ payload: { type: 'drop', paths: [] } })
    })

    expect(result.current.folderPaths).toEqual(['/tmp/my-folder'])
  })

  it('still works when dragend fires before Tauri drop (macOS timing)', async () => {
    const containerRef = { current: document.createElement('div') }
    const file = {
      path: '/tmp/example.ts',
      name: 'example.ts',
      dir: '/tmp',
      isDir: false,
      ext: '.ts',
      modifiedAt: 0,
    }

    const { result } = renderHook(() => useAttachments(undefined, undefined, true, containerRef))
    await waitForDragDropListener()

    setInAppDragActive(true)
    setInAppDragData({ type: 'file', data: file })

    // dragend fires first (as observed on macOS)
    act(() => {
      document.dispatchEvent(new Event('dragend'))
    })

    // Tauri drop fires ~2ms later — inAppDragData should still be available
    await act(async () => {
      await dragDropCallback?.({ payload: { type: 'drop', paths: [] } })
    })

    expect(result.current.droppedFiles).toEqual([file])
  })

  it('clears stale data after timeout if drop never fires', async () => {
    const containerRef = { current: document.createElement('div') }
    const file = {
      path: '/tmp/stale.ts',
      name: 'stale.ts',
      dir: '/tmp',
      isDir: false,
      ext: '.ts',
      modifiedAt: 0,
    }

    const { result } = renderHook(() => useAttachments(undefined, undefined, true, containerRef))
    await waitForDragDropListener()

    setInAppDragActive(true)
    setInAppDragData({ type: 'file', data: file })

    // dragend fires but no Tauri drop follows (drag cancelled)
    act(() => {
      document.dispatchEvent(new Event('dragend'))
      vi.advanceTimersByTime(100)
    })

    // Now Tauri drop fires — data should be cleared
    await act(async () => {
      await dragDropCallback?.({ payload: { type: 'drop', paths: [] } })
    })

    expect(result.current.droppedFiles).toEqual([])
  })
})
