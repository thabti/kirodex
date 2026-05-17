import { memo, useCallback } from 'react'
import { IconTarget, IconX, IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useGoalStore } from '@/stores/goalStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'

interface GoalStatusOverlayProps {
  readonly taskId: string
  readonly onClose: () => void
}

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export const GoalStatusOverlay = memo(function GoalStatusOverlay({ taskId, onClose }: GoalStatusOverlayProps) {
  const goal = useGoalStore((s) => s.goals[taskId])

  const handlePause = useCallback(() => {
    useGoalStore.getState().pauseGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) ipc.goalPause(task.worktreePath ?? task.workspace, taskId).catch(() => {})
  }, [taskId])

  const handleResume = useCallback(() => {
    useGoalStore.getState().resumeGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) ipc.goalResume(task.worktreePath ?? task.workspace, taskId).catch(() => {})
  }, [taskId])

  const handleClear = useCallback(() => {
    useGoalStore.getState().clearGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) ipc.goalClear(task.worktreePath ?? task.workspace, taskId).catch(() => {})
    onClose()
  }, [taskId, onClose])

  if (!goal) {
    return (
      <div className="mx-3 mb-2 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">No active goal in this thread.</span>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
            <IconX className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  const startMs = new Date(goal.startedAt).getTime()
  const endMs = goal.completedAt ? new Date(goal.completedAt).getTime() : Date.now()
  const mins = Math.floor((endMs - startMs) / 60000)
  const elapsed = mins < 1 ? '<1m' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  const progress = goal.config.tokenBudget > 0
    ? Math.min(100, Math.round((goal.tokensUsed / goal.config.tokenBudget) * 100))
    : 0

  return (
    <div className="mx-3 mb-2 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconTarget className="size-4 text-amber-400" />
          <span className="text-sm font-medium text-foreground">Goal Status</span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
          <IconX className="size-4" />
        </button>
      </div>

      {/* Objective */}
      <p className="mb-3 text-[13px] text-foreground">{goal.config.objective}</p>

      {/* Stats grid */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
          <p className="text-[11px] text-muted-foreground">Status</p>
          <p className="text-[13px] font-medium capitalize text-foreground">{goal.status}</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
          <p className="text-[11px] text-muted-foreground">Iteration</p>
          <p className="text-[13px] font-medium text-foreground">{goal.iteration}/{goal.config.maxIterations}</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
          <p className="text-[11px] text-muted-foreground">Tokens</p>
          <p className="text-[13px] font-medium text-foreground">{formatTokens(goal.tokensUsed)}/{formatTokens(goal.config.tokenBudget)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
          <p className="text-[11px] text-muted-foreground">Elapsed</p>
          <p className="text-[13px] font-medium text-foreground">{elapsed}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{progress}% of token budget used</p>
      </div>

      {/* Stop condition */}
      <div className="mb-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">Stop condition</p>
        <p className="text-[12px] text-foreground">{goal.config.stopCondition}</p>
      </div>

      {/* Corrections */}
      {goal.corrections.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Corrections ({goal.corrections.length})</p>
          <div className="max-h-20 space-y-0.5 overflow-y-auto">
            {goal.corrections.slice(-5).map((c, i) => (
              <p key={i} className="text-[11px] text-muted-foreground">• {c}</p>
            ))}
          </div>
        </div>
      )}

      {/* Failures warning */}
      {goal.consecutiveFailures > 0 && (
        <p className="mb-3 text-[11px] text-yellow-500">
          ⚠️ {goal.consecutiveFailures} consecutive failure{goal.consecutiveFailures > 1 ? 's' : ''} (pauses at {goal.config.consecutiveFailureThreshold})
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {goal.status === 'active' && (
          <button type="button" onClick={handlePause} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <IconPlayerPause className="size-3" /> Pause
          </button>
        )}
        {goal.status === 'paused' && (
          <button type="button" onClick={handleResume} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <IconPlayerPlay className="size-3" /> Resume
          </button>
        )}
        <button type="button" onClick={handleClear} className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10">
          <IconTrash className="size-3" /> Clear Goal
        </button>
      </div>
    </div>
  )
})
