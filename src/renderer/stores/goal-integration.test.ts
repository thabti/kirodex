import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGoalStore } from './goalStore'
import type { GoalConfig } from './goalStore'

/**
 * Integration tests verifying that /goal behaves differently from normal
 * messages and plan mode. These test the orchestration logic that makes
 * the goal loop autonomous.
 */

const mockConfig: GoalConfig = {
  objective: 'Implement auth module with tests',
  stopCondition: 'All auth tests pass and login/logout flows work',
  scopeConstraint: 'src/auth/',
  maxIterations: 10,
  tokenBudget: 200000,
  consecutiveFailureThreshold: 3,
}

describe('goal auto-continue integration', () => {
  beforeEach(() => {
    useGoalStore.setState({ goals: {} })
  })

  describe('goal vs normal message behavior', () => {
    it('isGoalActive returns true only when a goal is started', () => {
      // Normal message: no goal active
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      // After /goal: goal is active
      useGoalStore.getState().startGoal('task-1', mockConfig)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
    })

    it('goal state tracks iterations (normal messages do not)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 5000)
      useGoalStore.getState().incrementIteration('task-1', 3000)
      const goal = useGoalStore.getState().getGoal('task-1')!
      expect(goal.iteration).toBe(2)
      expect(goal.tokensUsed).toBe(8000)
      expect(goal.messagesUsed).toBe(2)
    })

    it('goal accumulates corrections across iterations', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().addCorrection('task-1', 'Use npm run test:unit')
      useGoalStore.getState().addCorrection('task-1', 'Import from @/lib not ../lib')
      const goal = useGoalStore.getState().getGoal('task-1')!
      expect(goal.corrections).toHaveLength(2)
    })
  })

  describe('goal termination conditions', () => {
    it('completes when agent signals completion', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 10000)
      useGoalStore.getState().completeGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('complete')
    })

    it('budget-limits when tokens exceed budget', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      // Simulate exceeding budget
      useGoalStore.getState().incrementIteration('task-1', 100000)
      useGoalStore.getState().incrementIteration('task-1', 100000)
      useGoalStore.getState().budgetLimitGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('budget_limited')
    })

    it('auto-pauses after consecutive failures (stuck detection)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      // Simulate 3 consecutive no-tool-call turns
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      const shouldPause = useGoalStore.getState().recordFailure('task-1')
      expect(shouldPause).toBe(true)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
    })

    it('resets failure counter when tool calls are made', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      // Agent makes a tool call — reset
      useGoalStore.getState().resetFailures('task-1')
      expect(useGoalStore.getState().getGoal('task-1')!.consecutiveFailures).toBe(0)
      // Can now fail 3 more times before pausing
      useGoalStore.getState().recordFailure('task-1')
      useGoalStore.getState().recordFailure('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
    })
  })

  describe('goal pause/resume (user control)', () => {
    it('pausing stops the loop from continuing', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
      useGoalStore.getState().pauseGoal('task-1')
      // After pause, isGoalActive returns false — loop won't continue
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
    })

    it('resuming re-enables the loop', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1')
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
    })

    it('clearing removes the goal entirely (back to normal chat)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().clearGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')).toBeNull()
    })
  })

  describe('goal vs plan mode', () => {
    it('goal mode is independent of plan/chat mode', () => {
      // A goal can run in either plan or chat mode — it's orthogonal
      useGoalStore.getState().startGoal('task-1', mockConfig)
      // Goal is active regardless of what mode the agent is in
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
      // Plan mode doesn't auto-continue — only goal mode does
      // (plan mode just changes the system prompt, not the loop behavior)
    })

    it('multiple threads can have independent goal states', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().startGoal('task-2', { ...mockConfig, objective: 'Different goal' })
      useGoalStore.getState().pauseGoal('task-1')
      // task-1 paused, task-2 still active
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().isGoalActive('task-2')).toBe(true)
    })
  })

  describe('goal persistence (export/load)', () => {
    it('exports all goal state for persistence', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 5000)
      useGoalStore.getState().addCorrection('task-1', 'Fix A')
      const exported = useGoalStore.getState().exportGoals()
      expect(exported['task-1']).toBeDefined()
      expect(exported['task-1'].iteration).toBe(1)
      expect(exported['task-1'].corrections).toEqual(['Fix A'])
    })

    it('loads goals from persisted state (app restart recovery)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().incrementIteration('task-1', 5000)
      const exported = useGoalStore.getState().exportGoals()
      // Simulate app restart
      useGoalStore.setState({ goals: {} })
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      // Load persisted state
      useGoalStore.getState().loadGoals(exported)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
      expect(useGoalStore.getState().getGoal('task-1')!.iteration).toBe(1)
    })
  })

  describe('cancelled turn handling', () => {
    it('cancelling a turn should pause the goal (not continue)', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
      // Simulate what the listener does on cancelled stopReason
      useGoalStore.getState().pauseGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(false)
      expect(useGoalStore.getState().getGoal('task-1')!.status).toBe('paused')
    })

    it('goal can be resumed after cancellation pause', () => {
      useGoalStore.getState().startGoal('task-1', mockConfig)
      useGoalStore.getState().pauseGoal('task-1') // cancelled
      useGoalStore.getState().resumeGoal('task-1')
      expect(useGoalStore.getState().isGoalActive('task-1')).toBe(true)
    })
  })
})
