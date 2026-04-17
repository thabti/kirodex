import { useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'

export type SlashPanel = 'model' | 'agent' | 'usage' | 'branch' | 'worktree' | null

export interface SlashActionResult {
  panel: SlashPanel
  dismissPanel: () => void
  execute: (commandName: string) => boolean
  /** Handle full input text for commands like /btw that need arguments. Returns true if handled. */
  executeFullInput: (input: string) => boolean
}

const bare = (name: string): string => name.replace(/^\/+/, '')

/** Add a system message to the current task's chat */
const addSystemMessage = (text: string): void => {
  const { selectedTaskId, tasks, upsertTask } = useTaskStore.getState()
  if (!selectedTaskId || !tasks[selectedTaskId]) return
  const task = tasks[selectedTaskId]
  upsertTask({
    ...task,
    messages: [...task.messages, { role: 'system', content: text, timestamp: new Date().toISOString() }],
  })
}

/** Switch mode optimistically, then confirm via IPC.
 *  Works even before ACP connects (availableModes may be empty). */
const switchMode = (modeId: string, label: string): void => {
  useSettingsStore.setState({ currentModeId: modeId })
  addSystemMessage(`Switched to ${label} mode`)
  track('feature_used', { feature: 'mode_switch', detail: modeId })
  const taskId = useTaskStore.getState().selectedTaskId
  if (taskId) {
    useTaskStore.getState().setTaskMode(taskId, modeId)
    ipc.setMode(taskId, modeId).catch(() => {
      addSystemMessage(`⚠️ Failed to sync ${label} mode with backend`)
    })
    ipc.sendMessage(taskId, `/agent ${modeId}`).catch(() => {})
  }
}

export const useSlashAction = (): SlashActionResult => {
  const [panel, setPanel] = useState<SlashPanel>(null)

  const execute = useCallback((commandName: string): boolean => {
    const name = bare(commandName)
    // Track every recognized slash command. The switch below rejects unknown
    // names by returning false, so we gate the track call on that path via
    // the `default` case.
    const KNOWN = new Set(['clear', 'model', 'agent', 'settings', 'upload', 'plan', 'usage', 'close', 'exit', 'branch', 'worktree', 'btw', 'tangent', 'fork'])
    if (KNOWN.has(name)) {
      track('feature_used', { feature: 'slash_command', detail: name })
    }
    switch (name) {
      case 'clear': {
        const { selectedTaskId, tasks, clearTurn } = useTaskStore.getState()
        if (selectedTaskId && tasks[selectedTaskId]) {
          // Directly set messages to [] — bypasses upsertTask's merge logic
          useTaskStore.setState((s) => {
            const task = s.tasks[selectedTaskId]
            if (!task) return s
            return { tasks: { ...s.tasks, [selectedTaskId]: { ...task, messages: [] } } }
          })
          clearTurn(selectedTaskId)
        }
        setPanel(null)
        return true
      }
      case 'model':
        setPanel((p) => (p === 'model' ? null : 'model'))
        return true
      case 'agent':
        setPanel((p) => (p === 'agent' ? null : 'agent'))
        return true
      case 'settings':
        useTaskStore.getState().setSettingsOpen(true)
        setPanel(null)
        return true
      case 'upload':
        // Trigger the hidden file input — dispatched as a custom event picked up by ChatInput
        document.dispatchEvent(new CustomEvent('slash-upload'))
        setPanel(null)
        return true
      case 'usage':
        setPanel((p) => (p === 'usage' ? null : 'usage'))
        return true
      case 'plan': {
        const current = useSettingsStore.getState().currentModeId
        if (current === 'kiro_planner') {
          switchMode('kiro_default', 'Default')
        } else {
          switchMode('kiro_planner', 'Plan')
        }
        setPanel(null)
        return true
      }
      case 'close':
      case 'exit': {
        const { selectedTaskId, archiveTask, pendingWorkspace, setPendingWorkspace } = useTaskStore.getState()
        if (selectedTaskId) {
          archiveTask(selectedTaskId)
        } else if (pendingWorkspace) {
          setPendingWorkspace(null)
        }
        setPanel(null)
        return true
      }
      case 'branch':
        setPanel((p) => (p === 'branch' ? null : 'branch'))
        return true
      case 'worktree':
        setPanel((p) => (p === 'worktree' ? null : 'worktree'))
        return true
      case 'btw':
      case 'tangent': {
        // When selected from the picker, exit btw mode if active
        const { btwCheckpoint, exitBtwMode } = useTaskStore.getState()
        if (btwCheckpoint) {
          exitBtwMode(false)
          setPanel(null)
          return true
        }
        // Not in btw mode — return false so the picker inserts "/btw " for the user to type a question
        setPanel(null)
        return false
      }
      case 'fork': {
        const { selectedTaskId, forkTask } = useTaskStore.getState()
        if (selectedTaskId) void forkTask(selectedTaskId)
        setPanel(null)
        return true
      }
      default:
        setPanel(null)
        return false
    }
  }, [])

  const executeFullInput = useCallback((input: string): boolean => {
    const trimmed = input.trim()
    // Match /btw or /tangent at the start
    const match = trimmed.match(/^\/(?:btw|tangent)\b(.*)$/i)
    if (!match) return false
    const arg = match[1].trim()
    const { selectedTaskId, btwCheckpoint, exitBtwMode, enterBtwMode } = useTaskStore.getState()
    track('feature_used', { feature: 'slash_command', detail: 'btw' })
    // If already in btw mode, exit
    if (btwCheckpoint) {
      const keepTail = arg.toLowerCase() === 'tail'
      exitBtwMode(keepTail)
      return true
    }
    // Enter btw mode with a question
    if (!arg) return true // no question = no-op
    if (selectedTaskId) enterBtwMode(selectedTaskId, arg)
    // Return false so the caller sends the question as a message (PendingChat handles btw entry after task creation)
    return false
  }, [])

  const dismissPanel = useCallback(() => setPanel(null), [])

  return { panel, dismissPanel, execute, executeFullInput }
}
