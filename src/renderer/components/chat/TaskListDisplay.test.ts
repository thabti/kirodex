import { describe, it, expect } from 'vitest'
import { aggregateLatestTasks, isTaskListToolCall } from './TaskListDisplay'
import type { ToolCall } from '@/types'

const makeToolCall = (overrides?: Partial<ToolCall>): ToolCall => ({
  toolCallId: 'tc-1',
  title: 'todo_list',
  status: 'completed',
  ...overrides,
})

describe('isTaskListToolCall', () => {
  it('returns true for create command', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: { command: 'create' } }))).toBe(true)
  })

  it('returns true for complete command', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: { command: 'complete' } }))).toBe(true)
  })

  it('returns true for add command', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: { command: 'add' } }))).toBe(true)
  })

  it('returns true for list command', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: { command: 'list' } }))).toBe(true)
  })

  it('returns false for unknown command', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: { command: 'remove' } }))).toBe(false)
  })

  it('returns false when rawInput is missing', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: undefined }))).toBe(false)
  })

  it('returns false when rawInput is not an object', () => {
    expect(isTaskListToolCall(makeToolCall({ rawInput: 'string' }))).toBe(false)
  })
})

describe('aggregateLatestTasks', () => {
  it('returns empty tasks for no tool calls', () => {
    const result = aggregateLatestTasks([])
    expect(result.tasks).toEqual([])
    expect(result.description).toBeNull()
  })

  it('extracts tasks from direct shape', () => {
    const tc = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [
          { id: '1', completed: false, task_description: 'Do thing' },
          { id: '2', completed: true, task_description: 'Done thing' },
        ],
      },
    })
    const result = aggregateLatestTasks([tc])
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].task_description).toBe('Do thing')
    expect(result.tasks[1].completed).toBe(true)
  })

  it('extracts tasks from nested items shape', () => {
    const tc = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        items: [{ Json: { tasks: [{ id: '1', completed: false, task_description: 'Nested task' }] } }],
      },
    })
    const result = aggregateLatestTasks([tc])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].task_description).toBe('Nested task')
  })

  it('extracts description from rawOutput', () => {
    const tc = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        description: 'Build the feature',
        tasks: [{ id: '1', completed: false, task_description: 'Step 1' }],
      },
    })
    const result = aggregateLatestTasks([tc])
    expect(result.description).toBe('Build the feature')
  })

  it('later tool calls override earlier tasks by id', () => {
    const tc1 = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [
          { id: '1', completed: false, task_description: 'Original' },
        ],
      },
    })
    const tc2 = makeToolCall({
      rawInput: { command: 'add' },
      rawOutput: {
        tasks: [
          { id: '1', completed: true, task_description: 'Updated' },
        ],
      },
    })
    const result = aggregateLatestTasks([tc1, tc2])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].task_description).toBe('Updated')
    expect(result.tasks[0].completed).toBe(true)
  })

  it('handles complete commands with completed_task_ids in rawOutput', () => {
    const tc1 = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [
          { id: '1', completed: false, task_description: 'Task A' },
          { id: '2', completed: false, task_description: 'Task B' },
        ],
      },
    })
    const tc2 = makeToolCall({
      rawInput: { command: 'complete' },
      rawOutput: { completed_task_ids: ['1'] },
    })
    const result = aggregateLatestTasks([tc1, tc2])
    expect(result.tasks[0].completed).toBe(true)
    expect(result.tasks[1].completed).toBe(false)
  })

  it('handles complete commands with completed_task_ids in rawInput', () => {
    const tc1 = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [{ id: '1', completed: false, task_description: 'Task A' }],
      },
    })
    const tc2 = makeToolCall({
      rawInput: { command: 'complete', completed_task_ids: ['1'] },
      rawOutput: {},
    })
    const result = aggregateLatestTasks([tc1, tc2])
    expect(result.tasks[0].completed).toBe(true)
  })

  it('skips non-task-list tool calls', () => {
    const tc = makeToolCall({
      rawInput: { command: 'remove' },
      rawOutput: { tasks: [{ id: '1', completed: false, task_description: 'Ignored' }] },
    })
    const result = aggregateLatestTasks([tc])
    expect(result.tasks).toEqual([])
  })

  it('ignores empty tasks array and falls through to completed_task_ids (0.8.13 fix)', () => {
    const tc1 = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [
          { id: '1', completed: false, task_description: 'Task A' },
          { id: '2', completed: false, task_description: 'Task B' },
        ],
      },
    })
    const tc2 = makeToolCall({
      rawInput: { command: 'complete', completed_task_ids: ['1'] },
      rawOutput: { tasks: [], completed_task_ids: ['1'] },
    })
    const result = aggregateLatestTasks([tc1, tc2])
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].completed).toBe(true)
    expect(result.tasks[1].completed).toBe(false)
  })

  it('does not wipe existing tasks when rawOutput has empty tasks array', () => {
    const tc1 = makeToolCall({
      rawInput: { command: 'create' },
      rawOutput: {
        tasks: [
          { id: '1', completed: false, task_description: 'Keep me' },
        ],
      },
    })
    const tc2 = makeToolCall({
      rawInput: { command: 'complete' },
      rawOutput: { tasks: [] },
    })
    const result = aggregateLatestTasks([tc1, tc2])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].task_description).toBe('Keep me')
  })
})
