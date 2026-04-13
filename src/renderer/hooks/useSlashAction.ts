import { useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'

export type SlashPanel = 'model' | 'agent' | null

export interface SlashActionResult {
  panel: SlashPanel
  dismissPanel: () => void
  execute: (commandName: string) => boolean
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
    ipc.setMode(taskId, modeId).catch(() => {
      addSystemMessage(`⚠️ Failed to sync ${label} mode with backend`)
    })
  }
}

export const useSlashAction = (): SlashActionResult => {
  const [panel, setPanel] = useState<SlashPanel>(null)

  const execute = useCallback((commandName: string): boolean => {
    const name = bare(commandName)
    // Track every recognized slash command. The switch below rejects unknown
    // names by returning false, so we gate the track call on that path via
    // the `default` case.
    const KNOWN = new Set(['clear', 'model', 'agent', 'settings', 'upload', 'plan', 'chat', 'close', 'exit'])
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
        const { selectedTaskId, removeTask, pendingWorkspace, setPendingWorkspace } = useTaskStore.getState()
        if (selectedTaskId) {
          void ipc.cancelTask(selectedTaskId).catch(() => {})
          removeTask(selectedTaskId)
          void ipc.deleteTask(selectedTaskId)
        } else if (pendingWorkspace) {
          setPendingWorkspace(null)
        }
        setPanel(null)
        return true
      }
      default:
        setPanel(null)
        return false
    }
  }, [])

  const dismissPanel = useCallback(() => setPanel(null), [])

  return { panel, dismissPanel, execute }
}
