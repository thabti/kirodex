/**
 * Persistent history store using tauri-plugin-store (LazyStore).
 * Stores thread conversations and project metadata in a separate
 * `history.json` file in the app data directory.
 * Lazy-loaded: no disk I/O until first access.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import type { AgentTask, TaskMessage } from '@/types'

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
}

interface SavedProject {
  workspace: string
  displayName?: string
  threadIds: string[]
}

// ── Store singleton ──────────────────────────────────────────────

const store = new LazyStore('history.json', { autoSave: 500, defaults: {} })

// ── Public API ───────────────────────────────────────────────────

/** Load all persisted threads (returns [] if nothing saved) */
export async function loadThreads(): Promise<SavedThread[]> {
  return (await store.get<SavedThread[]>('threads')) ?? []
}

/** Load all persisted projects (returns [] if nothing saved) */
export async function loadProjects(): Promise<SavedProject[]> {
  return (await store.get<SavedProject[]>('projects')) ?? []
}

/** Persist a snapshot of the current threads */
export async function saveThreads(tasks: Record<string, AgentTask>, projectNames: Record<string, string>): Promise<void> {
  const threads: SavedThread[] = Object.values(tasks)
    .filter((t) => !t.isArchived && t.messages.length > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      workspace: t.workspace,
      createdAt: t.createdAt,
      messages: t.messages.map(toSavedMessage),
    }))

  // Group thread IDs by workspace
  const threadsByWorkspace = new Map<string, string[]>()
  for (const t of Object.values(tasks)) {
    const ids = threadsByWorkspace.get(t.workspace) ?? []
    ids.push(t.id)
    threadsByWorkspace.set(t.workspace, ids)
  }

  const workspaces = [...threadsByWorkspace.keys()]
  const projects: SavedProject[] = workspaces.map((ws) => ({
    workspace: ws,
    ...(projectNames[ws] ? { displayName: projectNames[ws] } : {}),
    threadIds: threadsByWorkspace.get(ws) ?? [],
  }))

  await store.set('threads', threads)
  await store.set('projects', projects)
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
  }))
}

/** Clear all persisted history */
export async function clearHistory(): Promise<void> {
  await store.delete('threads')
  await store.delete('projects')
  await store.save()
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
