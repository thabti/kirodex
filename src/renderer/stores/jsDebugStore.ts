import { create } from 'zustand'
import type { JsDebugEntry, JsDebugCategory } from '@/types'

const MAX_ENTRIES = 2000

interface JsDebugFilter {
  readonly search: string
  readonly category: JsDebugCategory | 'all'
  readonly errorsOnly: boolean
  readonly threadName: string
  readonly projectName: string
}

interface JsDebugStore {
  entries: JsDebugEntry[]
  filter: JsDebugFilter
  addEntry: (entry: JsDebugEntry) => void
  clear: () => void
  setFilter: (partial: Partial<JsDebugFilter>) => void
}

// rAF batching — same pattern as debugStore
let entryBuf: JsDebugEntry[] = []
let entryRaf: number | null = null

let nextId = 1

const flushEntries = (): void => {
  const buf = entryBuf
  entryBuf = []
  entryRaf = null
  if (buf.length === 0) return
  useJsDebugStore.setState((s) => {
    const combined = s.entries.concat(buf)
    return {
      entries: combined.length > MAX_ENTRIES
        ? combined.slice(-MAX_ENTRIES)
        : combined,
    }
  })
}

export const useJsDebugStore = create<JsDebugStore>((set) => ({
  entries: [],
  filter: {
    search: '',
    category: 'all',
    errorsOnly: false,
    threadName: '',
    projectName: '',
  },

  addEntry: (raw) => {
    const entry: JsDebugEntry = {
      ...raw,
      id: nextId++,
      timestamp: raw.timestamp || new Date().toISOString(),
    }
    entryBuf.push(entry)
    if (!entryRaf) entryRaf = requestAnimationFrame(flushEntries)
  },

  clear: () => set({ entries: [] }),

  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),
}))
