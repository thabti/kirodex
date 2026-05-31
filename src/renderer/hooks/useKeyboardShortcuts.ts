import { useEffect } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useKiroStore } from '@/stores/kiroStore'
import { useDiffStore } from '@/stores/diffStore'
import { useDebugStore } from '@/stores/debugStore'
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
      // ── Escape → Stop running agent (skip when terminal has focus) ──
      if (e.key === 'Escape') {
        const isTerminalFocused = !!(e.target as HTMLElement)?.closest('[data-testid="terminal-drawer"]')
        if (isTerminalFocused) return
        const state = useTaskStore.getState()
        const id = state.selectedTaskId
        const task = id ? state.tasks[id] : null
        if (task?.status === 'running') {
          e.preventDefault()
          ipc.pauseTask(task.id)
          state.clearTurn(task.id)
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

      // ── Cmd+B → Toggle btw (tangent) mode ──────────────────
      if (key === 'b' && !e.shiftKey) {
        e.preventDefault()
        const state = useTaskStore.getState()
        if (state.btwCheckpoint) {
          state.exitBtwMode(false)
        } else {
          // Focus chat input with /btw prefilled
          document.dispatchEvent(new CustomEvent('btw-shortcut'))
        }
        return
      }

      // ── Cmd+D → Toggle diff ────────────────────────────────
      if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        useDiffStore.getState().toggleOpen()
        return
      }

      // ── Cmd+\ → Toggle split view ─────────────────────────
      if ((key === '\\' || e.code === 'Backslash') && !e.shiftKey) {
        e.preventDefault()
        const state = useTaskStore.getState()
        if (state.activeSplitId) {
          state.closeSplit()
        } else if (state.splitViews.length > 0) {
          state.setActiveSplit(state.splitViews[0].id)
        } else if (state.selectedTaskId) {
          const current = state.selectedTaskId
          const candidate = Object.values(state.tasks)
            .filter((t) => t.id !== current && !t.isArchived && t.status !== 'completed' && t.status !== 'cancelled' && t.messages.length > 0)
            .sort((a, b) => (b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt).localeCompare(a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt))[0]
          if (candidate) state.createSplitView(current, candidate.id)
        }
        return
      }

      // ── Cmd+Shift+\ → New split view with current thread ──
      if ((key === '\\' || e.code === 'Backslash') && e.shiftKey) {
        e.preventDefault()
        const state = useTaskStore.getState()
        const current = state.selectedTaskId
        if (!current) return
        const candidate = Object.values(state.tasks)
          .filter((t) => t.id !== current && !t.isArchived && t.status !== 'completed' && t.status !== 'cancelled' && t.messages.length > 0)
          .sort((a, b) => {
            const aTime = a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt
            const bTime = b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt
            return bTime.localeCompare(aTime)
          })[0]
        if (candidate) state.createSplitView(current, candidate.id)
        return
      }

      // ── Cmd+Shift+D → Toggle debug panel ───────────────────
      if (key === 'd' && e.shiftKey) {
        e.preventDefault()
        useDebugStore.getState().toggleOpen()
        return
      }

      // ── Cmd+W → Close thread/project ──────────────────────────
      if (key === 'w' && !e.shiftKey) {
        e.preventDefault()
        const state = useTaskStore.getState()
        const taskId = state.selectedTaskId
        if (taskId) {
          void ipc.cancelTask(taskId).catch(() => {})
          state.removeTask(taskId)
          void ipc.deleteTask(taskId)
        } else if (state.pendingWorkspace) {
          state.setPendingWorkspace(null)
        }
        return
      }

      // ── Cmd+[ → Nav back (history) ────────────────────────
      if (!e.shiftKey && (key === '[' || e.code === 'BracketLeft')) {
        e.preventDefault()
        useTaskStore.getState().navBack()
        return
      }

      // ── Cmd+] → Nav forward (history) ─────────────────────
      if (!e.shiftKey && (key === ']' || e.code === 'BracketRight')) {
        e.preventDefault()
        useTaskStore.getState().navForward()
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

      // ── Cmd+1 through Cmd+9 → Jump to thread in active project ──
      if (!e.shiftKey && key >= '1' && key <= '9') {
        e.preventDefault()
        const state = useTaskStore.getState()
        // Determine the active project workspace
        const activeWorkspace = state.selectedTaskId
          ? (state.tasks[state.selectedTaskId]?.originalWorkspace ?? state.tasks[state.selectedTaskId]?.workspace)
          : state.pendingWorkspace
        if (!activeWorkspace) return
        // Get threads in this project, sorted by creation time (matches sidebar default)
        const threads = Object.values(state.tasks)
          .filter((t) => (t.originalWorkspace ?? t.workspace) === activeWorkspace)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        const jumpIdx = parseInt(key, 10) - 1
        if (jumpIdx < threads.length) {
          state.setSelectedTask(threads[jumpIdx].id)
        }
        return
      }
    }

    // ── Agent keyboard shortcuts (ctrl+<key> or shift+<key> from agent config) ──
    // NOTE: This block is OUTSIDE the `if (!mod) return` guard above so that
    // shift-only shortcuts (e.g. "shift+a") can fire even without Cmd/Ctrl held.
    const agentHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const agents = useKiroStore.getState().config.agents
      for (const agent of agents) {
        if (!agent.keyboardShortcut) continue
        // Parse "ctrl+a", "shift+b", "ctrl+shift+r" etc.
        const parts = agent.keyboardShortcut.toLowerCase().split('+')
        const agentKey = parts[parts.length - 1]
        const needsCtrl = parts.includes('ctrl')
        const needsShift = parts.includes('shift')
        // Require exact modifier match to avoid false positives:
        // - ctrl shortcuts: ctrlKey must be true, metaKey must be false (no Cmd confusion on macOS)
        // - shift shortcuts: shiftKey must be true, ctrlKey/metaKey must be false
        if (
          key === agentKey &&
          (needsCtrl ? (e.ctrlKey && !e.metaKey) : !e.ctrlKey) &&
          (needsShift ? e.shiftKey : !e.shiftKey)
        ) {
          // Don't fire when typing in inputs
          const tag = (e.target as HTMLElement)?.tagName
          if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
          e.preventDefault()
          const currentModeId = useSettingsStore.getState().currentModeId
          const taskId = useTaskStore.getState().selectedTaskId
          // Toggle: if already on this agent, switch back to default
          const targetId = currentModeId === agent.name ? 'kiro_default' : agent.name
          useSettingsStore.setState({ currentModeId: targetId })
          if (taskId) {
            useTaskStore.getState().setTaskMode(taskId, targetId)
            ipc.setMode(taskId, targetId).catch(() => {})
            ipc.sendMessage(taskId, `/agent ${targetId}`).catch(() => {})
            // Show welcome message when switching to the agent (not when toggling back)
            if (targetId === agent.name && agent.welcomeMessage) {
              const { tasks, upsertTask } = useTaskStore.getState()
              const task = tasks[taskId]
              if (task) {
                upsertTask({
                  ...task,
                  messages: [
                    ...task.messages,
                    { role: 'system', content: `🤖 **${agent.name}**: ${agent.welcomeMessage}`, timestamp: new Date().toISOString() },
                  ],
                })
              }
            }
          }
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('keydown', agentHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keydown', agentHandler)
    }
  }, [])
}
