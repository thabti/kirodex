import { describe, it, expect } from 'vitest'
import {
  selectTaskShell,
  selectTaskStatus,
  selectTaskIsArchived,
  selectMessageCount,
  selectContextUsage,
  selectPendingPermission,
  selectTaskPlan,
  selectStreamingChunk,
  selectThinkingChunk,
  selectLiveToolCalls,
  selectRunningTaskCount,
  selectTaskIdsForWorkspace,
} from './task-store-selectors'
import type { TaskStore } from './task-store-types'
import type { AgentTask } from '@/types'

const makeTask = (overrides: Partial<AgentTask> = {}): AgentTask => ({
  id: 'task-1',
  name: 'Test Task',
  workspace: '/home/user/project',
  status: 'paused',
  createdAt: '2024-01-01',
  messages: [],
  ...overrides,
})

const makeState = (overrides: Partial<TaskStore> = {}): TaskStore => ({
  tasks: {},
  archivedMeta: {},
  projects: [],
  projectIds: {},
  projectNames: {},
  deletedTaskIds: new Set(),
  softDeleted: {},
  selectedTaskId: null,
  pendingWorkspace: null,
  view: 'chat',
  isNewProjectOpen: false,
  isSettingsOpen: false,
  settingsInitialSection: null,
  btwCheckpoint: null,
  streamingChunks: {},
  thinkingChunks: {},
  liveToolCalls: {},
  liveToolSplits: {},
  queuedMessages: {},
  activityFeed: [],
  connected: true,
  terminalOpenTasks: new Set(),
  isWorkspaceTerminalOpen: false,
  drafts: {},
  draftAttachments: {},
  draftPastedChunks: {},
  draftMentionedFiles: {},
  _suppressDraftSave: null,
  notifiedTaskIds: [],
  taskModes: {},
  taskModels: {},
  isForking: false,
  lastAddedProject: null,
  worktreeCleanupPending: null,
  pinnedThreadIds: [],
  splitViews: [],
  activeSplitId: null,
  pendingSplitReplace: null,
  focusedPanel: 'left',
  scrollPositions: {},
  threadOrders: {},
  ...overrides,
} as unknown as TaskStore)

describe('selectTaskShell', () => {
  it('returns null for missing task', () => {
    const state = makeState()
    expect(selectTaskShell(state, 'missing')).toBeNull()
  })

  it('returns shell data without messages', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'hi', timestamp: '' }] })
    const state = makeState({ tasks: { 'task-1': task } })
    const shell = selectTaskShell(state, 'task-1')
    expect(shell).toEqual({
      id: 'task-1',
      name: 'Test Task',
      status: 'paused',
      workspace: '/home/user/project',
      createdAt: '2024-01-01',
      isArchived: undefined,
      worktreePath: undefined,
      originalWorkspace: undefined,
      projectId: undefined,
    })
    // Verify messages are NOT included
    expect((shell as any).messages).toBeUndefined()
  })
})

describe('selectTaskStatus', () => {
  it('returns null for null taskId', () => {
    const state = makeState()
    expect(selectTaskStatus(state, null)).toBeNull()
  })

  it('returns status for existing task', () => {
    const state = makeState({ tasks: { 'task-1': makeTask({ status: 'running' }) } })
    expect(selectTaskStatus(state, 'task-1')).toBe('running')
  })
})

describe('selectTaskIsArchived', () => {
  it('returns false for null taskId', () => {
    expect(selectTaskIsArchived(makeState(), null)).toBe(false)
  })

  it('returns true for archived task', () => {
    const state = makeState({ tasks: { 'task-1': makeTask({ isArchived: true }) } })
    expect(selectTaskIsArchived(state, 'task-1')).toBe(true)
  })
})

describe('selectMessageCount', () => {
  it('returns 0 for null taskId', () => {
    expect(selectMessageCount(makeState(), null)).toBe(0)
  })

  it('returns message count', () => {
    const task = makeTask({ messages: [
      { role: 'user', content: 'a', timestamp: '' },
      { role: 'assistant', content: 'b', timestamp: '' },
    ]})
    const state = makeState({ tasks: { 'task-1': task } })
    expect(selectMessageCount(state, 'task-1')).toBe(2)
  })
})

describe('selectContextUsage', () => {
  it('returns null for null taskId', () => {
    expect(selectContextUsage(makeState(), null)).toBeNull()
  })

  it('returns context usage', () => {
    const task = makeTask({ contextUsage: { used: 50, size: 200 } })
    const state = makeState({ tasks: { 'task-1': task } })
    expect(selectContextUsage(state, 'task-1')).toEqual({ used: 50, size: 200 })
  })
})

