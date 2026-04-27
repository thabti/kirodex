/**
 * Persistent history store using tauri-plugin-store (LazyStore).
 * Stores thread conversations and project metadata in a separate
 * `history.json` file in the app data directory.
 * Lazy-loaded: no disk I/O until first access.
 */
import type { LazyStore } from '@tauri-apps/plugin-store'
import type { AgentTask, TaskMessage, SoftDeletedThread, AppSettings } from '@/types'

// ── Persisted types ──────────────────────────────────────────────

interface SavedMessage {
  role: string
  content: string
  timestamp: string
  thinking?: string
}

interface SavedThread {
  id: string
  name: string
  workspace: string
  createdAt: string
  messages: SavedMessage[]
  parentTaskId?: string
  worktreePath?: string
  originalWorkspace?: string
  projectId?: string
}

interface SavedProject {
  workspace: string
  displayName?: string
  projectId?: string
  threadIds: string[]
  threadOrder?: string[]
}

// ── Store singleton ──────────────────────────────────────────────

const HISTORY_FILE = import.meta.env.DEV ? 'history-dev.json' : 'history.json'
const BACKUP_FILE = import.meta.env.DEV ? 'history-dev.backup.json' : 'history.backup.json'

let _store: LazyStore | null = null

/**
 * Guard flag: true while this window is writing to the store.
 * Prevents onKeyChange from triggering a loadTasks reload for our own writes.
 * Uses a counter (not boolean) because multiple saves can overlap due to autoSave.
 */
let _selfWriteCount = 0

/** Returns true if this window is currently writing to the store. */
export const isSelfWriting = (): boolean => _selfWriteCount > 0

const getStore = async (): Promise<LazyStore> => {
  if (!_store) {
    const { LazyStore } = await import('@tauri-apps/plugin-store')
    _store = new LazyStore(HISTORY_FILE, { autoSave: 500, defaults: {} })
    // Validate the store is readable — if corrupted, reset it
    try {
      await _store.get<unknown>('threads')
    } catch (err) {
      console.warn('[history-store] Store corrupted, resetting:', err)
      try {
        await _store.clear()
        await _store.save()
      } catch {
        // If clear also fails, recreate the store instance
        _store = new LazyStore(HISTORY_FILE, { autoSave: 500, defaults: {} })
      }
    }
  }
  return _store
}

// ── Public API ───────────────────────────────────────────────────

/** Load all persisted threads (returns [] if nothing saved) */
export async function loadThreads(): Promise<SavedThread[]> {
  const store = await getStore()
  return (await store.get<SavedThread[]>('threads')) ?? []
}

/** Lightweight metadata for archived threads. Lets us list them in the sidebar
 *  without paying the cost of holding every message in memory. */
export interface ArchivedThreadMeta {
  readonly id: string
  readonly name: string
  readonly workspace: string
  readonly createdAt: string
  /** Timestamp of the last persisted message; falls back to createdAt. */
  readonly lastActivityAt: string
  readonly messageCount: number
  readonly parentTaskId?: string
  readonly worktreePath?: string
  readonly originalWorkspace?: string
  readonly projectId?: string
}

/** Load only the metadata projection of every persisted thread.
 *  Drops the heavy messages array immediately so it can be GC'd. */
export async function loadThreadsMeta(): Promise<ArchivedThreadMeta[]> {
  const threads = await loadThreads()
  return threads.map(toMeta)
}

/** Load a single persisted thread by id. Returns null if not found. */
export async function loadThread(id: string): Promise<SavedThread | null> {
  const threads = await loadThreads()
  return threads.find((t) => t.id === id) ?? null
}

