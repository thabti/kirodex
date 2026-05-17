import { useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { useGoalStore } from '@/stores/goalStore'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'
import { record } from '@/lib/analytics-collector'

export type SlashPanel = 'model' | 'agent' | 'branch' | 'worktree' | 'goal' | 'goal-status' | null

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
  record('mode_switch', { detail: modeId })
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
    const KNOWN = new Set(['clear', 'model', 'agent', 'settings', 'upload', 'plan', 'usage', 'data', 'close', 'exit', 'branch', 'worktree', 'btw', 'tangent', 'fork', 'goal'])
    if (KNOWN.has(name)) {
      const mode = useSettingsStore.getState().currentModeId === 'kiro_planner' ? 'plan' : 'command'
      track('feature_used', { feature: 'slash_command', detail: name })
      record('slash_cmd', { detail: `${name}:${mode}` })
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
      case 'data':
        useTaskStore.getState().setView('analytics')
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
      case 'goal':
        // Return false so the picker inserts "/goal " into the input for the user to type an objective
        return false
      default:
        setPanel(null)
        return false
    }
  }, [])

  const executeFullInput = useCallback((input: string): boolean => {
    const trimmed = input.trim()
    // Match /goal subcommands: /goal pause, /goal resume, /goal clear, /goal (bare)
    const goalMatch = trimmed.match(/^\/goal\b(.*)$/i)
    if (goalMatch) {
      const arg = goalMatch[1].trim().toLowerCase()
      const { selectedTaskId } = useTaskStore.getState()
      if (!selectedTaskId) return true // no-op without a thread
      const task = useTaskStore.getState().tasks[selectedTaskId]
      if (!task) return true
      // Feature gate check
      const { settings } = useSettingsStore.getState()
      if (settings.goalEnabled === false) {
        addSystemMessage('⚠️ Goal mode is disabled. Enable it in Settings → Advanced.')
        return true
      }
      const workspace = task.worktreePath ?? task.workspace
      track('feature_used', { feature: 'slash_command', detail: `goal:${arg || 'status'}` })
      if (arg === 'pause') {
        useGoalStore.getState().pauseGoal(selectedTaskId)
        ipc.goalPause(workspace, selectedTaskId).catch(() => {})
        addSystemMessage('⏸️ Goal paused. Use `/goal resume` to continue.')
        return true
      }
      if (arg === 'resume') {
        useGoalStore.getState().resumeGoal(selectedTaskId)
        ipc.goalResume(workspace, selectedTaskId).catch(() => {})
        addSystemMessage('▶️ Goal resumed. The loop will continue on the next turn.')
        return true
      }
      if (arg === 'clear') {
        useGoalStore.getState().clearGoal(selectedTaskId)
        ipc.goalClear(workspace, selectedTaskId).catch(() => {})
        addSystemMessage('🗑️ Goal cleared. Thread returned to normal chat mode.')
        return true
      }
      if (arg === 'status') {
        setPanel('goal-status')
        return true
      }
      if (arg === '') {
        // Bare /goal: open status overlay if goal exists, otherwise open goal modal
        const goal = useGoalStore.getState().getGoal(selectedTaskId)
        if (goal) {
          setPanel('goal-status')
          return true
        }
        // No active goal — return false so "/goal " is inserted for the user to type an objective
        return false
      }
      // /goal <objective text> — open the goal panel (the objective will be pre-filled by the caller)
      setPanel('goal')
      return false // return false so the text stays in the input for the modal to read
    }
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