describe('selectStreamingChunk', () => {
  it('returns empty string for null taskId', () => {
    expect(selectStreamingChunk(makeState(), null)).toBe('')
  })

  it('returns chunk for task', () => {
    const state = makeState({ streamingChunks: { 'task-1': 'hello' } })
    expect(selectStreamingChunk(state, 'task-1')).toBe('hello')
  })

  it('returns empty string when in BTW mode', () => {
    const state = makeState({
      streamingChunks: { 'task-1': 'hello' },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'q' },
    })
    expect(selectStreamingChunk(state, 'task-1')).toBe('')
  })
})

describe('selectThinkingChunk', () => {
  it('returns empty string when in BTW mode', () => {
    const state = makeState({
      thinkingChunks: { 'task-1': 'thinking...' },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'q' },
    })
    expect(selectThinkingChunk(state, 'task-1')).toBe('')
  })
})

describe('selectLiveToolCalls', () => {
  it('returns empty array when in BTW mode', () => {
    const state = makeState({
      liveToolCalls: { 'task-1': [{ toolCallId: 'tc1', title: 'Edit', status: 'in_progress' }] },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'q' },
    })
    expect(selectLiveToolCalls(state, 'task-1')).toEqual([])
  })
})

describe('selectRunningTaskCount', () => {
  it('returns 0 when no tasks', () => {
    expect(selectRunningTaskCount(makeState())).toBe(0)
  })

  it('counts running tasks', () => {
    const state = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', status: 'running' }),
        'task-2': makeTask({ id: 'task-2', status: 'paused' }),
        'task-3': makeTask({ id: 'task-3', status: 'running' }),
      },
    })
    expect(selectRunningTaskCount(state)).toBe(2)
  })
})

describe('selectTaskIdsForWorkspace', () => {
  it('returns empty array for unknown workspace', () => {
    const state = makeState()
    expect(selectTaskIdsForWorkspace(state, '/unknown')).toEqual([])
  })

  it('returns task IDs for workspace', () => {
    const state = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', workspace: '/project' }),
        'task-2': makeTask({ id: 'task-2', workspace: '/other' }),
        'task-3': makeTask({ id: 'task-3', workspace: '/project' }),
      },
    })
    const ids = selectTaskIdsForWorkspace(state, '/project')
    expect(ids).toContain('task-1')
    expect(ids).toContain('task-3')
    expect(ids).not.toContain('task-2')
  })

  it('uses originalWorkspace when available', () => {
    const state = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', workspace: '/worktree/branch', originalWorkspace: '/project' }),
      },
    })
    expect(selectTaskIdsForWorkspace(state, '/project')).toContain('task-1')
  })
})

describe('selectTaskShell — edge cases', () => {
  it('includes worktreePath and originalWorkspace when present', () => {
    const task = makeTask({
      worktreePath: '/project/.kiro/worktrees/feature',
      originalWorkspace: '/project',
      projectId: 'proj-123',
    })
    const state = makeState({ tasks: { 'task-1': task } })
    const shell = selectTaskShell(state, 'task-1')
    expect(shell?.worktreePath).toBe('/project/.kiro/worktrees/feature')
    expect(shell?.originalWorkspace).toBe('/project')
    expect(shell?.projectId).toBe('proj-123')
  })

  it('returns consistent shape regardless of messages', () => {
    const task = makeTask({
      messages: Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: `message ${i}`,
        timestamp: '2024-01-01',
      })),
    })
    const state = makeState({ tasks: { 'task-1': task } })
    const shell = selectTaskShell(state, 'task-1')
    // Shell should not contain messages
    expect(Object.keys(shell!)).not.toContain('messages')
    expect(Object.keys(shell!)).not.toContain('contextUsage')
    expect(Object.keys(shell!)).not.toContain('pendingPermission')
  })
})

describe('selectPendingPermission', () => {
  it('returns null for null taskId', () => {
    expect(selectPendingPermission(makeState(), null)).toBeNull()
  })

  it('returns null when task has no permission', () => {
    const state = makeState({ tasks: { 'task-1': makeTask() } })
    expect(selectPendingPermission(state, 'task-1')).toBeNull()
  })

  it('returns permission when present', () => {
    const perm = { requestId: 'r1', toolName: 'write_file', description: 'Write to foo.ts' }
    const task = makeTask({ pendingPermission: perm as any })
    const state = makeState({ tasks: { 'task-1': task } })
    expect(selectPendingPermission(state, 'task-1')).toEqual(perm)
  })
})