const toMeta = (t: SavedThread): ArchivedThreadMeta => {
  const last = t.messages.length > 0 ? t.messages[t.messages.length - 1].timestamp : t.createdAt
  return {
    id: t.id,
    name: t.name,
    workspace: t.workspace,
    createdAt: t.createdAt,
    lastActivityAt: last,
    messageCount: t.messages.length,
    ...(t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
    ...(t.worktreePath ? { worktreePath: t.worktreePath } : {}),
    ...(t.originalWorkspace ? { originalWorkspace: t.originalWorkspace } : {}),
    ...(t.projectId ? { projectId: t.projectId } : {}),
  }
}

/** Load all persisted projects (returns [] if nothing saved) */
export async function loadProjects(): Promise<SavedProject[]> {
  const store = await getStore()
  return (await store.get<SavedProject[]>('projects')) ?? []
}

/** Persist a snapshot of the current threads.
 *
 *  Archived threads that are not currently loaded into `tasks` (e.g. lazy-meta
 *  threads from previous sessions that the user hasn't opened) are preserved
 *  on disk verbatim by reading the existing array first and only overwriting
 *  entries whose ids are in `tasks` or in `keepArchivedIds`. Anything not
 *  represented in either set is dropped (this handles permanent deletes).
 */
export async function saveThreads(
  tasks: Record<string, AgentTask>,
  projectNames: Record<string, string>,
  projectIds: Record<string, string> = {},
  orderedProjects: string[] = [],
  threadOrders: Record<string, string[]> = {},
  keepArchivedIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const store = await getStore()
  // Read first so we don't lose archived threads that were never inflated
  // into the in-memory `tasks` map this session.
  const existing = (await store.get<SavedThread[]>('threads')) ?? []
  const merged = new Map<string, SavedThread>()
  const liveIds = new Set<string>()

  // 1. Carry over archived threads from disk (unchanged).
  for (const t of existing) {
    if (keepArchivedIds.has(t.id)) merged.set(t.id, t)
  }

  // 2. Overwrite/insert entries for live tasks currently in memory.
  for (const t of Object.values(tasks)) {
    if (t.messages.length === 0) continue
    liveIds.add(t.id)
    merged.set(t.id, {
      id: t.id,
      name: t.name,
      workspace: t.workspace,
      createdAt: t.createdAt,
      messages: t.messages.map(toSavedMessage),
      ...(t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
      ...(t.worktreePath ? { worktreePath: t.worktreePath } : {}),
      ...(t.originalWorkspace ? { originalWorkspace: t.originalWorkspace } : {}),
      ...(t.projectId ? { projectId: t.projectId } : {}),
    })
  }

  const threads: SavedThread[] = Array.from(merged.values())

  // Group thread IDs by workspace — worktree threads nest under originalWorkspace.
  // Iterate the merged set so threads kept from disk (archived, not in `tasks`)
  // still register their workspace association.
  const threadsByWorkspace = new Map<string, string[]>()
  for (const t of threads) {
    const ws = t.originalWorkspace ?? t.workspace
    const ids = threadsByWorkspace.get(ws) ?? []
    ids.push(t.id)
    threadsByWorkspace.set(ws, ids)
  }

  // Use the caller's project order if provided, then append any workspaces not in the list
  const seen = new Set<string>()
  const workspaces: string[] = []
  for (const ws of orderedProjects) {
    if (!seen.has(ws)) { seen.add(ws); workspaces.push(ws) }
  }
  for (const ws of threadsByWorkspace.keys()) {
    if (!seen.has(ws)) { seen.add(ws); workspaces.push(ws) }
  }

  const projects: SavedProject[] = workspaces.map((ws) => ({
    workspace: ws,
    ...(projectNames[ws] ? { displayName: projectNames[ws] } : {}),
    ...(projectIds[ws] ? { projectId: projectIds[ws] } : {}),
    threadIds: threadsByWorkspace.get(ws) ?? [],
    ...(threadOrders[ws]?.length ? { threadOrder: threadOrders[ws] } : {}),
  }))

  _selfWriteCount++
  try {
    await store.set('threads', threads)
    await store.set('projects', projects)
  } finally {
    // Delay decrement past autoSave window (500ms) so onKeyChange sees the flag
    setTimeout(() => { _selfWriteCount-- }, 600)
  }
}

/** Convert persisted threads into archived AgentTasks */
export function toArchivedTasks(saved: SavedThread[]): AgentTask[] {
  return saved.map((t) => ({
    id: t.id,
    name: t.name,
    workspace: t.workspace,
    status: 'completed' as const,
    createdAt: t.createdAt,
    messages: t.messages.map(toTaskMessage),
    isArchived: true,
    ...(t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
    ...(t.worktreePath ? { worktreePath: t.worktreePath } : {}),
    ...(t.originalWorkspace ? { originalWorkspace: t.originalWorkspace } : {}),
    ...(t.projectId ? { projectId: t.projectId } : {}),
  }))
}

/** Load soft-deleted threads (returns [] if nothing saved) */
export async function loadSoftDeleted(): Promise<SoftDeletedThread[]> {
  const store = await getStore()
  return (await store.get<SoftDeletedThread[]>('softDeleted')) ?? []
}

/** Persist soft-deleted threads */
export async function saveSoftDeleted(items: SoftDeletedThread[]): Promise<void> {
  const store = await getStore()
  _selfWriteCount++
  try {
    await store.set('softDeleted', items)
  } finally {
    setTimeout(() => { _selfWriteCount-- }, 600)
  }
}

/** Clear all persisted history */
export async function clearHistory(): Promise<void> {
  const store = await getStore()
  await store.delete('threads')
  await store.delete('projects')
  await store.delete('softDeleted')
  await store.save()
}

// ── Flush & Backup ───────────────────────────────────────────────

/** Force an immediate write of pending changes to disk */
export async function flush(): Promise<void> {
  const store = await getStore()
  await store.save()
}

// ── UI State Persistence ─────────────────────────────────────────

export interface PersistedUiState {
  selectedTaskId: string | null
  view: string
  sidePanelOpen: boolean
  sidebarCollapsed: boolean
  splitViews?: Array<{ id: string; left: string; right: string; ratio: number }>
  activeSplitId?: string | null
  pinnedThreadIds?: string[]
}

/** Save the current UI state so it can be restored on next launch */
export async function saveUiState(state: PersistedUiState): Promise<void> {
  const store = await getStore()
  _selfWriteCount++
  try {
    await store.set('uiState', state)
  } finally {
    setTimeout(() => { _selfWriteCount-- }, 600)
  }
}

/** Load the persisted UI state (returns null if nothing saved) */
export async function loadUiState(): Promise<PersistedUiState | null> {
  const store = await getStore()
  return (await store.get<PersistedUiState>('uiState')) ?? null
}

/** Backup store singleton (separate file from primary) */
let _backupStore: LazyStore | null = null

const getBackupStore = async (): Promise<LazyStore> => {
  if (!_backupStore) {
    const { LazyStore } = await import('@tauri-apps/plugin-store')
    _backupStore = new LazyStore(BACKUP_FILE, { autoSave: false, defaults: {} })
  }
  return _backupStore
}

export interface BackupData {
  threads: SavedThread[]
  projects: SavedProject[]
  softDeleted: SoftDeletedThread[]
  settings?: AppSettings
}

/** Create a backup of all persisted state */
export async function createBackup(settings?: AppSettings): Promise<void> {
  const primary = await getStore()
  const threads = (await primary.get<SavedThread[]>('threads')) ?? []
  const projects = (await primary.get<SavedProject[]>('projects')) ?? []
  const softDeleted = (await primary.get<SoftDeletedThread[]>('softDeleted')) ?? []
  const backup = await getBackupStore()
  await backup.set('threads', threads)
  await backup.set('projects', projects)
  await backup.set('softDeleted', softDeleted)
  if (settings) await backup.set('settings', settings)
  await backup.save()
}

/** Load backup data (returns empty arrays if no backup exists) */
export async function loadBackup(): Promise<BackupData> {
  try {
    const backup = await getBackupStore()
    return {
      threads: (await backup.get<SavedThread[]>('threads')) ?? [],
      projects: (await backup.get<SavedProject[]>('projects')) ?? [],
      softDeleted: (await backup.get<SoftDeletedThread[]>('softDeleted')) ?? [],
      settings: (await backup.get<AppSettings>('settings')) ?? undefined,
    }
  } catch {
    return { threads: [], projects: [], softDeleted: [] }
  }
}

// ── Cross-window sync ─────────────────────────────────────────

/** Subscribe to changes made by other windows. Returns an unlisten function. */
export async function subscribeToChanges(
  onThreadsChanged: () => void,
  onProjectsChanged: () => void,
): Promise<() => void> {
  const store = await getStore()
  const unsub1 = await store.onKeyChange('threads', onThreadsChanged)
  const unsub2 = await store.onKeyChange('projects', onProjectsChanged)
  return () => { unsub1(); unsub2() }
}

// ── Helpers ──────────────────────────────────────────────────────

function toSavedMessage(msg: TaskMessage): SavedMessage {
  return {
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    ...(msg.thinking ? { thinking: msg.thinking } : {}),
  }
}

function toTaskMessage(msg: SavedMessage): TaskMessage {
  return {
    role: msg.role as TaskMessage['role'],
    content: msg.content,
    timestamp: msg.timestamp,
    ...(msg.thinking ? { thinking: msg.thinking } : {}),
  }
}
