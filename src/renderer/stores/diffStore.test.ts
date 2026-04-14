import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getTaskDiff: vi.fn().mockResolvedValue('+added\n-removed\ndiff --git a/f b/f\n+line\n-old'),
    gitStage: vi.fn().mockResolvedValue(undefined),
    gitRevert: vi.fn().mockResolvedValue(undefined),
  },
}))

import { useDiffStore } from './diffStore'
import { ipc } from '@/lib/ipc'

beforeEach(() => {
  vi.clearAllMocks()
  useDiffStore.setState({
    isOpen: false,
    diff: '',
    stats: { additions: 0, deletions: 0, fileCount: 0 },
    loading: false,
    selectedFiles: new Set(),
    focusFile: null,
  })
})

describe('diffStore', () => {
  describe('initial state', () => {
    it('starts closed with empty diff', () => {
      const s = useDiffStore.getState()
      expect(s.isOpen).toBe(false)
      expect(s.diff).toBe('')
      expect(s.stats).toEqual({ additions: 0, deletions: 0, fileCount: 0 })
    })
  })

  describe('toggleOpen', () => {
    it('toggles', () => {
      useDiffStore.getState().toggleOpen()
      expect(useDiffStore.getState().isOpen).toBe(true)
      useDiffStore.getState().toggleOpen()
      expect(useDiffStore.getState().isOpen).toBe(false)
    })
  })

  describe('setOpen', () => {
    it('sets value', () => {
      useDiffStore.getState().setOpen(true)
      expect(useDiffStore.getState().isOpen).toBe(true)
    })
  })

  describe('clear', () => {
    it('resets diff, stats, and selection', () => {
      useDiffStore.setState({
        diff: 'some diff',
        stats: { additions: 5, deletions: 3, fileCount: 2 },
        selectedFiles: new Set(['a.ts']),
      })
      useDiffStore.getState().clear()
      expect(useDiffStore.getState().diff).toBe('')
      expect(useDiffStore.getState().stats).toEqual({ additions: 0, deletions: 0, fileCount: 0 })
      expect(useDiffStore.getState().selectedFiles.size).toBe(0)
    })
  })

  describe('toggleFileSelection', () => {
    it('adds and removes files', () => {
      useDiffStore.getState().toggleFileSelection('a.ts')
      expect(useDiffStore.getState().selectedFiles.has('a.ts')).toBe(true)
      useDiffStore.getState().toggleFileSelection('a.ts')
      expect(useDiffStore.getState().selectedFiles.has('a.ts')).toBe(false)
    })
  })

  describe('clearSelection', () => {
    it('empties set', () => {
      useDiffStore.setState({ selectedFiles: new Set(['a.ts', 'b.ts']) })
      useDiffStore.getState().clearSelection()
      expect(useDiffStore.getState().selectedFiles.size).toBe(0)
    })
  })

  describe('openToFile', () => {
    it('sets isOpen and focusFile', () => {
      useDiffStore.getState().openToFile('src/main.ts')
      expect(useDiffStore.getState().isOpen).toBe(true)
      expect(useDiffStore.getState().focusFile).toBe('src/main.ts')
    })
  })

  describe('fetchDiff', () => {
    it('loads diff and computes stats', async () => {
      await useDiffStore.getState().fetchDiff('task-1')
      const s = useDiffStore.getState()
      expect(s.diff).toContain('+added')
      expect(s.stats.additions).toBeGreaterThan(0)
      expect(s.stats.deletions).toBeGreaterThan(0)
      expect(s.stats.fileCount).toBe(1)
      expect(s.loading).toBe(false)
    })

    it('resets on error', async () => {
      vi.mocked(ipc.getTaskDiff).mockRejectedValueOnce(new Error('fail'))
      await useDiffStore.getState().fetchDiff('task-1')
      expect(useDiffStore.getState().diff).toBe('')
      expect(useDiffStore.getState().stats).toEqual({ additions: 0, deletions: 0, fileCount: 0 })
      expect(useDiffStore.getState().loading).toBe(false)
    })
  })

  describe('stageSelected', () => {
    it('stages selected files and clears selection', async () => {
      useDiffStore.setState({ selectedFiles: new Set(['a.ts', 'b.ts']) })
      await useDiffStore.getState().stageSelected('task-1')
      expect(ipc.gitStage).toHaveBeenCalledWith('task-1', 'a.ts')
      expect(ipc.gitStage).toHaveBeenCalledWith('task-1', 'b.ts')
      expect(useDiffStore.getState().selectedFiles.size).toBe(0)
    })

    it('re-fetches diff after staging', async () => {
      useDiffStore.setState({ selectedFiles: new Set(['a.ts']) })
      await useDiffStore.getState().stageSelected('task-1')
      expect(ipc.getTaskDiff).toHaveBeenCalledWith('task-1')
    })
  })

  describe('revertSelected', () => {
    it('reverts selected files and clears selection', async () => {
      useDiffStore.setState({ selectedFiles: new Set(['a.ts']) })
      await useDiffStore.getState().revertSelected('task-1')
      expect(ipc.gitRevert).toHaveBeenCalledWith('task-1', 'a.ts')
      expect(useDiffStore.getState().selectedFiles.size).toBe(0)
    })

    it('re-fetches diff after reverting', async () => {
      useDiffStore.setState({ selectedFiles: new Set(['a.ts']) })
      await useDiffStore.getState().revertSelected('task-1')
      expect(ipc.getTaskDiff).toHaveBeenCalledWith('task-1')
    })
  })
})