describe('selectTaskPlan', () => {
  it('returns null for null taskId', () => {
    expect(selectTaskPlan(makeState(), null)).toBeNull()
  })

  it('returns null when task has no plan', () => {
    const state = makeState({ tasks: { 'task-1': makeTask() } })
    expect(selectTaskPlan(state, 'task-1')).toBeNull()
  })

  it('returns plan when present', () => {
    const plan = [{ content: 'Step 1', status: 'pending' as const, priority: 'medium' as const }]
    const task = makeTask({ plan })
    const state = makeState({ tasks: { 'task-1': task } })
    expect(selectTaskPlan(state, 'task-1')).toBe(plan)
  })
})

describe('selectStreamingChunk — edge cases', () => {
  it('returns empty string for missing task', () => {
    const state = makeState({ streamingChunks: { 'task-1': 'hello' } })
    expect(selectStreamingChunk(state, 'task-2')).toBe('')
  })

  it('does not suppress when BTW is for different task', () => {
    const state = makeState({
      streamingChunks: { 'task-1': 'hello' },
      btwCheckpoint: { taskId: 'task-2', messages: [], question: 'q' },
    })
    expect(selectStreamingChunk(state, 'task-1')).toBe('hello')
  })
})

describe('selectLiveToolCalls — edge cases', () => {
  it('returns empty array for null taskId', () => {
    expect(selectLiveToolCalls(makeState(), null)).toEqual([])
  })

  it('returns tool calls when not in BTW mode', () => {
    const tools = [{ toolCallId: 'tc1', title: 'Edit', status: 'in_progress' as const }]
    const state = makeState({ liveToolCalls: { 'task-1': tools } })
    expect(selectLiveToolCalls(state, 'task-1')).toBe(tools)
  })
})

describe('selectTaskIdsForWorkspace — edge cases', () => {
  it('returns stable empty array reference for unknown workspace', () => {
    const state = makeState()
    const result1 = selectTaskIdsForWorkspace(state, '/unknown')
    const result2 = selectTaskIdsForWorkspace(state, '/also-unknown')
    // Both should be the same EMPTY_IDS reference
    expect(result1).toBe(result2)
  })

  it('does not include archived tasks from archivedMeta', () => {
    // archivedMeta tasks are not in state.tasks
    const state = makeState({
      tasks: { 'task-1': makeTask({ id: 'task-1', workspace: '/project' }) },
      archivedMeta: { 'task-2': { id: 'task-2', name: 'Old', workspace: '/project', createdAt: '', lastActivityAt: '', messageCount: 0 } as any },
    })
    const ids = selectTaskIdsForWorkspace(state, '/project')
    expect(ids).toContain('task-1')
    expect(ids).not.toContain('task-2')
  })

  it('returns the same array reference across re-selections with the same task set', () => {
    const state = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', workspace: '/project' }),
        'task-2': makeTask({ id: 'task-2', workspace: '/project' }),
      },
    })
    const a = selectTaskIdsForWorkspace(state, '/project')
    const b = selectTaskIdsForWorkspace(state, '/project')
    // Reference stability is what lets components avoid spurious re-renders.
    expect(a).toBe(b)
  })

  it('returns a new reference when the task set changes', () => {
    const state1 = makeState({
      tasks: { 'task-1': makeTask({ id: 'task-1', workspace: '/project' }) },
    })
    const state2 = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', workspace: '/project' }),
        'task-2': makeTask({ id: 'task-2', workspace: '/project' }),
      },
    })
    const a = selectTaskIdsForWorkspace(state1, '/project')
    const b = selectTaskIdsForWorkspace(state2, '/project')
    expect(a).not.toBe(b)
    expect(a).toEqual(['task-1'])
    expect(b).toEqual(['task-1', 'task-2'])
  })
})

describe('selectRunningTaskCount — edge cases', () => {
  it('does not count paused or completed tasks', () => {
    const state = makeState({
      tasks: {
        'task-1': makeTask({ id: 'task-1', status: 'paused' }),
        'task-2': makeTask({ id: 'task-2', status: 'completed' }),
        'task-3': makeTask({ id: 'task-3', status: 'error' }),
        'task-4': makeTask({ id: 'task-4', status: 'cancelled' }),
      },
    })
    expect(selectRunningTaskCount(state)).toBe(0)
  })
})
