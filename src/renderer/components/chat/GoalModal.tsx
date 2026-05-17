import { useState, useCallback } from 'react'
import { IconTarget, IconAlertTriangle } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGoalStore } from '@/stores/goalStore'
import type { GoalConfig } from '@/stores/goalStore'
import { ipc } from '@/lib/ipc'
import { track } from '@/lib/analytics'
import { record } from '@/lib/analytics-collector'

interface GoalModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly initialObjective?: string
}

const DEFAULT_MAX_ITERATIONS = 25
const DEFAULT_TOKEN_BUDGET = 500000
const DEFAULT_FAILURE_THRESHOLD = 3

export const GoalModal = ({ isOpen, onClose, initialObjective = '' }: GoalModalProps) => {
  const settings = useSettingsStore((s) => s.settings)
  const [objective, setObjective] = useState(initialObjective)
  const [stopCondition, setStopCondition] = useState('')
  const [scopeConstraint, setScopeConstraint] = useState('')
  const [maxIterations, setMaxIterations] = useState(settings.goalDefaultMaxIterations ?? DEFAULT_MAX_ITERATIONS)
  const [tokenBudget, setTokenBudget] = useState(settings.goalDefaultBudget ?? DEFAULT_TOKEN_BUDGET)
  const [failureThreshold, setFailureThreshold] = useState(settings.goalDefaultFailureThreshold ?? DEFAULT_FAILURE_THRESHOLD)
  const [isStarting, setIsStarting] = useState(false)

  const handleStart = useCallback(async () => {
    const { selectedTaskId, tasks } = useTaskStore.getState()
    if (!selectedTaskId || !objective.trim() || !stopCondition.trim()) return
    const task = tasks[selectedTaskId]
    if (!task) return
    setIsStarting(true)
    const config: GoalConfig = {
      objective: objective.trim(),
      stopCondition: stopCondition.trim(),
      scopeConstraint: scopeConstraint.trim(),
      maxIterations,
      tokenBudget,
      consecutiveFailureThreshold: failureThreshold,
    }
    const workspace = task.worktreePath ?? task.workspace
    try {
      const initialPrompt = await ipc.goalStart(workspace, selectedTaskId, config)
      useGoalStore.getState().startGoal(selectedTaskId, config)
      // Send the initial prompt to the agent
      useTaskStore.getState().upsertTask({ ...task, status: 'running' })
      useTaskStore.getState().clearTurn(selectedTaskId)
      await ipc.sendMessage(selectedTaskId, initialPrompt)
      track('feature_used', { feature: 'slash_command', detail: 'goal_started' })
      record('goal_started', { project: workspace.split('/').pop(), thread: selectedTaskId })
      onClose()
    } catch (err) {
      console.error('[goal] Failed to start goal:', err)
    } finally {
      setIsStarting(false)
    }
  }, [objective, stopCondition, scopeConstraint, maxIterations, tokenBudget, failureThreshold, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && e.metaKey) void handleStart()
  }, [onClose, handleStart])

  if (!isOpen) return null

  const isValid = objective.trim().length > 0 && stopCondition.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Start a goal"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="mb-4 flex items-center gap-2">
          <IconTarget size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Start a Goal</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="goal-objective" className="mb-1 block text-sm font-medium text-foreground">
              Objective
            </label>
            <textarea
              id="goal-objective"
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="What should be true when done? e.g. 'Reduce p95 latency below 120ms on the checkout benchmark while keeping tests green'"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="goal-stop" className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground">
              Stop Condition
              <IconAlertTriangle size={14} className="text-yellow-500" />
            </label>
            <textarea
              id="goal-stop"
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="What concrete evidence proves it's done? e.g. 'benchmark shows <120ms AND all tests pass'"
              value={stopCondition}
              onChange={(e) => setStopCondition(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The verification surface. Name the test, benchmark, or artifact that proves completion. Vague conditions lead to premature or missed completion.
            </p>
          </div>

          <div>
            <label htmlFor="goal-scope" className="mb-1 block text-sm font-medium text-foreground">
              Scope Constraint (optional)
            </label>
            <input
              id="goal-scope"
              type="text"
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. src/auth/ — limits what the agent may modify"
              value={scopeConstraint}
              onChange={(e) => setScopeConstraint(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="goal-iterations" className="mb-1 block text-xs text-muted-foreground">
                Max iterations
              </label>
              <input
                id="goal-iterations"
                type="number"
                min={1}
                max={100}
                className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value) || DEFAULT_MAX_ITERATIONS)}
              />
            </div>
            <div>
              <label htmlFor="goal-budget" className="mb-1 block text-xs text-muted-foreground">
                Token budget
              </label>
              <input
                id="goal-budget"
                type="number"
                min={10000}
                step={50000}
                className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={tokenBudget}
                onChange={(e) => setTokenBudget(Number(e.target.value) || DEFAULT_TOKEN_BUDGET)}
              />
            </div>
            <div>
              <label htmlFor="goal-failures" className="mb-1 block text-xs text-muted-foreground">
                Failure threshold
              </label>
              <input
                id="goal-failures"
                type="number"
                min={1}
                max={10}
                className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(Number(e.target.value) || DEFAULT_FAILURE_THRESHOLD)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Tip: commit your work before starting a goal so you can revert if needed.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={!isValid || isStarting}
            onClick={() => void handleStart()}
            aria-label="Start goal"
          >
            {isStarting ? 'Starting…' : 'Start Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
