import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import type { ReasoningEffort } from '@/types'

export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
}

export const REASONING_EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  low: 'Quick checks and straightforward edits',
  medium: 'Balanced depth for everyday work',
  high: 'More analysis for complex tasks',
  xhigh: 'Extended analysis for difficult problems',
  max: 'Deepest analysis for the hardest tasks',
}

export const isReasoningEffort = (value: string): value is ReasoningEffort => {
  return REASONING_EFFORTS.includes(value as ReasoningEffort)
}

export const applyReasoningEffort = async (
  taskId: string,
  effort: ReasoningEffort,
): Promise<void> => {
  const state = useTaskStore.getState()
  const task = state.tasks[taskId]
  if (!task) throw new Error('Start or open a conversation before setting effort')
  if ((state.taskEfforts[taskId] ?? task.reasoningEffort) === effort) return
  if (task.status === 'running' || task.status === 'pending_permission') {
    throw new Error('Wait for the current turn to finish before changing effort')
  }

  const hasNoLiveSession = task.isArchived === true || task.needsNewConnection === true
  if (!hasNoLiveSession) {
    await ipc.setEffort(taskId, effort)
  }

  const latestState = useTaskStore.getState()
  const latestTask = latestState.tasks[taskId]
  if (!latestTask) return
  latestState.setTaskEffort(taskId, effort)
  latestState.upsertTask({
    ...latestTask,
    reasoningEffort: effort,
    messages: [
      ...latestTask.messages,
      {
        role: 'system',
        content: `Reasoning effort set to ${REASONING_EFFORT_LABELS[effort]}`,
        timestamp: new Date().toISOString(),
      },
    ],
  })
  useTaskStore.getState().persistHistory()
}
