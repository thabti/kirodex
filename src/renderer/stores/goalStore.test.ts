import { describe, it, expect, beforeEach } from 'vitest'
import { useGoalStore } from './goalStore'
import type { GoalConfig } from './goalStore'

const mockConfig: GoalConfig = {
  objective: 'Implement authentication module',
  stopCondition: 'All auth tests pass and login/logout flows work end-to-end',
  scopeConstraint: 'src/auth/',
  maxIterations: 10,
  tokenBudget: 200000,
  consecutiveFailureThreshold: 3,
}

describe('goalStore', () => {
  beforeEach(() => {
    useGoalStore.setState({ goals: {} })
  })

  describe('startGoal', () => {
    it('creates a goal with active status and zero counters', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal).not.toBeNull()
      expect(goal!.status).toBe('active')
      expect(goal!.iteration).toBe(0)
      expect(goal!.tokensUsed).toBe(0)
      expect(goal!.messagesUsed).toBe(0)
      expect(goal!.consecutiveFailures).toBe(0)
      expect(goal!.completedAt).toBeNull()
      expect(goal!.corrections).toEqual([])
      expect(goal!.config).toEqual(mockConfig)
    })

    it('overwrites an existing goal for the same taskId', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 1000)
      const newConfig = { ...mockConfig, objective: 'New objective' }
      useGoalStore.getState().startGoal('task-1', newConfig)
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.iteration).toBe(0)
      expect(goal!.config.objective).toBe('New objective')
    })
  })

  describe('pauseGoal', () => {
    it('transitions active goal to paused', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
    })

    it('no-ops for non-active goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      useGoalStore.getState().pauseGoal('task-1') // already paused
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
    })

    it('no-ops for non-existent goals', () => {
      useGoalStore.getState().pauseGoal('nonexistent')
      expect(useGoalStore.getState().getGoal('nonexistent')).toBeNull()
    })
  })

  describe('resumeGoal', () => {
    it('transitions paused goal to active', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('active')
    })

    it('no-ops for active goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('active')
    })
  })

  describe('clearGoal', () => {
    it('removes the goal entirely', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().clearGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')).toBeNull()
    })

    it('does not affect other goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().startGoal('task-2', mockConfig)
      useGoalStore.getState().clearGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-2')).not.toBeNull()
    })
  })

  describe('completeGoal', () => {
    it('sets status to complete with timestamp', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.status).toBe('complete')
      expect(goal!.completedAt).not.toBeNull()
    })
  })

  describe('budgetLimitGoal', () => {
    it('sets status to budget_limited with timestamp', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-1')
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.status).toBe('budget_limited')
      expect(goal!.completedAt).not.toBeNull()
    })
  })

  describe('incrementIteration', () => {
    it('increments iteration, tokens, and messages', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 5000)
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.iteration).toBe(1)
      expect(goal!.tokensUsed).toBe(5000)
      expect(goal!.messagesUsed).toBe(1)
    })

    it('accumulates across multiple increments', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 3000)
      useGoalStore.getState().incrementIteration('task-1', 2000)
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.iteration).toBe(2)
      expect(goal!.tokensUsed).toBe(5000)
      expect(goal!.messagesUsed).toBe(2)
    })

    it('no-ops for paused goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      useGoalStore.getState().incrementIteration('task-1', 1000)
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(0)
    })
  })

  describe('addCorrection', () => {
    it('appends a correction', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().addCorrection('task-1', 'Use npm run test:unit not npm test')
      expect(useGoalStore.getState().getGoal('task-1')!.corrections).toEqual([
        'Use npm run test:unit not npm test',
      ])
    })

    it('deduplicates corrections', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().addCorrection('task-1', 'Fix A')
      useGoalStore.getState().addCorrection('task-1', 'Fix A')
      expect(useGoalStore.getState().getGoal('task-1')!.corrections).toHaveLength(1)
    })
  })

  describe('recordFailure / resetFailures', () => {
    it('increments consecutive failures', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      const shouldPause = useGoalStore.getState().recordFailure('task-1')
      expect(shouldPause).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')!.consecutiveFailures).toBe(1)
    })

    it('auto-pauses at threshold', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      const shouldPause = useGoalStore.getState().recordFailure('task-1')
      expect(shouldPause).toBe(true)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
    })

    it('resetFailures clears the counter', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().resetFailures('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.consecutiveFailures).toBe(0)
    })

    it('resetFailures no-ops when already zero', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      const before = useGoalStore.getState().goals
      useGoalStore.getState().resetFailures('task-1')
      // Should be same reference (bail-out guard)
      expect(useGoalStore.getState().goals).toBe(before)
    })
  })

  describe('isGoalActive', () => {
    it('returns true for active goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
    })

    it('returns false for paused goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
    })

    it('returns false for non-existent goals', () => {
      expect(useGoalStore.getState().isGoalActive('nope')).toBe(false)
    })
  })

  describe('loadGoals / exportGoals', () => {
    it('round-trips goal state', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 1000)
      const exported = useGoalStore.getState().exportGoals()
      useGoalStore.setState({ goals: {} })
      useGoalStore.getState().loadGoals(exported)
      const goal = useGoalStore.getState().getGoal('task-1')
      expect(goal!.iteration).toBe(1)
      expect(goal!.tokensUsed).toBe(1000)
    })
  })

  describe('memory: multiple goals do not leak', () => {
    it('clearing goals frees memory', () => {
      for (let i = 0; i < 100; i++) {
        useGoalStore.getState().startGoal(`task-${i}`, mockConfig)
      }
      expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(100)
      for (let i = 0; i < 100; i++) {
        useGoalStore.getState().clearGoal(`task-${i}`)
      }
      expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0)
    })
  })

  describe('performance: bail-out guards prevent unnecessary state updates', () => {
    it('pauseGoal on non-existent does not create new state object', () => {
      const before = useGoalStore.getState().goals
      useGoalStore.getState().pauseGoal('nonexistent')
      expect(useGoalStore.getState().goals).toBe(before)
    })

    it('resumeGoal on active does not create new state object', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      const before = useGoalStore.getState().goals
      useGoalStore.getState().resumeGoal('task-1') // already active
      expect(useGoalStore.getState().goals).toBe(before)
    })
  })

  describe('status transition validation', () => {
    it('cannot pause a completed goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('complete')
    })

    it('cannot pause a budget_limited goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-1')
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
    })

    it('cannot resume an active goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('active')
    })

    it('cannot resume a completed goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('complete')
    })

    it('cannot resume a budget_limited goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-1')
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
    })

    it('cannot increment iteration on a completed goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      useGoalStore.getState().incrementIteration('task-1', 5000)
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(0)
    })

    it('cannot increment iteration on a budget_limited goal', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-1')
      useGoalStore.getState().incrementIteration('task-1', 5000)
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(0)
    })

    it('recordFailure auto-pauses and prevents further increments', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1') // threshold = 3
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
      // After auto-pause, incrementIteration should no-op
      useGoalStore.getState().incrementIteration('task-1', 1000)
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(0)
    })

    it('full lifecycle: active → paused → active → complete', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('active')
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('active')
      useGoalStore.getState().incrementIteration('task-1', 10000)
      useGoalStore.getState().completeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('complete')
      expect(useGoalStore.getState().getGoal('task-1')!.completedAt).not.toBeNull()
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(1)
    })

    it('full lifecycle: active → budget_limited (terminal)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 100000)
      useGoalStore.getState().incrementIteration('task-1', 100000)
      useGoalStore.getState().budgetLimitGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
      // Terminal state: cannot resume or pause
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
    })

    it('isGoalActive returns false for completed goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
    })

    it('isGoalActive returns false for budget_limited goals', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
    })

    it('clearGoal works from any status', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      useGoalStore.getState().clearGoal('task-1')
      expect(useGoalStore.getState().getGoal('task-1')).toBeNull()

      useGoalStore.getState().startGoal('task-2', mockConfig)
      useGoalStore.getState().budgetLimitGoal('task-2')
      useGoalStore.getState().clearGoal('task-2')
      expect(useGoalStore.getState().getGoal('task-2')).toBeNull()

      useGoalStore.getState().startGoal('task-3', mockConfig)
      useGoalStore.getState().pauseGoal('task-3')
      useGoalStore.getState().clearGoal('task-3')
      expect(useGoalStore.getState().getGoal('task-3')).toBeNull()
    })

    it('addCorrection works on any non-null goal regardless of status', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().completeGoal('task-1')
      useGoalStore.getState().addCorrection('task-1', 'Late correction')
      expect(useGoalStore.getState().getGoal('task-1')!.corrections).toEqual(['Late correction'])
    })
  })
})
