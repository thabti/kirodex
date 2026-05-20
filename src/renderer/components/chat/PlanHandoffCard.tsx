import { memo, useCallback, useState } from 'react'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { usePanelResolvedTaskId } from './PanelContext'
import { ipc } from '@/lib/ipc'

const HANDOFF_PATTERN = /ready to exit \[plan\] agent/i
const HANDOFF_MESSAGE = 'Go ahead working on the plan'

/** Returns true when assistant text contains the plan-agent handoff prompt */
export const isPlanHandoff = (text: string): boolean =>
  HANDOFF_PATTERN.test(text)

export const PlanHandoffCard = memo(function PlanHandoffCard() {
  const resolvedTaskId = usePanelResolvedTaskId()
  const globalModeId = useSettingsStore((s) => s.currentModeId)
  const taskModeId = useTaskStore((s) => resolvedTaskId ? s.taskModes[resolvedTaskId] ?? null : null)
  const currentModeId = taskModeId ?? globalModeId
  const isPlan = currentModeId === 'kiro_planner'
  const [isSwitching, setIsSwitching] = useState(false)

  const handleExecute = useCallback(() => {
    const taskId = resolvedTaskId
    if (!taskId || isSwitching) return
    setIsSwitching(true)
    useSettingsStore.setState({ currentModeId: 'kiro_default' })
    useTaskStore.getState().setTaskMode(taskId, 'kiro_default')
    ipc.setMode(taskId, 'kiro_default').then(() => {
      const state = useTaskStore.getState()
      const task = state.tasks[taskId]
      if (!task) return
      const userMsg = { role: 'user' as const, content: HANDOFF_MESSAGE, timestamp: new Date().toISOString() }
      state.upsertTask({ ...task, status: 'running', messages: [...task.messages, userMsg] })
      state.clearTurn(taskId)
      ipc.sendMessage(taskId, HANDOFF_MESSAGE)
    }).catch(() => setIsSwitching(false))
  }, [isSwitching, resolvedTaskId])

  if (!isPlan) return null

  return (
    <div
      className="mt-3 pt-3 border-t border-border/40"
      data-testid="plan-handoff-card"
      role="status"
      aria-label="Plan ready to execute"
    >
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground/90">Plan ready</span>
          <span className="mx-1.5 text-border">·</span>
          Switch to the coding agent and start building
        </p>
        <button
          type="button"
          onClick={handleExecute}
          disabled={isSwitching}
          aria-label="Execute plan"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
        >
          <IconPlayerPlay className="size-3" aria-hidden />
          {isSwitching ? 'Switching…' : 'Execute'}
        </button>
      </div>
    </div>
  )
})
