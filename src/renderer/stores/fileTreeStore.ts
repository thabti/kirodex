import { create } from 'zustand'
import { listenEvent } from '@/lib/web-rpc'
import { useDiffStore } from './diffStore'
import { ipc } from '@/lib/ipc'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TreeEntry {
  id: number
  path: string
  name: string
  isDir: boolean
  isSymlink: boolean
  isIgnored: boolean
  isExcluded: boolean
  ext: string
  depth: number
  gitStatus?: string
  modifiedAt: number
}

export interface TreeChangeEvent {
  workspace: string
  kind: 'added' | 'removed' | 'modified' | 'renamed' | 'full'
  entries: TreeEntry[]
  oldPath?: string
}

interface ClipboardEntry {
  path: string
  operation: 'copy' | 'cut'
}

// ── Store ────────────────────────────────────────────────────────────────────

interface FileTreeStore {
  isOpen: boolean
  workspace: string | null
  // Tree data: keyed by parent path -> children
  rootEntries: TreeEntry[]
  childrenMap: Map<string, TreeEntry[]>
  expandedDirs: Set<string>
  loadingDirs: Set<string>
  selectedPath: string | null
  renamingPath: string | null
  previewFile: string | null
  clipboard: ClipboardEntry | null
  showIgnored: boolean

  // Actions
  toggle: () => void
  setOpen: (open: boolean) => void
  setWorkspace: (workspace: string) => void
  loadRoot: (workspace: string) => Promise<void>
  expandDir: (path: string) => Promise<void>
  collapseDir: (path: string) => void
  collapseAll: () => void
  toggleDir: (path: string) => Promise<void>
  setSelectedPath: (path: string | null) => void
  setRenamingPath: (path: string | null) => void
  setPreviewFile: (path: string | null) => void
  setClipboard: (entry: ClipboardEntry | null) => void
  setShowIgnored: (show: boolean) => void
  refresh: () => Promise<void>

  // File operations
  createFile: (parentDir: string, name: string) => Promise<TreeEntry>
  createDirectory: (parentDir: string, name: string) => Promise<TreeEntry>
  deleteEntry: (path: string, permanent?: boolean) => Promise<void>
  renameEntry: (oldPath: string, newName: string) => Promise<TreeEntry>
  duplicateEntry: (path: string) => Promise<TreeEntry>
  pasteEntry: (destDir: string) => Promise<TreeEntry | null>
}

