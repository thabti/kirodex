import { useCallback, useMemo } from 'react'
import { IconTarget, IconPlayerPause, IconPlayerPlay, IconTrash, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { useGoalStore } from '@/stores/goalStore'
import type { GoalStatus } from '@/stores/goalStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'

interface GoalCardProps {
  readonly taskId: string
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; color: string; icon: typeof IconTarget }> = {
  active: { label: 'Running', color: 'text-green-400', icon: IconTarget },
  paused: { label: 'Paused', color: 'text-yellow-400', icon: IconPlayerPause },
  complete: { label: 'Complete', color: 'text-blue-400', icon: IconCheck },
  budget_limited: { label: 'Budget Limited', color: 'text-orange-400', icon: IconAlertTriangle },
}

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export const GoalCard = ({ taskId }: GoalCardProps) => {
  const goal = useGoalStore((s) => s.goals[taskId])

  const handlePause = useCallback(() => {
    useGoalStore.getState().pauseGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) {
      const workspace = task.worktreePath ?? task.workspace
      ipc.goalPause(workspace, taskId).catch(() => {})
    }
  }, [taskId])

  const handleResume = useCallback(() => {
    useGoalStore.getState().resumeGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) {
      const workspace = task.worktreePath ?? task.workspace
      ipc.goalResume(workspace, taskId).catch(() => {})
    }
  }, [taskId])

  const handleClear = useCallback(() => {
    useGoalStore.getState().clearGoal(taskId)
    const task = useTaskStore.getState().tasks[taskId]
    if (task) {
      const workspace = task.worktreePath ?? task.workspace
      ipc.goalClear(workspace, taskId).catch(() => {})
    }
  }, [taskId])

  const elapsed = useMemo(() => {
    if (!goal) return ''
    const start = new Date(goal.startedAt).getTime()
    const end = goal.completedAt ? new Date(goal.completedAt).getTime() : Date.now()
    const diffMs = end - start
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return '<1m'
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }, [goal])

  if (!goal) return null

  const { label, color, icon: StatusIcon } = STATUS_CONFIG[goal.status]
  const progress = goal.config.tokenBudget > 0
    ? Math.min(100, Math.round((goal.tokensUsed / goal.config.tokenBudget) * 100))
    : 0

  return (
    <div
      className="mx-3 mb-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
      role="status"
      aria-label={`Goal: ${goal.config.objective}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <StatusIcon size={16} className={`mt-0.5 shrink-0 ${color}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {goal.config.objective}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className={color}>{label}</span>
              <span>Iter {goal.iteration}/{goal.config.maxIterations}</span>
              <span>{formatTokens(goal.tokensUsed)}/{formatTokens(goal.config.tokenBudget)}</span>
              <span>{elapsed}</span>
              {goal.corrections.length > 0 && (
                <span className="text-yellow-500">{goal.corrections.length} corrections</span>
              )}
            </div>
            {/* Budget progress bar */}
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {goal.status === 'active' && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handlePause}
              aria-label="Pause goal"
              tabIndex={0}
            >
              <IconPlayerPause size={14} />
            </button>
          )}
          {goal.status === 'paused' && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleResume}
              aria-label="Resume goal"
              tabIndex={0}
            >
              <IconPlayerPlay size={14} />
            </button>
          )}
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={handleClear}
            aria-label="Clear goal"
            tabIndex={0}
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
