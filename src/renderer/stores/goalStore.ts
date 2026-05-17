import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────

export type GoalStatus = 'active' | 'paused' | 'complete' | 'budget_limited'

export interface GoalConfig {
  readonly objective: string
  readonly stopCondition: string
  readonly scopeConstraint: string
  readonly maxIterations: number
  readonly tokenBudget: number
  readonly consecutiveFailureThreshold: number
}

export interface GoalState {
  readonly config: GoalConfig
  readonly status: GoalStatus
  readonly iteration: number
  readonly tokensUsed: number
  readonly messagesUsed: number
  readonly consecutiveFailures: number
  readonly startedAt: string
  readonly completedAt: string | null
  readonly corrections: readonly string[]
}

interface GoalStore {
  /** Goal state keyed by taskId. Only active/paused goals are stored. */
  goals: Record<string, GoalState>
  startGoal: (taskId: string, config: GoalConfig) => void
  pauseGoal: (taskId: string) => void
  resumeGoal: (taskId: string) => void
  clearGoal: (taskId: string) => void
  completeGoal: (taskId: string) => void
  budgetLimitGoal: (taskId: string) => void
  incrementIteration: (taskId: string, tokensUsed?: number) => void
  addCorrection: (taskId: string, correction: string) => void
  recordFailure: (taskId: string) => boolean
  resetFailures: (taskId: string) => void
  getGoal: (taskId: string) => GoalState | null
  isGoalActive: (taskId: string) => boolean
  /** Hydrate goals from persisted data (app restart). */
  loadGoals: (goals: Record<string, GoalState>) => void
  /** Export current goals for persistence. */
  exportGoals: () => Record<string, GoalState>
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: {},

  startGoal: (taskId, config) => {
    const goal: GoalState = {
      config,
      status: 'active',
      iteration: 0,
      tokensUsed: 0,
      messagesUsed: 0,
      consecutiveFailures: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      corrections: [],
    }
    set((s) => ({ goals: { ...s.goals, [taskId]: goal } }))
  },

  pauseGoal: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal || goal.status !== 'active') return
    set((s) => ({
      goals: { ...s.goals, [taskId]: { ...goal, status: 'paused' } },
    }))
  },

  resumeGoal: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal || goal.status !== 'paused') return
    set((s) => ({
      goals: { ...s.goals, [taskId]: { ...goal, status: 'active' } },
    }))
  },

  clearGoal: (taskId) => {
    const { [taskId]: _, ...rest } = get().goals
    set({ goals: rest })
  },

  completeGoal: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal) return
    set((s) => ({
      goals: {
        ...s.goals,
        [taskId]: { ...goal, status: 'complete', completedAt: new Date().toISOString() },
      },
    }))
  },

  budgetLimitGoal: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal) return
    set((s) => ({
      goals: {
        ...s.goals,
        [taskId]: { ...goal, status: 'budget_limited', completedAt: new Date().toISOString() },
      },
    }))
  },

  incrementIteration: (taskId, tokensUsed = 0) => {
    const goal = get().goals[taskId]
    if (!goal || goal.status !== 'active') return
    set((s) => ({
      goals: {
        ...s.goals,
        [taskId]: {
          ...goal,
          iteration: goal.iteration + 1,
          tokensUsed: goal.tokensUsed + tokensUsed,
          messagesUsed: goal.messagesUsed + 1,
        },
      },
    }))
  },

  addCorrection: (taskId, correction) => {
    const goal = get().goals[taskId]
    if (!goal) return
    // Avoid duplicates
    if (goal.corrections.includes(correction)) return
    set((s) => ({
      goals: {
        ...s.goals,
        [taskId]: { ...goal, corrections: [...goal.corrections, correction] },
      },
    }))
  },

  recordFailure: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal) return false
    const next = goal.consecutiveFailures + 1
    const shouldPause = next >= goal.config.consecutiveFailureThreshold
    set((s) => ({
      goals: {
        ...s.goals,
        [taskId]: {
          ...goal,
          consecutiveFailures: next,
          ...(shouldPause ? { status: 'paused' as const } : {}),
        },
      },
    }))
    return shouldPause
  },

  resetFailures: (taskId) => {
    const goal = get().goals[taskId]
    if (!goal || goal.consecutiveFailures === 0) return
    set((s) => ({
      goals: { ...s.goals, [taskId]: { ...goal, consecutiveFailures: 0 } },
    }))
  },

  getGoal: (taskId) => get().goals[taskId] ?? null,

  isGoalActive: (taskId) => {
    const goal = get().goals[taskId]
    return goal?.status === 'active'
  },

  loadGoals: (goals) => set({ goals }),

  exportGoals: () => get().goals,
}))