export const useFileTreeStore = create<FileTreeStore>((set, get) => ({
  isOpen: false,
  workspace: null,
  rootEntries: [],
  childrenMap: new Map(),
  expandedDirs: new Set(),
  loadingDirs: new Set(),
  selectedPath: null,
  renamingPath: null,
  previewFile: null,
  clipboard: null,
  showIgnored: false,

  toggle: () => {
    const next = !get().isOpen
    if (next) useDiffStore.getState().setOpen(false)
    set({ isOpen: next })
  },

  setOpen: (open) => {
    if (open === get().isOpen) return
    if (open) useDiffStore.getState().setOpen(false)
    set({ isOpen: open })
  },

  setWorkspace: (workspace) => set({ workspace }),

  loadRoot: async (workspace: string) => {
    set({ workspace, loadingDirs: new Set(['']) })
    try {
      // The backend respects gitignore when `respectGitignore=true` and emits
      // unfiltered entries when it's `false`. Mapping our `showIgnored` flag
      // straight to the inverse keeps a single source of truth and removes
      // the renderer-side post-filter.
      const respectGitignore = !get().showIgnored
      const entries: TreeEntry[] = await ipc.scanRoot(workspace, respectGitignore)
      set({
        rootEntries: entries,
        loadingDirs: new Set(),
        childrenMap: new Map(),
        expandedDirs: new Set(),
      })
      // Start watching
      await ipc.watchProjectTree(workspace).catch(() => {})
    } catch (e) {
      console.error('[fileTree] loadRoot failed:', e)
      set({ rootEntries: [], loadingDirs: new Set() })
    }
  },

  expandDir: async (path: string) => {
    const { workspace, expandedDirs, loadingDirs, childrenMap } = get()
    if (!workspace || expandedDirs.has(path)) return

    const newLoading = new Set(loadingDirs)
    newLoading.add(path)
    set({ loadingDirs: newLoading })

    try {
      const respectGitignore = !get().showIgnored
      const entries: TreeEntry[] = await ipc.scanDirectory(workspace, path, respectGitignore)
      const newChildren = new Map(childrenMap)
      newChildren.set(path, entries)
      const newExpanded = new Set(expandedDirs)
      newExpanded.add(path)
      const newLoadingDone = new Set(get().loadingDirs)
      newLoadingDone.delete(path)
      set({ childrenMap: newChildren, expandedDirs: newExpanded, loadingDirs: newLoadingDone })
    } catch (e) {
      console.error('[fileTree] expandDir failed:', e)
      const newLoadingDone = new Set(get().loadingDirs)
      newLoadingDone.delete(path)
      set({ loadingDirs: newLoadingDone })
    }
  },

  collapseDir: (path: string) => {
    const { expandedDirs, childrenMap } = get()
    const newExpanded = new Set(expandedDirs)
    newExpanded.delete(path)
    // Also collapse all children of this dir
    for (const key of expandedDirs) {
      if (key.startsWith(path + '/')) {
        newExpanded.delete(key)
      }
    }
    set({ expandedDirs: newExpanded })
  },

  collapseAll: () => {
    set({ expandedDirs: new Set() })
  },

  toggleDir: async (path: string) => {
    const { expandedDirs } = get()
    if (expandedDirs.has(path)) {
      get().collapseDir(path)
    } else {
      await get().expandDir(path)
    }
  },

  setSelectedPath: (path) => set({ selectedPath: path }),
  setRenamingPath: (path) => set({ renamingPath: path }),
  setPreviewFile: (path) => set({ previewFile: path }),
  setClipboard: (entry) => set({ clipboard: entry }),
  setShowIgnored: (show) => {
    set({ showIgnored: show })
    // Re-scan with the new gitignore filter so the backend hands us a
    // canonical entry list. No renderer-side filtering needed.
    void get().refresh()
  },

  refresh: async () => {
    const { workspace, showIgnored } = get()
    if (!workspace) return
    const { expandedDirs } = get()
    const respectGitignore = !showIgnored
    const entries: TreeEntry[] = await ipc.scanRoot(workspace, respectGitignore)
    const newChildren = new Map<string, TreeEntry[]>()

    // Re-scan all expanded directories in parallel
    const results = await Promise.allSettled(
      [...expandedDirs].map(async (dir) => {
        const children: TreeEntry[] = await ipc.scanDirectory(workspace, dir, respectGitignore)
        return [dir, children] as const
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [dir, children] = result.value
        newChildren.set(dir, children)
      }
      // Dir may have been deleted — skip failed ones
    }

    // Remove expanded dirs that no longer exist
    const validExpanded = new Set<string>()
    for (const dir of expandedDirs) {
      if (newChildren.has(dir)) {
        validExpanded.add(dir)
      }
    }

    set({ rootEntries: entries, childrenMap: newChildren, expandedDirs: validExpanded })
  },

  // ── File Operations ──────────────────────────────────────────────────────

  createFile: async (parentDir: string, name: string) => {
    const { workspace } = get()
    if (!workspace) throw new Error('No workspace')
    const relPath = parentDir ? `${parentDir}/${name}` : name
    const entry: TreeEntry = await ipc.createFile(workspace, relPath)
    // Refresh the parent directory
    await get().refresh()
    return entry
  },

  createDirectory: async (parentDir: string, name: string) => {
    const { workspace } = get()
    if (!workspace) throw new Error('No workspace')
    const relPath = parentDir ? `${parentDir}/${name}` : name
    const entry: TreeEntry = await ipc.createDirectory(workspace, relPath)
    await get().refresh()
    return entry
  },

  deleteEntry: async (path: string, permanent = false) => {
    const { workspace } = get()
    if (!workspace) throw new Error('No workspace')
    await ipc.deleteEntry(workspace, path, permanent)
    await get().refresh()
  },

  renameEntry: async (oldPath: string, newName: string) => {
    const { workspace } = get()
    if (!workspace) throw new Error('No workspace')
    const parts = oldPath.split('/')
    parts[parts.length - 1] = newName
    const newPath = parts.join('/')
    const entry: TreeEntry = await ipc.renameEntry(workspace, oldPath, newPath)
    await get().refresh()
    return entry
  },

  duplicateEntry: async (path: string) => {
    const { workspace } = get()
    if (!workspace) throw new Error('No workspace')
    const entry: TreeEntry = await ipc.duplicateEntry(workspace, path)
    await get().refresh()
    return entry
  },

  pasteEntry: async (destDir: string) => {
    const { workspace, clipboard } = get()
    if (!workspace || !clipboard) return null

    const fileName = clipboard.path.split('/').pop() ?? ''
    const destPath = destDir ? `${destDir}/${fileName}` : fileName

    if (clipboard.operation === 'copy') {
      const entry: TreeEntry = await ipc.copyEntry(workspace, clipboard.path, destPath)
      await get().refresh()
      set({ clipboard: null })
      return entry
    } else {
      // Cut = rename/move
      const entry: TreeEntry = await ipc.renameEntry(workspace, clipboard.path, destPath)
      await get().refresh()
      set({ clipboard: null })
      return entry
    }
  },
}))

// ── Filesystem Watcher Listener ──────────────────────────────────────────────

let watcherUnlisten: (() => void) | null = null
let watcherStartId = 0
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null

export function startTreeWatcher() {
  // Guard against rapid re-entry: if a listener is already registered, do
  // nothing. The generation id protects against the start→stop→start race
  // where `listen()` is still in flight when this is called again.
  if (watcherUnlisten) return

  const myId = ++watcherStartId

  const unlisten = listenEvent<TreeChangeEvent>('project-tree-changed', (payload) => {
    const { workspace } = useFileTreeStore.getState()
    if (payload.workspace !== workspace) return

    // Debounce rapid filesystem events (e.g., git operations, builds)
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
    refreshDebounceTimer = setTimeout(() => {
      refreshDebounceTimer = null
      useFileTreeStore.getState().refresh()
    }, 300)

    // Also schedule a VCS status refresh (debounced separately at 2s)
    import('@/stores/vcsStatusStore').then(({ scheduleVcsRefresh }) => {
      scheduleVcsRefresh(payload.workspace)
    }).catch((e) => {
      if (import.meta.env.DEV) console.warn('[fileTreeStore] vcsStatusStore import failed:', e)
    })
  })
  if (myId !== watcherStartId || watcherUnlisten) {
    unlisten()
    return
  }
  watcherUnlisten = unlisten
}

export function stopTreeWatcher() {
  // Bumping the generation id signals any in-flight `listen()` resolver to
  // dispose its unlisten as soon as it arrives, preventing leaked listeners.
  watcherStartId++
  if (watcherUnlisten) {
    watcherUnlisten()
    watcherUnlisten = null
  }
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer)
    refreshDebounceTimer = null
  }
}
