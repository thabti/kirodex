import { useEffect } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { useDiffStore } from '@/stores/diffStore'
import { ipc } from '@/lib/ipc'

/**
 * Returns a flat, ordered list of all thread IDs across all projects.
 * Ordered by: project order, then most-recent-first within each project.
 */
function getOrderedThreadIds(): string[] {
  const { tasks, projects } = useTaskStore.getState()
  const ids: string[] = []
  const seen = new Set<string>()

  // Group by workspace in project order
  for (const ws of projects) {
    const wsTasks = Object.values(tasks)
      .filter((t) => t.workspace === ws)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    for (const t of wsTasks) {
      ids.push(t.id)
      seen.add(t.id)
    }
  }

  // Catch any orphaned tasks
  for (const t of Object.values(tasks)) {
    if (!seen.has(t.id)) ids.push(t.id)
  }

  return ids
}

/**
 * Global keyboard shortcuts for Kirodex.
 * Attach once in App.tsx.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ── Escape → Stop running agent ────────────────────────
      if (e.key === 'Escape') {
        const state = useTaskStore.getState()
        const id = state.selectedTaskId
        const task = id ? state.tasks[id] : null
        if (task?.status === 'running') {
          e.preventDefault()
          ipc.pauseTask(task.id)
          return
        }
      }

      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Ignore when typing in inputs (except our textarea which handles its own keys)
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return

      const key = e.key.toLowerCase()

      // ── Cmd+, → Open settings ──────────────────────────────
      if (key === ',' && !e.shiftKey) {
        e.preventDefault()
        useTaskStore.getState().setSettingsOpen(true)
        return
      }

      // ── Cmd+J → Toggle terminal ────────────────────────────
      if (key === 'j' && !e.shiftKey) {
        e.preventDefault()
        const tid = useTaskStore.getState().selectedTaskId; if (tid) useTaskStore.getState().toggleTerminal(tid)
        return
      }

      // ── Cmd+D → Toggle diff ────────────────────────────────
      if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        useDiffStore.getState().toggleOpen()
        return
      }

      // ── Cmd+O → New project ────────────────────────────────
      if (key === 'o' && !e.shiftKey) {
        e.preventDefault()
        useTaskStore.getState().setNewProjectOpen(true)
        return
      }

      // ── Cmd+N → New thread ─────────────────────────────────
      if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        const state = useTaskStore.getState()
        // Use the active workspace or the first project
        const workspace = state.selectedTaskId
          ? state.tasks[state.selectedTaskId]?.workspace
          : state.projects[0]
        if (workspace) {
          state.setPendingWorkspace(workspace)
        }
        return
      }

      // ── Cmd+W → Close thread/project (no preventDefault — let native close happen too)
      if (key === 'w' && !e.shiftKey) {
        const state = useTaskStore.getState()
        const taskId = state.selectedTaskId
        if (taskId) {
          void ipc.cancelTask(taskId).catch(() => {})
          state.removeTask(taskId)
          void ipc.deleteTask(taskId)
        } else if (state.pendingWorkspace) {
          state.setPendingWorkspace(null)
        }
        // Don't preventDefault — native Cmd+W still works
        return
      }

      // ── Cmd+Shift+[ → Previous thread ──────────────────────
      if (e.shiftKey && (key === '[' || e.code === 'BracketLeft')) {
        e.preventDefault()
        const ids = getOrderedThreadIds()
        const current = useTaskStore.getState().selectedTaskId
        const idx = current ? ids.indexOf(current) : -1
        const prev = idx > 0 ? ids[idx - 1] : ids[ids.length - 1]
        if (prev) useTaskStore.getState().setSelectedTask(prev)
        return
      }

      // ── Cmd+Shift+] → Next thread ─────────────────────────
      if (e.shiftKey && (key === ']' || e.code === 'BracketRight')) {
        e.preventDefault()
        const ids = getOrderedThreadIds()
        const current = useTaskStore.getState().selectedTaskId
        const idx = current ? ids.indexOf(current) : -1
        const next = idx < ids.length - 1 ? ids[idx + 1] : ids[0]
        if (next) useTaskStore.getState().setSelectedTask(next)
        return
      }

      // ── Cmd+1 through Cmd+9 → Jump to thread ──────────────
      if (!e.shiftKey && key >= '1' && key <= '9') {
        e.preventDefault()
        const ids = getOrderedThreadIds()
        const jumpIdx = parseInt(key, 10) - 1
        if (jumpIdx < ids.length) {
          useTaskStore.getState().setSelectedTask(ids[jumpIdx])
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
