import { create } from 'zustand'
import { ipc } from '@/lib/ipc'

interface DiffStats {
  additions: number
  deletions: number
  fileCount: number
}

interface DiffStore {
  isOpen: boolean
  diff: string
  stats: DiffStats
  loading: boolean
  selectedFiles: Set<string>
  focusFile: string | null
  viewedByTask: Record<string, Set<string>>
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  fetchDiff: (taskId: string) => Promise<void>
  clear: () => void
  toggleFileSelection: (filePath: string) => void
  clearSelection: () => void
  stageSelected: (taskId: string) => Promise<void>
  revertSelected: (taskId: string) => Promise<void>
  openToFile: (filePath: string) => void
  toggleViewed: (taskId: string, path: string) => void
  getViewedSet: (taskId: string) => Set<string>
}

const EMPTY_STATS: DiffStats = { additions: 0, deletions: 0, fileCount: 0 }

const EMPTY_VIEWED: Set<string> = new Set()

export const useDiffStore = create<DiffStore>((set, get) => ({
  isOpen: false,
  diff: '',
  stats: EMPTY_STATS,
  loading: false,
  selectedFiles: new Set<string>(),
  focusFile: null,
  viewedByTask: {},

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  fetchDiff: async (taskId: string) => {
    set({ loading: true })
    try {
      // Fetch the unified diff text and the structured stats in parallel.
      // Stats come from libgit2 directly (`task_diff_stats`), not from a
      // string scan of the diff body — single source of truth in Rust.
      const [diff, stats] = await Promise.all([
        ipc.getTaskDiff(taskId),
        ipc.getTaskDiffStats(taskId).catch(() => EMPTY_STATS),
      ])
      set({ diff, stats, loading: false })
    } catch {
      set({ diff: '', stats: EMPTY_STATS, loading: false })
    }
  },

  clear: () => set({ diff: '', stats: EMPTY_STATS, selectedFiles: new Set() }),

  toggleFileSelection: (filePath: string) => set((s) => {
    const next = new Set(s.selectedFiles)
    if (next.has(filePath)) next.delete(filePath)
    else next.add(filePath)
    return { selectedFiles: next }
  }),

  clearSelection: () => set({ selectedFiles: new Set() }),

  stageSelected: async (taskId: string) => {
    const files = Array.from(get().selectedFiles)
    await Promise.all(files.map((f) => ipc.gitStage(taskId, f)))
    set({ selectedFiles: new Set() })
    await get().fetchDiff(taskId)
  },

  revertSelected: async (taskId: string) => {
    const files = Array.from(get().selectedFiles)
    await Promise.all(files.map((f) => ipc.gitRevert(taskId, f)))
    set({ selectedFiles: new Set() })
    await get().fetchDiff(taskId)
  },

  openToFile: (filePath: string) => set({ isOpen: true, focusFile: filePath }),

  toggleViewed: (taskId: string, path: string) => set((s) => {
    const prev = s.viewedByTask[taskId] ?? new Set<string>()
    const next = new Set(prev)
    if (next.has(path)) next.delete(path); else next.add(path)
    return { viewedByTask: { ...s.viewedByTask, [taskId]: next } }
  }),

  getViewedSet: (taskId: string) => get().viewedByTask[taskId] ?? EMPTY_VIEWED,
}))
