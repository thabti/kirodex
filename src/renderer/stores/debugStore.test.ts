import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDebugStore } from './debugStore'
import type { DebugLogEntry } from '@/types'

beforeEach(() => {
  useDebugStore.setState({
    entries: [],
    isOpen: false,
    filter: { search: '', category: 'all', errorsOnly: false, threadName: '', projectName: '' },
  })
})

const makeEntry = (overrides?: Partial<DebugLogEntry>): DebugLogEntry => ({
  id: Date.now(),
  timestamp: new Date().toISOString(),
  direction: 'in',
  category: 'notification',
  type: 'test',
  taskId: null,
  summary: 'test entry',
  payload: null,
  isError: false,
  ...overrides,
})

describe('debugStore', () => {
  describe('initial state', () => {
    it('starts with empty entries', () => {
      expect(useDebugStore.getState().entries).toEqual([])
    })

    it('starts closed', () => {
      expect(useDebugStore.getState().isOpen).toBe(false)
    })

    it('starts with default filter', () => {
      expect(useDebugStore.getState().filter).toEqual({
        search: '',
        category: 'all',
        errorsOnly: false,
        threadName: '',
        projectName: '',
      })
    })
  })

  describe('addEntry', () => {
    it('adds entry via rAF batching', async () => {
      useDebugStore.getState().addEntry(makeEntry({ summary: 'entry 1' }))
      useDebugStore.getState().addEntry(makeEntry({ summary: 'entry 2' }))
      // Entries are batched via rAF, so flush
      await new Promise((r) => requestAnimationFrame(r))
      expect(useDebugStore.getState().entries).toHaveLength(2)
    })

    it('assigns id and timestamp if missing', async () => {
      useDebugStore.getState().addEntry({ ...makeEntry(), id: undefined as unknown as number, timestamp: undefined as unknown as string })
      await new Promise((r) => requestAnimationFrame(r))
      const entry = useDebugStore.getState().entries[0]
      expect(entry.id).toBeDefined()
      expect(entry.timestamp).toBeDefined()
    })
  })

  describe('clear', () => {
    it('empties entries', () => {
      useDebugStore.setState({ entries: [makeEntry()] })
      useDebugStore.getState().clear()
      expect(useDebugStore.getState().entries).toEqual([])
    })
  })

  describe('toggleOpen', () => {
    it('toggles isOpen', () => {
      useDebugStore.getState().toggleOpen()
      expect(useDebugStore.getState().isOpen).toBe(true)
      useDebugStore.getState().toggleOpen()
      expect(useDebugStore.getState().isOpen).toBe(false)
    })
  })

  describe('setOpen', () => {
    it('sets isOpen to specific value', () => {
      useDebugStore.getState().setOpen(true)
      expect(useDebugStore.getState().isOpen).toBe(true)
      useDebugStore.getState().setOpen(false)
      expect(useDebugStore.getState().isOpen).toBe(false)
    })
  })

  describe('setFilter', () => {
    it('merges partial filter', () => {
      useDebugStore.getState().setFilter({ search: 'test' })
      expect(useDebugStore.getState().filter.search).toBe('test')
      expect(useDebugStore.getState().filter.category).toBe('all')
    })

    it('merges multiple fields', () => {
      useDebugStore.getState().setFilter({ category: 'error', errorsOnly: true })
      expect(useDebugStore.getState().filter.category).toBe('error')
      expect(useDebugStore.getState().filter.errorsOnly).toBe(true)
    })

    it('sets threadName filter', () => {
      useDebugStore.getState().setFilter({ threadName: 'thread-1' })
      expect(useDebugStore.getState().filter.threadName).toBe('thread-1')
    })

    it('sets projectName filter', () => {
      useDebugStore.getState().setFilter({ projectName: 'my-project' })
      expect(useDebugStore.getState().filter.projectName).toBe('my-project')
    })
  })
})
