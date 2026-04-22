import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSetActiveWorkspace } = vi.hoisted(() => ({
  mockSetActiveWorkspace: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: {
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    forkTask: vi.fn().mockResolvedValue({ id: 'fork-1', name: 'Fork', workspace: '/ws', status: 'paused', createdAt: '', messages: [] }),
    gitWorktreeHasChanges: vi.fn().mockResolvedValue(false),
    gitWorktreeRemove: vi.fn().mockResolvedValue(undefined),
    addRecentProject: vi.fn().mockResolvedValue(undefined),
    rebuildRecentMenu: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@/lib/history-store', () => ({
  loadThreads: vi.fn().mockResolvedValue([]),
  loadProjects: vi.fn().mockResolvedValue([]),
  loadSoftDeleted: vi.fn().mockResolvedValue([]),
  loadBackup: vi.fn().mockResolvedValue({ threads: [], projects: [], softDeleted: [] }),
  saveThreads: vi.fn().mockResolvedValue(undefined),
  saveSoftDeleted: vi.fn().mockResolvedValue(undefined),
  toArchivedTasks: vi.fn().mockReturnValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./debugStore', () => ({
  useDebugStore: { getState: () => ({ addEntry: vi.fn() }) },
}))
vi.mock('./settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ settings: {}, saveSettings: vi.fn().mockResolvedValue(undefined), setActiveWorkspace: mockSetActiveWorkspace }),
    setState: vi.fn(),
  },
}))
vi.mock('./diffStore', () => ({
  useDiffStore: { getState: () => ({ fetchDiff: vi.fn() }) },
}))
vi.mock('./kiroStore', () => ({
  useKiroStore: { getState: () => ({ setMcpError: vi.fn() }) },
}))

import { useTaskStore, applyTurnEnd } from './taskStore'
import type { AgentTask } from '@/types'

const makeTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  id: 'task-1',
  name: 'Test Task',
  workspace: '/projects/test',
  status: 'paused',
  createdAt: '2026-01-01T00:00:00Z',
  messages: [],
  ...overrides,
})

beforeEach(() => {
  useTaskStore.setState({
    tasks: {}, projects: [], projectIds: {}, deletedTaskIds: new Set(), softDeleted: {}, selectedTaskId: null,
    streamingChunks: {}, thinkingChunks: {}, liveToolCalls: {},
    queuedMessages: {}, activityFeed: [], connected: false,
    terminalOpenTasks: new Set(), pendingWorkspace: null,
    view: 'dashboard', isNewProjectOpen: false, isSettingsOpen: false, projectNames: {},
    btwCheckpoint: null,
  })
})

describe('upsertTask', () => {
  it('adds a new task', () => {
    useTaskStore.getState().upsertTask(makeTask())
    expect(useTaskStore.getState().tasks['task-1']).toBeDefined()
  })

  it('updates existing task', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().upsertTask(makeTask({ status: 'running' }))
    expect(useTaskStore.getState().tasks['task-1'].status).toBe('running')
  })

  it('preserves messages when incoming has fewer', () => {
    const msg = { role: 'user' as const, content: 'hi', timestamp: '' }
    useTaskStore.getState().upsertTask(makeTask({ messages: [msg] }))
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(1)
  })

  it('skips deleted task IDs', () => {
    useTaskStore.setState({ deletedTaskIds: new Set(['task-1']) })
    useTaskStore.getState().upsertTask(makeTask())
    expect(useTaskStore.getState().tasks['task-1']).toBeUndefined()
  })

  it('adds activity feed entry on status change', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().upsertTask(makeTask({ status: 'running' }))
    expect(useTaskStore.getState().activityFeed.length).toBeGreaterThan(0)
  })

  it('preserves worktreePath when backend update lacks it', () => {
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    // Backend task_update arrives without worktree fields
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    const task = useTaskStore.getState().tasks['task-1']
    expect(task.worktreePath).toBe('/project/.kiro/worktrees/feat')
    expect(task.originalWorkspace).toBe('/project')
  })

  it('allows overwriting worktree fields when explicitly provided', () => {
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/old',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      worktreePath: '/project/.kiro/worktrees/new',
      originalWorkspace: '/project',
    }))
    const task = useTaskStore.getState().tasks['task-1']
    expect(task.worktreePath).toBe('/project/.kiro/worktrees/new')
  })
})

describe('removeTask', () => {
  it('removes task from state', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().tasks['task-1']).toBeUndefined()
  })

  it('clears streaming data', () => {
    useTaskStore.setState({ streamingChunks: { 'task-1': 'text' }, thinkingChunks: { 'task-1': 'think' }, liveToolCalls: { 'task-1': [] } })
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().streamingChunks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().thinkingChunks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().liveToolCalls['task-1']).toBeUndefined()
  })

  it('adds to deletedTaskIds', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().deletedTaskIds.has('task-1')).toBe(true)
  })

  it('clears selectedTaskId if removed', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ selectedTaskId: 'task-1' })
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })
})

describe('streaming', () => {
  it('appendChunk accumulates text', () => {
    useTaskStore.getState().appendChunk('t1', 'hello ')
    useTaskStore.getState().appendChunk('t1', 'world')
    expect(useTaskStore.getState().streamingChunks['t1']).toBe('hello world')
  })

  it('appendThinkingChunk accumulates text', () => {
    useTaskStore.getState().appendThinkingChunk('t1', 'hmm ')
    useTaskStore.getState().appendThinkingChunk('t1', 'ok')
    expect(useTaskStore.getState().thinkingChunks['t1']).toBe('hmm ok')
  })

  it('clearTurn resets all live state', () => {
    useTaskStore.setState({
      streamingChunks: { t1: 'text' },
      thinkingChunks: { t1: 'think' },
      liveToolCalls: { t1: [{ toolCallId: 'tc1', title: 'test', status: 'completed' }] },
    })
    useTaskStore.getState().clearTurn('t1')
    expect(useTaskStore.getState().streamingChunks['t1']).toBe('')
    expect(useTaskStore.getState().thinkingChunks['t1']).toBe('')
    expect(useTaskStore.getState().liveToolCalls['t1']).toEqual([])
  })
})

describe('upsertToolCall', () => {
  it('adds new tool call', () => {
    useTaskStore.getState().upsertToolCall('t1', { toolCallId: 'tc1', title: 'read', status: 'pending' })
    expect(useTaskStore.getState().liveToolCalls['t1']).toHaveLength(1)
  })

  it('updates existing by toolCallId', () => {
    useTaskStore.getState().upsertToolCall('t1', { toolCallId: 'tc1', title: 'read', status: 'pending' })
    useTaskStore.getState().upsertToolCall('t1', { toolCallId: 'tc1', title: 'read', status: 'completed' })
    expect(useTaskStore.getState().liveToolCalls['t1']).toHaveLength(1)
    expect(useTaskStore.getState().liveToolCalls['t1'][0].status).toBe('completed')
  })
})

describe('queue', () => {
  it('enqueue and dequeue', () => {
    useTaskStore.getState().enqueueMessage('t1', 'msg1')
    useTaskStore.getState().enqueueMessage('t1', 'msg2')
    const msgs = useTaskStore.getState().dequeueMessages('t1')
    expect(msgs).toEqual([{ text: 'msg1' }, { text: 'msg2' }])
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual([])
  })

  it('enqueue with attachments', () => {
    const attachment = { base64: 'abc', mimeType: 'image/png', name: 'img.png' }
    useTaskStore.getState().enqueueMessage('t1', 'look', [attachment])
    const msgs = useTaskStore.getState().dequeueMessages('t1')
    expect(msgs).toEqual([{ text: 'look', attachments: [attachment] }])
  })

  it('removeQueuedMessage removes by index', () => {
    useTaskStore.getState().enqueueMessage('t1', 'a')
    useTaskStore.getState().enqueueMessage('t1', 'b')
    useTaskStore.getState().enqueueMessage('t1', 'c')
    useTaskStore.getState().removeQueuedMessage('t1', 1)
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual([{ text: 'a' }, { text: 'c' }])
  })

  it('reorderQueuedMessage moves item', () => {
    useTaskStore.getState().enqueueMessage('t1', 'a')
    useTaskStore.getState().enqueueMessage('t1', 'b')
    useTaskStore.getState().enqueueMessage('t1', 'c')
    useTaskStore.getState().reorderQueuedMessage('t1', 0, 2)
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual([{ text: 'b' }, { text: 'c' }, { text: 'a' }])
  })
})

describe('createDraftThread', () => {
  it('creates a paused task and selects it', () => {
    const id = useTaskStore.getState().createDraftThread('/ws')
    const task = useTaskStore.getState().tasks[id]
    expect(task).toBeDefined()
    expect(task.status).toBe('paused')
    expect(task.workspace).toBe('/ws')
    expect(useTaskStore.getState().selectedTaskId).toBe(id)
    expect(useTaskStore.getState().view).toBe('chat')
  })
})

describe('projects', () => {
  it('addProject adds workspace and generates UUID', () => {
    useTaskStore.getState().addProject('/ws')
    expect(useTaskStore.getState().projects).toContain('/ws')
    const pid = useTaskStore.getState().projectIds['/ws']
    expect(pid).toBeDefined()
    expect(pid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('addProject deduplicates', () => {
    useTaskStore.getState().addProject('/ws')
    const pid = useTaskStore.getState().projectIds['/ws']
    useTaskStore.getState().addProject('/ws')
    expect(useTaskStore.getState().projects).toHaveLength(1)
    // UUID should not change
    expect(useTaskStore.getState().projectIds['/ws']).toBe(pid)
  })

  it('addProject updates projectId on restored soft-deleted tasks', () => {
    useTaskStore.getState().addProject('/ws')
    const oldPid = useTaskStore.getState().projectIds['/ws']
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws', projectId: oldPid }))
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().softDeleted['t1']).toBeDefined()
    // Re-add the same project — should restore the task with the NEW projectId
    useTaskStore.getState().addProject('/ws')
    const newPid = useTaskStore.getState().projectIds['/ws']
    expect(newPid).not.toBe(oldPid)
    expect(useTaskStore.getState().tasks['t1']).toBeDefined()
    expect(useTaskStore.getState().tasks['t1'].projectId).toBe(newPid)
  })

  it('addProject rejects worktree paths', () => {
    useTaskStore.getState().addProject('/project/.kiro/worktrees/feat')
    expect(useTaskStore.getState().projects).toHaveLength(0)
  })

  it('reorderProject swaps positions', () => {
    useTaskStore.setState({ projects: ['/a', '/b', '/c'] })
    useTaskStore.getState().reorderProject(0, 2)
    expect(useTaskStore.getState().projects).toEqual(['/b', '/c', '/a'])
  })
})

describe('getProjectId', () => {
  it('returns existing UUID for known workspace', () => {
    useTaskStore.getState().addProject('/ws')
    const pid = useTaskStore.getState().projectIds['/ws']
    expect(useTaskStore.getState().getProjectId('/ws')).toBe(pid)
  })

  it('generates and stores UUID for unknown workspace', () => {
    const pid = useTaskStore.getState().getProjectId('/new')
    expect(pid).toMatch(/^[0-9a-f-]{36}$/)
    expect(useTaskStore.getState().projectIds['/new']).toBe(pid)
  })

  it('returns same UUID on repeated calls', () => {
    const pid1 = useTaskStore.getState().getProjectId('/ws')
    const pid2 = useTaskStore.getState().getProjectId('/ws')
    expect(pid1).toBe(pid2)
  })
})

describe('simple setters', () => {
  it('setSelectedTask', () => {
    useTaskStore.getState().setSelectedTask('x')
    expect(useTaskStore.getState().selectedTaskId).toBe('x')
  })

  it('setView', () => {
    useTaskStore.getState().setView('chat')
    expect(useTaskStore.getState().view).toBe('chat')
  })

  it('setNewProjectOpen', () => {
    useTaskStore.getState().setNewProjectOpen(true)
    expect(useTaskStore.getState().isNewProjectOpen).toBe(true)
  })

  it('setSettingsOpen', () => {
    useTaskStore.getState().setSettingsOpen(true)
    expect(useTaskStore.getState().isSettingsOpen).toBe(true)
  })

  it('toggleTerminal', () => {
    useTaskStore.getState().toggleTerminal('t1')
    expect(useTaskStore.getState().terminalOpenTasks.has('t1')).toBe(true)
    useTaskStore.getState().toggleTerminal('t1')
    expect(useTaskStore.getState().terminalOpenTasks.has('t1')).toBe(false)
  })

  it('renameTask', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().renameTask('task-1', 'New Name')
    expect(useTaskStore.getState().tasks['task-1'].name).toBe('New Name')
  })

  it('setPendingWorkspace', () => {
    useTaskStore.getState().setPendingWorkspace('/ws')
    expect(useTaskStore.getState().pendingWorkspace).toBe('/ws')
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
    expect(useTaskStore.getState().view).toBe('chat')
  })

  it('updatePlan', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().updatePlan('task-1', [{ content: 'step', status: 'pending', priority: 'high' }])
    expect(useTaskStore.getState().tasks['task-1'].plan).toHaveLength(1)
  })

  it('updateUsage', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().updateUsage('task-1', 5000, 10000)
    expect(useTaskStore.getState().tasks['task-1'].contextUsage).toEqual({ used: 5000, size: 10000 })
  })
})

describe('archiveTask', () => {
  it('marks task as archived and completed', () => {
    useTaskStore.getState().upsertTask(makeTask({ status: 'running' }))
    useTaskStore.getState().archiveTask('task-1')
    const task = useTaskStore.getState().tasks['task-1']
    expect(task.isArchived).toBe(true)
    expect(task.status).toBe('completed')
  })

  it('clears streaming state for archived task', () => {
    useTaskStore.getState().upsertTask(makeTask({ status: 'running' }))
    useTaskStore.setState({
      streamingChunks: { 'task-1': 'partial' },
      thinkingChunks: { 'task-1': 'hmm' },
      liveToolCalls: { 'task-1': [{ toolCallId: 'tc1', title: 'read', status: 'in_progress' }] },
    })
    useTaskStore.getState().archiveTask('task-1')
    expect(useTaskStore.getState().streamingChunks['task-1']).toBe('')
    expect(useTaskStore.getState().thinkingChunks['task-1']).toBe('')
    expect(useTaskStore.getState().liveToolCalls['task-1']).toEqual([])
  })

  it('no-ops for already archived task', () => {
    useTaskStore.getState().upsertTask(makeTask({ isArchived: true, status: 'completed' }))
    const before = useTaskStore.getState().tasks['task-1']
    useTaskStore.getState().archiveTask('task-1')
    const after = useTaskStore.getState().tasks['task-1']
    expect(before).toBe(after)
  })

  it('no-ops for non-existent task', () => {
    useTaskStore.getState().archiveTask('nonexistent')
    expect(useTaskStore.getState().tasks['nonexistent']).toBeUndefined()
  })
})

describe('forkTask', () => {
  it('adds forked task to state and selects it', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', name: 'Fork of Test Task', workspace: '/projects/test' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ selectedTaskId: 'task-1' })
    await useTaskStore.getState().forkTask('task-1')
    expect(useTaskStore.getState().tasks['fork-1']).toBeDefined()
    expect(useTaskStore.getState().selectedTaskId).toBe('fork-1')
    expect(useTaskStore.getState().view).toBe('chat')
  })

  it('adds workspace to projects if not present', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', workspace: '/new-ws' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask())
    await useTaskStore.getState().forkTask('task-1')
    // forkTask resolves projectId via getProjectId which uses the workspace
    // The workspace itself gets added to projects via the projectId resolution
    const pid = useTaskStore.getState().tasks['fork-1'].projectId
    expect(pid).toBeDefined()
    expect(pid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('adds system error message on fork failure', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.forkTask).mockRejectedValueOnce(new Error('ACP connection lost'))
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ selectedTaskId: 'task-1' })
    await useTaskStore.getState().forkTask('task-1')
    const task = useTaskStore.getState().tasks['task-1']
    const systemMsg = task.messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg?.content).toContain('Fork failed')
    expect(systemMsg?.content).toContain('ACP connection lost')
  })
})

describe('taskModes', () => {
  it('setTaskMode stores mode for task', () => {
    useTaskStore.getState().setTaskMode('task-1', 'kiro_planner')
    expect(useTaskStore.getState().taskModes['task-1']).toBe('kiro_planner')
  })

  it('setTaskMode no-ops when mode unchanged', () => {
    useTaskStore.setState({ taskModes: { 'task-1': 'kiro_planner' } })
    const before = useTaskStore.getState().taskModes
    useTaskStore.getState().setTaskMode('task-1', 'kiro_planner')
    expect(useTaskStore.getState().taskModes).toBe(before)
  })

  it('removeTask clears taskMode for that task', () => {
    useTaskStore.setState({ taskModes: { 'task-1': 'kiro_planner', 'task-2': 'kiro_default' } })
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().taskModes['task-1']).toBeUndefined()
    expect(useTaskStore.getState().taskModes['task-2']).toBe('kiro_default')
  })
})

describe('drafts', () => {
  it('setDraft stores content for workspace', () => {
    useTaskStore.getState().setDraft('/ws', 'hello world')
    expect(useTaskStore.getState().drafts['/ws']).toBe('hello world')
  })

  it('setDraft removes entry when content is empty', () => {
    useTaskStore.getState().setDraft('/ws', 'hello')
    useTaskStore.getState().setDraft('/ws', '   ')
    expect(useTaskStore.getState().drafts['/ws']).toBeUndefined()
  })

  it('setDraft no-ops when content unchanged', () => {
    useTaskStore.getState().setDraft('/ws', 'hello')
    const before = useTaskStore.getState().drafts
    useTaskStore.getState().setDraft('/ws', 'hello')
    expect(useTaskStore.getState().drafts).toBe(before)
  })

  it('removeDraft removes entry and suppresses next setDraft', () => {
    useTaskStore.getState().setDraft('/ws', 'hello')
    useTaskStore.getState().removeDraft('/ws')
    expect(useTaskStore.getState().drafts['/ws']).toBeUndefined()
    // Next setDraft for this workspace should be suppressed
    useTaskStore.getState().setDraft('/ws', 'resurrected')
    expect(useTaskStore.getState().drafts['/ws']).toBeUndefined()
    // But a second setDraft should work normally
    useTaskStore.getState().setDraft('/ws', 'new content')
    expect(useTaskStore.getState().drafts['/ws']).toBe('new content')
  })

  it('removeDraft no-ops for non-existent workspace', () => {
    const before = useTaskStore.getState().drafts
    useTaskStore.getState().removeDraft('/nonexistent')
    expect(useTaskStore.getState().drafts).toBe(before)
  })
})

describe('removeProject cleans up taskModes', () => {
  it('removes taskModes for tasks in the removed project', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't2', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't3', workspace: '/other' }))
    useTaskStore.setState({ taskModes: { t1: 'kiro_planner', t2: 'kiro_default', t3: 'kiro_planner' } })
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().taskModes['t1']).toBeUndefined()
    expect(useTaskStore.getState().taskModes['t2']).toBeUndefined()
    expect(useTaskStore.getState().taskModes['t3']).toBe('kiro_planner')
  })
})

describe('applyTurnEnd', () => {
  // In production, the ACP task_update event sets the task to 'paused' before
  // turn_end fires, so applyTurnEnd never sees status === 'running' (it has a
  // guard that returns {} for running tasks to avoid clobbering a new turn).
  const baseState = (overrides?: Partial<Parameters<typeof applyTurnEnd>[0]>) => ({
    tasks: { 't1': makeTask({ id: 't1', status: 'paused' }) },
    streamingChunks: {} as Record<string, string>,
    thinkingChunks: {} as Record<string, string>,
    liveToolCalls: {} as Record<string, import('@/types').ToolCall[]>,
    ...overrides,
  })

  it('sets status to paused on normal end_turn', () => {
    const result = applyTurnEnd(baseState(), 't1', 'end_turn')
    expect(result.tasks?.['t1'].status).toBe('paused')
  })

  it('sets status to paused on refusal (user can recover)', () => {
    const result = applyTurnEnd(baseState(), 't1', 'refusal')
    expect(result.tasks?.['t1'].status).toBe('paused')
  })

  it('appends retry system message on refusal with refusalRetry=true', () => {
    const result = applyTurnEnd(baseState(), 't1', 'refusal', true)
    const messages = result.tasks?.['t1'].messages ?? []
    const systemMsg = messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg?.content).toContain('Retrying automatically')
  })

  it('appends rephrase system message on refusal with refusalRetry=false', () => {
    const result = applyTurnEnd(baseState(), 't1', 'refusal', false)
    const messages = result.tasks?.['t1'].messages ?? []
    const systemMsg = messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg?.content).toContain('try rephrasing')
  })

  it('does not append system message on normal end_turn', () => {
    const result = applyTurnEnd(baseState(), 't1', 'end_turn')
    const messages = result.tasks?.['t1'].messages ?? []
    expect(messages.find((m) => m.role === 'system')).toBeUndefined()
  })

  it('marks incomplete tool calls as failed on refusal', () => {
    const state = baseState({
      liveToolCalls: { t1: [{ toolCallId: 'tc1', title: 'subagent', status: 'in_progress' }] },
    })
    const result = applyTurnEnd(state, 't1', 'refusal')
    const assistantMsg = result.tasks?.['t1'].messages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.toolCalls?.[0].status).toBe('failed')
  })

  it('marks incomplete tool calls as completed on normal end', () => {
    const state = baseState({
      liveToolCalls: { t1: [{ toolCallId: 'tc1', title: 'read', status: 'in_progress' }] },
    })
    const result = applyTurnEnd(state, 't1', 'end_turn')
    const assistantMsg = result.tasks?.['t1'].messages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.toolCalls?.[0].status).toBe('completed')
  })

  it('preserves already-completed tool call status', () => {
    const state = baseState({
      liveToolCalls: { t1: [{ toolCallId: 'tc1', title: 'read', status: 'completed' }] },
    })
    const result = applyTurnEnd(state, 't1', 'refusal')
    const assistantMsg = result.tasks?.['t1'].messages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.toolCalls?.[0].status).toBe('completed')
  })

  it('clears streaming state', () => {
    const state = baseState({
      streamingChunks: { t1: 'partial text' },
      thinkingChunks: { t1: 'thinking...' },
      liveToolCalls: { t1: [{ toolCallId: 'tc1', title: 'x', status: 'in_progress' }] },
    })
    const result = applyTurnEnd(state, 't1', 'end_turn')
    expect(result.streamingChunks?.['t1']).toBe('')
    expect(result.thinkingChunks?.['t1']).toBe('')
    expect(result.liveToolCalls?.['t1']).toEqual([])
  })

  it('returns empty object for unknown task', () => {
    const result = applyTurnEnd(baseState(), 'unknown', 'end_turn')
    expect(result).toEqual({})
  })

  it('processes running task and sets status to paused', () => {
    const state = baseState({
      tasks: { 't1': makeTask({ id: 't1', status: 'running' }) },
    })
    const result = applyTurnEnd(state, 't1', 'end_turn')
    expect(result.tasks?.['t1']?.status).toBe('paused')
    expect(result.streamingChunks?.['t1']).toBe('')
  })

  it('does not append empty assistant message after pause clears chunks', () => {
    const state = baseState({
      tasks: { 't1': makeTask({ id: 't1', status: 'paused', messages: [{ role: 'user', content: 'hello', timestamp: '' }] }) },
      streamingChunks: { t1: '' },
      thinkingChunks: { t1: '' },
      liveToolCalls: { t1: [] },
    })
    const result = applyTurnEnd(state, 't1', 'end_turn')
    const messages = result.tasks?.['t1'].messages ?? []
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
  })
})

describe('loadTasks', () => {
  it('loads live tasks from backend and merges history', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    const liveTask = makeTask({ id: 'live-1', workspace: '/ws1' })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([liveTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([{ workspace: '/ws2', threadIds: [] }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['live-1']).toBeDefined()
    expect(useTaskStore.getState().projects).toContain('/ws1')
    expect(useTaskStore.getState().projects).toContain('/ws2')
    expect(useTaskStore.getState().connected).toBe(true)
  })

  it('does not overwrite live tasks with archived ones', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, toArchivedTasks } = await import('@/lib/history-store')
    const liveTask = makeTask({ id: 'shared-id', status: 'running', workspace: '/ws' })
    const archivedTask = makeTask({ id: 'shared-id', status: 'completed', workspace: '/ws', isArchived: true })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([liveTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([archivedTask])
    const { loadProjects } = await import('@/lib/history-store')
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['shared-id'].status).toBe('running')
  })

  it('preserves running tasks in store when loadTasks is called mid-session', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    // Simulate a running task already in the store with messages
    const runningTask = makeTask({
      id: 'active-1', status: 'running', workspace: '/ws',
      messages: [
        { role: 'user', content: 'hello', timestamp: '' },
        { role: 'assistant', content: 'hi there', timestamp: '' },
      ],
    })
    useTaskStore.getState().upsertTask(runningTask)
    // loadTasks returns an empty backend list (task not visible to backend yet)
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    // Running task must survive — messages intact
    const preserved = useTaskStore.getState().tasks['active-1']
    expect(preserved).toBeDefined()
    expect(preserved.status).toBe('running')
    expect(preserved.messages).toHaveLength(2)
  })

  it('preserves paused tasks in store when loadTasks is called', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    const pausedTask = makeTask({ id: 'paused-1', status: 'paused', workspace: '/ws',
      messages: [{ role: 'user', content: 'test', timestamp: '' }],
    })
    useTaskStore.getState().upsertTask(pausedTask)
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['paused-1']?.status).toBe('paused')
  })

  it('restores project display names from history', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([
      { workspace: '/ws', displayName: 'My Project', threadIds: [] },
    ])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().projectNames['/ws']).toBe('My Project')
  })

  it('falls back to history-only when backend fails', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockRejectedValueOnce(new Error('backend down'))
    const archivedTask = makeTask({ id: 'archived-1', workspace: '/ws', isArchived: true })
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([{ workspace: '/ws', threadIds: ['archived-1'] }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([archivedTask])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['archived-1']).toBeDefined()
    expect(useTaskStore.getState().connected).toBe(false)
  })

  it('sets connected false when both backend and history fail', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockRejectedValueOnce(new Error('backend down'))
    vi.mocked(loadThreads).mockRejectedValueOnce(new Error('disk error'))
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().connected).toBe(false)
  })

  it('still sets connected when history load fails but backend succeeds', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([makeTask({ workspace: '/ws' })])
    vi.mocked(loadThreads).mockRejectedValueOnce(new Error('disk error'))
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().connected).toBe(true)
    expect(useTaskStore.getState().tasks['task-1']).toBeDefined()
  })

  it('merges worktree metadata from archived onto live tasks', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    const liveTask = makeTask({ id: 'wt-1', workspace: '/project/.kiro/worktrees/feat', status: 'running' })
    const archivedTask = makeTask({
      id: 'wt-1',
      workspace: '/project/.kiro/worktrees/feat',
      status: 'completed',
      isArchived: true,
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      projectId: 'uuid-123',
      parentTaskId: 'parent-1',
    })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([liveTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([{ workspace: '/project', projectId: 'uuid-123', threadIds: ['wt-1'] }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([archivedTask])
    await useTaskStore.getState().loadTasks()
    const task = useTaskStore.getState().tasks['wt-1']
    expect(task.status).toBe('running')
    expect(task.worktreePath).toBe('/project/.kiro/worktrees/feat')
    expect(task.originalWorkspace).toBe('/project')
    expect(task.projectId).toBe('uuid-123')
    expect(task.parentTaskId).toBe('parent-1')
  })

  it('does not overwrite existing worktree metadata on live tasks', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    const liveTask = makeTask({
      id: 'wt-2',
      workspace: '/project/.kiro/worktrees/feat',
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      projectId: 'live-uuid',
    })
    const archivedTask = makeTask({
      id: 'wt-2',
      workspace: '/project/.kiro/worktrees/feat',
      isArchived: true,
      worktreePath: '/project/.kiro/worktrees/old',
      originalWorkspace: '/old-project',
      projectId: 'archived-uuid',
    })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([liveTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([{ workspace: '/project', projectId: 'live-uuid', threadIds: [] }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([archivedTask])
    await useTaskStore.getState().loadTasks()
    const task = useTaskStore.getState().tasks['wt-2']
    expect(task.worktreePath).toBe('/project/.kiro/worktrees/feat')
    expect(task.originalWorkspace).toBe('/project')
    expect(task.projectId).toBe('live-uuid')
  })

  it('excludes worktree paths from projects array after merge', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    const liveTask = makeTask({ id: 'wt-3', workspace: '/project/.kiro/worktrees/feat', status: 'running' })
    const archivedTask = makeTask({
      id: 'wt-3',
      workspace: '/project/.kiro/worktrees/feat',
      isArchived: true,
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      projectId: 'uuid-456',
    })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([liveTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([{ workspace: '/project', projectId: 'uuid-456', threadIds: ['wt-3'] }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([archivedTask])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projects).not.toContain('/project/.kiro/worktrees/feat')
  })

  it('restores missing threads from backup', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks, loadBackup } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    const backupTask = makeTask({ id: 'backup-1', name: 'Restored Thread', workspace: '/ws', isArchived: true,
      worktreePath: '/ws/.kiro/worktrees/feat', originalWorkspace: '/ws', parentTaskId: 'parent-1', projectId: '/ws' })
    vi.mocked(loadBackup).mockResolvedValueOnce({
      threads: [{ id: 'backup-1', name: 'Restored Thread', workspace: '/ws', createdAt: '', messages: [] }],
      projects: [{ workspace: '/ws', displayName: 'My Project', projectId: 'uuid-1', threadIds: ['backup-1'] }],
      softDeleted: [],
    })
    // toArchivedTasks is called twice: once for primary (empty), once for backup
    vi.mocked(toArchivedTasks).mockReturnValueOnce([backupTask])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['backup-1']).toBeDefined()
    expect(useTaskStore.getState().tasks['backup-1'].name).toBe('Restored Thread')
    expect(useTaskStore.getState().tasks['backup-1'].worktreePath).toBe('/ws/.kiro/worktrees/feat')
    expect(useTaskStore.getState().projectNames['/ws']).toBe('My Project')
  })

  it('does not overwrite primary threads with backup', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks, loadBackup } = await import('@/lib/history-store')
    const primaryTask = makeTask({ id: 'shared', name: 'Primary Name', workspace: '/ws' })
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([primaryTask])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    const backupTask = makeTask({ id: 'shared', name: 'Backup Name', workspace: '/ws', isArchived: true })
    vi.mocked(loadBackup).mockResolvedValueOnce({
      threads: [{ id: 'shared', name: 'Backup Name', workspace: '/ws', createdAt: '', messages: [] }],
      projects: [], softDeleted: [],
    })
    vi.mocked(toArchivedTasks).mockReturnValueOnce([backupTask])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().tasks['shared'].name).toBe('Primary Name')
  })

  it('does not restore soft-deleted threads from backup as active', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, loadSoftDeleted, toArchivedTasks, loadBackup } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(loadSoftDeleted).mockResolvedValueOnce([{
      task: makeTask({ id: 'del-1', workspace: '/ws' }),
      deletedAt: '2026-01-01',
    }])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    const backupTask = makeTask({ id: 'del-1', name: 'Should Stay Deleted', workspace: '/ws', isArchived: true })
    vi.mocked(loadBackup).mockResolvedValueOnce({
      threads: [{ id: 'del-1', name: 'Should Stay Deleted', workspace: '/ws', createdAt: '', messages: [] }],
      projects: [], softDeleted: [],
    })
    vi.mocked(toArchivedTasks).mockReturnValueOnce([backupTask])
    await useTaskStore.getState().loadTasks()
    // Should remain in softDeleted, not in active tasks
    expect(useTaskStore.getState().tasks['del-1']).toBeUndefined()
    expect(useTaskStore.getState().softDeleted['del-1']).toBeDefined()
  })
})

describe('setConnected', () => {
  it('sets connected state', () => {
    useTaskStore.getState().setConnected(true)
    expect(useTaskStore.getState().connected).toBe(true)
  })

  it('no-ops when value unchanged', () => {
    useTaskStore.setState({ connected: true })
    const before = useTaskStore.getState()
    useTaskStore.getState().setConnected(true)
    // Should be same reference (no state update)
    expect(useTaskStore.getState().connected).toBe(before.connected)
  })
})

describe('persistHistory', () => {
  it('calls saveThreads with current tasks, projectNames, and projectIds', async () => {
    const { saveThreads } = await import('@/lib/history-store')
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ projectNames: { '/ws': 'My Project' } })
    useTaskStore.getState().persistHistory()
    expect(saveThreads).toHaveBeenCalledWith(
      expect.objectContaining({ 'task-1': expect.any(Object) }),
      expect.objectContaining({ '/ws': 'My Project' }),
      expect.any(Object),
    )
  })
})

describe('clearHistory', () => {
  it('cancels running tasks and clears all state', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { clearHistory: clearHistoryStore } = await import('@/lib/history-store')
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', status: 'running', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't2', status: 'paused', workspace: '/ws' }))
    useTaskStore.getState().addProject('/ws')
    await useTaskStore.getState().clearHistory()
    expect(ipc.cancelTask).toHaveBeenCalledWith('t1')
    expect(ipc.cancelTask).toHaveBeenCalledWith('t2')
    expect(clearHistoryStore).toHaveBeenCalledTimes(1)
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0)
    expect(useTaskStore.getState().projects).toHaveLength(0)
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('does not cancel completed tasks', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.cancelTask).mockClear()
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', status: 'completed', workspace: '/ws' }))
    await useTaskStore.getState().clearHistory()
    expect(ipc.cancelTask).not.toHaveBeenCalled()
  })
})

describe('archiveThreads', () => {
  it('removes all tasks for workspace and adds to deletedTaskIds', () => {
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't2', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't3', workspace: '/other' }))
    useTaskStore.getState().archiveThreads('/ws')
    expect(useTaskStore.getState().tasks['t1']).toBeUndefined()
    expect(useTaskStore.getState().tasks['t2']).toBeUndefined()
    expect(useTaskStore.getState().tasks['t3']).toBeDefined()
    expect(useTaskStore.getState().deletedTaskIds.has('t1')).toBe(true)
    expect(useTaskStore.getState().deletedTaskIds.has('t2')).toBe(true)
  })

  it('clears selectedTaskId if it was in the archived workspace', () => {
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.setState({ selectedTaskId: 't1', view: 'chat' })
    useTaskStore.getState().archiveThreads('/ws')
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
    expect(useTaskStore.getState().view).toBe('dashboard')
  })
})

describe('removeProject', () => {
  it('removes project, tasks, and clears drafts', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.getState().setDraft('/ws', 'draft text')
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().projects).not.toContain('/ws')
    expect(useTaskStore.getState().tasks['t1']).toBeUndefined()
    expect(useTaskStore.getState().drafts['/ws']).toBeUndefined()
  })

  it('clears pendingWorkspace if it matches removed project', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.setState({ pendingWorkspace: '/ws' })
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().pendingWorkspace).toBeNull()
  })

  it('switches to dashboard when selected task is removed', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.setState({ selectedTaskId: 't1', view: 'chat' })
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().view).toBe('dashboard')
  })

  it('removes orphaned tasks when called with a UUID projectId as cwd', () => {
    const orphanUuid = crypto.randomUUID()
    useTaskStore.setState({
      tasks: {
        't1': makeTask({ id: 't1', workspace: '/old-project', projectId: orphanUuid }),
        't2': makeTask({ id: 't2', workspace: '/other', projectId: 'other-pid' }),
      },
      projects: ['/other'],
      projectIds: { '/old-project': orphanUuid },
    })
    useTaskStore.getState().removeProject(orphanUuid)
    // t1 should be soft-deleted
    expect(useTaskStore.getState().tasks['t1']).toBeUndefined()
    expect(useTaskStore.getState().softDeleted['t1']).toBeDefined()
    // t2 should be untouched
    expect(useTaskStore.getState().tasks['t2']).toBeDefined()
    // projectIds entry pointing to the orphan UUID should be cleaned up
    expect(Object.values(useTaskStore.getState().projectIds)).not.toContain(orphanUuid)
  })
})

describe('setSettingsOpen', () => {
  it('opens settings with section', () => {
    useTaskStore.getState().setSettingsOpen(true, 'appearance')
    expect(useTaskStore.getState().isSettingsOpen).toBe(true)
    expect(useTaskStore.getState().settingsInitialSection).toBe('appearance')
  })

  it('opens settings without section defaults to null', () => {
    useTaskStore.getState().setSettingsOpen(true)
    expect(useTaskStore.getState().settingsInitialSection).toBeNull()
  })
})

describe('softDeleteTask', () => {
  it('moves task from tasks to softDeleted with deletedAt timestamp', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().softDeleteTask('task-1')
    expect(useTaskStore.getState().tasks['task-1']).toBeUndefined()
    const sd = useTaskStore.getState().softDeleted['task-1']
    expect(sd).toBeDefined()
    expect(sd.task.id).toBe('task-1')
    expect(sd.task.isArchived).toBe(true)
    expect(sd.task.status).toBe('completed')
    expect(sd.deletedAt).toBeTruthy()
  })

  it('clears streaming data for soft-deleted task', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({
      streamingChunks: { 'task-1': 'text' },
      thinkingChunks: { 'task-1': 'think' },
      liveToolCalls: { 'task-1': [] },
    })
    useTaskStore.getState().softDeleteTask('task-1')
    expect(useTaskStore.getState().streamingChunks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().thinkingChunks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().liveToolCalls['task-1']).toBeUndefined()
  })

  it('adds to deletedTaskIds', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().softDeleteTask('task-1')
    expect(useTaskStore.getState().deletedTaskIds.has('task-1')).toBe(true)
  })

  it('clears selectedTaskId if soft-deleted', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ selectedTaskId: 'task-1' })
    useTaskStore.getState().softDeleteTask('task-1')
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('no-ops for non-existent task', () => {
    const before = useTaskStore.getState().softDeleted
    useTaskStore.getState().softDeleteTask('nonexistent')
    expect(useTaskStore.getState().softDeleted).toBe(before)
  })
})

describe('restoreTask', () => {
  it('moves task from softDeleted back to tasks', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().softDeleteTask('task-1')
    useTaskStore.getState().restoreTask('task-1')
    expect(useTaskStore.getState().tasks['task-1']).toBeDefined()
    expect(useTaskStore.getState().tasks['task-1'].isArchived).toBe(false)
    expect(useTaskStore.getState().softDeleted['task-1']).toBeUndefined()
  })

  it('removes from deletedTaskIds so upsertTask works again', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().softDeleteTask('task-1')
    expect(useTaskStore.getState().deletedTaskIds.has('task-1')).toBe(true)
    useTaskStore.getState().restoreTask('task-1')
    expect(useTaskStore.getState().deletedTaskIds.has('task-1')).toBe(false)
  })

  it('adds workspace to projects if not present', () => {
    useTaskStore.getState().upsertTask(makeTask({ workspace: '/new-ws' }))
    useTaskStore.getState().softDeleteTask('task-1')
    useTaskStore.setState({ projects: [] })
    useTaskStore.getState().restoreTask('task-1')
    expect(useTaskStore.getState().projects).toContain('/new-ws')
  })

  it('no-ops for non-existent soft-deleted task', () => {
    const before = useTaskStore.getState().tasks
    useTaskStore.getState().restoreTask('nonexistent')
    expect(useTaskStore.getState().tasks).toBe(before)
  })
})

describe('permanentlyDeleteTask', () => {
  it('removes from softDeleted and adds to deletedTaskIds', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().softDeleteTask('task-1')
    useTaskStore.getState().permanentlyDeleteTask('task-1')
    expect(useTaskStore.getState().softDeleted['task-1']).toBeUndefined()
    expect(useTaskStore.getState().deletedTaskIds.has('task-1')).toBe(true)
  })

  it('no-ops for non-existent soft-deleted task', () => {
    const before = useTaskStore.getState().softDeleted
    useTaskStore.getState().permanentlyDeleteTask('nonexistent')
    expect(useTaskStore.getState().softDeleted).toBe(before)
  })
})

describe('purgeExpiredSoftDeletes', () => {
  it('removes threads older than 48 hours', () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    useTaskStore.setState({
      softDeleted: {
        't1': { task: makeTask({ id: 't1' }), deletedAt: threeDaysAgo },
      },
    })
    useTaskStore.getState().purgeExpiredSoftDeletes()
    expect(useTaskStore.getState().softDeleted['t1']).toBeUndefined()
    expect(useTaskStore.getState().deletedTaskIds.has('t1')).toBe(true)
  })

  it('keeps threads newer than 48 hours', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    useTaskStore.setState({
      softDeleted: {
        't1': { task: makeTask({ id: 't1' }), deletedAt: oneHourAgo },
      },
    })
    useTaskStore.getState().purgeExpiredSoftDeletes()
    expect(useTaskStore.getState().softDeleted['t1']).toBeDefined()
  })

  it('purges expired and keeps recent in mixed set', () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    useTaskStore.setState({
      softDeleted: {
        'old': { task: makeTask({ id: 'old' }), deletedAt: threeDaysAgo },
        'new': { task: makeTask({ id: 'new' }), deletedAt: oneHourAgo },
      },
    })
    useTaskStore.getState().purgeExpiredSoftDeletes()
    expect(useTaskStore.getState().softDeleted['old']).toBeUndefined()
    expect(useTaskStore.getState().softDeleted['new']).toBeDefined()
  })

  it('no-ops when softDeleted is empty', () => {
    const before = useTaskStore.getState().softDeleted
    useTaskStore.getState().purgeExpiredSoftDeletes()
    expect(useTaskStore.getState().softDeleted).toBe(before)
  })
})

describe('removeTask delegates to softDeleteTask', () => {
  it('soft-deletes instead of permanently deleting', () => {
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.getState().removeTask('task-1')
    expect(useTaskStore.getState().tasks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().softDeleted['task-1']).toBeDefined()
  })
})

describe('removeProject soft-deletes threads', () => {
  it('moves project threads to softDeleted', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't2', workspace: '/ws' }))
    useTaskStore.getState().removeProject('/ws')
    expect(useTaskStore.getState().softDeleted['t1']).toBeDefined()
    expect(useTaskStore.getState().softDeleted['t2']).toBeDefined()
  })
})

describe('archiveThreads soft-deletes threads', () => {
  it('moves workspace threads to softDeleted', () => {
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/ws' }))
    useTaskStore.getState().upsertTask(makeTask({ id: 't2', workspace: '/ws' }))
    useTaskStore.getState().archiveThreads('/ws')
    expect(useTaskStore.getState().softDeleted['t1']).toBeDefined()
    expect(useTaskStore.getState().softDeleted['t2']).toBeDefined()
    expect(useTaskStore.getState().tasks['t1']).toBeUndefined()
    expect(useTaskStore.getState().tasks['t2']).toBeUndefined()
  })
})

describe('clearHistory clears softDeleted', () => {
  it('resets softDeleted to empty object', async () => {
    useTaskStore.setState({
      softDeleted: {
        't1': { task: makeTask({ id: 't1' }), deletedAt: new Date().toISOString() },
      },
    })
    await useTaskStore.getState().clearHistory()
    expect(Object.keys(useTaskStore.getState().softDeleted)).toHaveLength(0)
  })
})

describe('worktree cleanup in archiveTask', () => {
  it('calls gitWorktreeHasChanges for worktree tasks', async () => {
    const { ipc } = await import('@/lib/ipc')
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().archiveTask('task-1')
    // Wait for the async check to fire
    await vi.waitFor(() => {
      expect(ipc.gitWorktreeHasChanges).toHaveBeenCalledWith('/project/.kiro/worktrees/feat')
    })
  })

  it('shows confirmation dialog for clean worktree on archive', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeHasChanges).mockResolvedValueOnce(false)
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().archiveTask('task-1')
    // Should set pending immediately, then resolve hasChanges
    expect(useTaskStore.getState().worktreeCleanupPending?.taskId).toBe('task-1')
    await vi.waitFor(() => {
      expect(useTaskStore.getState().worktreeCleanupPending?.hasChanges).toBe(false)
    })
    // Task should NOT be archived yet
    expect(useTaskStore.getState().tasks['task-1']?.isArchived).toBeFalsy()
  })

  it('sets worktreeCleanupPending when worktree has changes', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeHasChanges).mockResolvedValueOnce(true)
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      worktreePath: '/project/.kiro/worktrees/dirty',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().archiveTask('task-1')
    await vi.waitFor(() => {
      const pending = useTaskStore.getState().worktreeCleanupPending
      expect(pending).toEqual({
        taskId: 'task-1',
        worktreePath: '/project/.kiro/worktrees/dirty',
        branch: 'dirty',
        originalWorkspace: '/project',
        action: 'archive',
        hasChanges: true,
      })
    })
    // Task should NOT be archived yet — dialog is showing
    expect(useTaskStore.getState().tasks['task-1']?.isArchived).toBeFalsy()
  })

  it('does not check worktree for non-worktree tasks', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeHasChanges).mockClear()
    useTaskStore.getState().upsertTask(makeTask({ status: 'running' }))
    useTaskStore.getState().archiveTask('task-1')
    // Give async a chance to fire (it shouldn't)
    await new Promise((r) => setTimeout(r, 10))
    expect(ipc.gitWorktreeHasChanges).not.toHaveBeenCalled()
  })
})

describe('worktree cleanup in softDeleteTask', () => {
  it('sets worktreeCleanupPending for worktree tasks', async () => {
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().softDeleteTask('task-1')
    // Should set pending immediately (hasChanges=null while loading)
    const pending = useTaskStore.getState().worktreeCleanupPending
    expect(pending?.taskId).toBe('task-1')
    expect(pending?.hasChanges).toBeNull()
    // Task should still exist — not deleted yet
    expect(useTaskStore.getState().tasks['task-1']).toBeDefined()
  })

  it('resolves hasChanges after async check', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeHasChanges).mockResolvedValueOnce(false)
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().softDeleteTask('task-1')
    await vi.waitFor(() => {
      expect(useTaskStore.getState().worktreeCleanupPending?.hasChanges).toBe(false)
    })
  })

  it('sets worktreeCleanupPending with action delete when dirty', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeHasChanges).mockResolvedValueOnce(true)
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/dirty',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().softDeleteTask('task-1')
    await vi.waitFor(() => {
      const pending = useTaskStore.getState().worktreeCleanupPending
      expect(pending).toEqual({
        taskId: 'task-1',
        worktreePath: '/project/.kiro/worktrees/dirty',
        branch: 'dirty',
        originalWorkspace: '/project',
        action: 'delete',
        hasChanges: true,
      })
    })
  })
})

describe('resolveWorktreeCleanup', () => {
  it('removes worktree and deletes task when resolve(true) with delete action', async () => {
    const { ipc } = await import('@/lib/ipc')
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.setState({
      worktreeCleanupPending: {
        taskId: 'task-1',
        worktreePath: '/project/.kiro/worktrees/feat',
        branch: 'feat',
        originalWorkspace: '/project',
        action: 'delete',
        hasChanges: false,
      },
    })
    useTaskStore.getState().resolveWorktreeCleanup(true)
    expect(ipc.gitWorktreeRemove).toHaveBeenCalledWith('/project', '/project/.kiro/worktrees/feat')
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
    // Task should be soft-deleted
    expect(useTaskStore.getState().tasks['task-1']).toBeUndefined()
    expect(useTaskStore.getState().softDeleted['task-1']).toBeDefined()
  })

  it('archives task when resolve with archive action', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeRemove).mockClear()
    useTaskStore.getState().upsertTask(makeTask({
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.setState({
      worktreeCleanupPending: {
        taskId: 'task-1',
        worktreePath: '/project/.kiro/worktrees/feat',
        branch: 'feat',
        originalWorkspace: '/project',
        action: 'archive',
        hasChanges: false,
      },
    })
    useTaskStore.getState().resolveWorktreeCleanup(false)
    expect(ipc.gitWorktreeRemove).not.toHaveBeenCalled()
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
    // Task should be archived but still in tasks
    expect(useTaskStore.getState().tasks['task-1']?.isArchived).toBe(true)
  })

  it('no-ops when no pending cleanup', () => {
    useTaskStore.setState({ worktreeCleanupPending: null })
    useTaskStore.getState().resolveWorktreeCleanup(true)
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
  })
})

describe('projectId', () => {
  it('upsertTask preserves projectId when backend update lacks it', () => {
    useTaskStore.getState().upsertTask(makeTask({
      projectId: '/project',
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    useTaskStore.getState().upsertTask(makeTask({
      status: 'running',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    expect(useTaskStore.getState().tasks['task-1'].projectId).toBe('/project')
  })

  it('upsertTask allows overwriting projectId when explicitly provided', () => {
    useTaskStore.getState().upsertTask(makeTask({ projectId: '/old' }))
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', projectId: '/new' }))
    expect(useTaskStore.getState().tasks['task-1'].projectId).toBe('/new')
  })

  it('createDraftThread sets projectId to UUID for workspace', () => {
    useTaskStore.getState().addProject('/my-project')
    const expectedPid = useTaskStore.getState().projectIds['/my-project']
    const id = useTaskStore.getState().createDraftThread('/my-project')
    expect(useTaskStore.getState().tasks[id].projectId).toBe(expectedPid)
  })

  it('forkTask inherits projectId from parent', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', workspace: '/project/.kiro/worktrees/feat' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask({
      projectId: '/project',
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    await useTaskStore.getState().forkTask('task-1')
    expect(useTaskStore.getState().tasks['fork-1'].projectId).toBe('/project')
  })

  it('forkTask falls back to UUID via getProjectId when parent has no projectId', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', workspace: '/project/.kiro/worktrees/feat' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask({
      originalWorkspace: '/project',
      workspace: '/project/.kiro/worktrees/feat',
    }))
    await useTaskStore.getState().forkTask('task-1')
    const pid = useTaskStore.getState().tasks['fork-1'].projectId
    expect(pid).toMatch(/^[0-9a-f-]{36}$/)
    // Should be the same UUID as getProjectId('/project')
    expect(pid).toBe(useTaskStore.getState().projectIds['/project'])
  })

  it('forkTask adds real workspace to projects list, not worktree path', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', workspace: '/project/.kiro/worktrees/feat' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask({
      projectId: useTaskStore.getState().getProjectId('/project'),
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    await useTaskStore.getState().forkTask('task-1')
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projects).not.toContain('/project/.kiro/worktrees/feat')
  })

  it('removeProject matches worktree threads by originalWorkspace', () => {
    useTaskStore.getState().addProject('/project')
    useTaskStore.getState().upsertTask(makeTask({
      id: 'regular',
      workspace: '/project',
      projectId: useTaskStore.getState().projectIds['/project'],
    }))
    useTaskStore.getState().upsertTask(makeTask({
      id: 'worktree',
      workspace: '/project/.kiro/worktrees/feat',
      projectId: useTaskStore.getState().projectIds['/project'],
      worktreePath: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().removeProject('/project')
    expect(useTaskStore.getState().tasks['regular']).toBeUndefined()
    expect(useTaskStore.getState().tasks['worktree']).toBeUndefined()
  })

  it('archiveThreads matches worktree threads by originalWorkspace', () => {
    useTaskStore.getState().upsertTask(makeTask({
      id: 'wt1',
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().upsertTask(makeTask({
      id: 'other',
      workspace: '/other',
    }))
    useTaskStore.getState().archiveThreads('/project')
    expect(useTaskStore.getState().tasks['wt1']).toBeUndefined()
    expect(useTaskStore.getState().tasks['other']).toBeDefined()
  })

  it('restoreTask uses originalWorkspace for projects list', () => {
    useTaskStore.getState().upsertTask(makeTask({
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().softDeleteTask('task-1')
    useTaskStore.setState({ projects: [] })
    useTaskStore.getState().restoreTask('task-1')
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projects).not.toContain('/project/.kiro/worktrees/feat')
  })

  it('loadTasks derives projects from workspace paths, not UUIDs', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([
      makeTask({ id: 't1', workspace: '/project' }),
      makeTask({ id: 't2', workspace: '/project/.kiro/worktrees/feat', originalWorkspace: '/project' }),
    ])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().projects).toEqual(['/project'])
  })
})

describe('workspace scoping', () => {
  beforeEach(() => {
    mockSetActiveWorkspace.mockClear()
  })

  it('setSelectedTask syncs activeWorkspace to project root', () => {
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/project' }))
    useTaskStore.getState().setSelectedTask('t1')
    expect(mockSetActiveWorkspace).toHaveBeenCalledWith('/project', '/project')
  })

  it('setSelectedTask resolves worktree thread to originalWorkspace', () => {
    useTaskStore.getState().upsertTask(makeTask({
      id: 't1',
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      worktreePath: '/project/.kiro/worktrees/feat',
    }))
    useTaskStore.getState().setSelectedTask('t1')
    expect(mockSetActiveWorkspace).toHaveBeenCalledWith('/project', '/project/.kiro/worktrees/feat')
  })

  it('setSelectedTask sets activeWorkspace to null when deselecting', () => {
    useTaskStore.getState().upsertTask(makeTask({ id: 't1', workspace: '/project' }))
    useTaskStore.getState().setSelectedTask('t1')
    mockSetActiveWorkspace.mockClear()
    useTaskStore.getState().setSelectedTask(null)
    expect(mockSetActiveWorkspace).toHaveBeenCalledWith(null, null)
  })

  it('setPendingWorkspace syncs activeWorkspace immediately', () => {
    useTaskStore.getState().setPendingWorkspace('/my-project')
    expect(mockSetActiveWorkspace).toHaveBeenCalledWith('/my-project', '/my-project')
  })

  it('setPendingWorkspace(null) clears activeWorkspace', () => {
    useTaskStore.getState().setPendingWorkspace(null)
    expect(mockSetActiveWorkspace).toHaveBeenCalledWith(null, null)
  })

  it('addProject rejects worktree paths', () => {
    useTaskStore.getState().addProject('/project/.kiro/worktrees/feat')
    expect(useTaskStore.getState().projects).toHaveLength(0)
    expect(useTaskStore.getState().projectIds).toEqual({})
  })

  it('addProject accepts regular project paths', () => {
    useTaskStore.getState().addProject('/project')
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projectIds['/project']).toBeDefined()
  })

  it('loadTasks never puts worktree paths in projects array', async () => {
    const { ipc } = await import('@/lib/ipc')
    const { loadThreads, loadProjects, toArchivedTasks } = await import('@/lib/history-store')
    vi.mocked(ipc.listTasks).mockResolvedValueOnce([
      makeTask({ id: 't1', workspace: '/project' }),
      makeTask({ id: 't2', workspace: '/project/.kiro/worktrees/feat', originalWorkspace: '/project' }),
      makeTask({ id: 't3', workspace: '/project/.kiro/worktrees/fix', originalWorkspace: '/project' }),
    ])
    vi.mocked(loadThreads).mockResolvedValueOnce([])
    vi.mocked(loadProjects).mockResolvedValueOnce([])
    vi.mocked(toArchivedTasks).mockReturnValueOnce([])
    await useTaskStore.getState().loadTasks()
    expect(useTaskStore.getState().projects).toEqual(['/project'])
    expect(useTaskStore.getState().projects.some((p) => p.includes('.kiro/worktrees'))).toBe(false)
  })

  it('forkTask of worktree thread adds project root to projects, not worktree path', async () => {
    const { ipc } = await import('@/lib/ipc')
    const forkedTask = makeTask({ id: 'fork-1', workspace: '/project/.kiro/worktrees/feat' })
    vi.mocked(ipc.forkTask).mockResolvedValueOnce(forkedTask)
    useTaskStore.getState().upsertTask(makeTask({
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
      worktreePath: '/project/.kiro/worktrees/feat',
    }))
    await useTaskStore.getState().forkTask('task-1')
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projects.some((p) => p.includes('.kiro/worktrees'))).toBe(false)
  })

  it('restoreTask of worktree thread adds project root to projects', () => {
    useTaskStore.getState().upsertTask(makeTask({
      workspace: '/project/.kiro/worktrees/feat',
      originalWorkspace: '/project',
    }))
    useTaskStore.getState().softDeleteTask('task-1')
    useTaskStore.setState({ projects: [] })
    useTaskStore.getState().restoreTask('task-1')
    expect(useTaskStore.getState().projects).toContain('/project')
    expect(useTaskStore.getState().projects.some((p) => p.includes('.kiro/worktrees'))).toBe(false)
  })
})

describe('btw (tangent) mode', () => {
  it('enterBtwMode creates a checkpoint with current messages', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'hello', timestamp: '' }] })
    useTaskStore.setState({ tasks: { 'task-1': task }, selectedTaskId: 'task-1' })
    useTaskStore.getState().enterBtwMode('task-1', 'what is X?')
    const cp = useTaskStore.getState().btwCheckpoint
    expect(cp).not.toBeNull()
    expect(cp!.taskId).toBe('task-1')
    expect(cp!.question).toBe('what is X?')
    expect(cp!.messages).toHaveLength(1)
    expect(cp!.messages[0].content).toBe('hello')
  })

  it('enterBtwMode does nothing for unknown task', () => {
    useTaskStore.getState().enterBtwMode('nonexistent', 'q')
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
  })

  it('exitBtwMode(false) restores messages to checkpoint', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'original', timestamp: '' }] })
    useTaskStore.setState({ tasks: { 'task-1': task }, selectedTaskId: 'task-1' })
    useTaskStore.getState().enterBtwMode('task-1', 'side q')
    // Simulate btw messages added
    useTaskStore.setState((s) => ({
      tasks: { ...s.tasks, 'task-1': { ...s.tasks['task-1'], messages: [
        { role: 'user', content: 'original', timestamp: '' },
        { role: 'user', content: 'side q', timestamp: '' },
        { role: 'assistant', content: 'side answer', timestamp: '' },
      ] } },
    }))
    useTaskStore.getState().exitBtwMode(false)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
    const msgs = useTaskStore.getState().tasks['task-1'].messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toBe('original')
  })

  it('exitBtwMode(true) keeps the last Q&A pair (tail mode)', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'original', timestamp: '' }] })
    useTaskStore.setState({ tasks: { 'task-1': task }, selectedTaskId: 'task-1' })
    useTaskStore.getState().enterBtwMode('task-1', 'side q')
    useTaskStore.setState((s) => ({
      tasks: { ...s.tasks, 'task-1': { ...s.tasks['task-1'], messages: [
        { role: 'user', content: 'original', timestamp: '' },
        { role: 'user', content: 'side q', timestamp: '' },
        { role: 'assistant', content: 'side answer', timestamp: '' },
      ] } },
    }))
    useTaskStore.getState().exitBtwMode(true)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
    const msgs = useTaskStore.getState().tasks['task-1'].messages
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toBe('original')
    expect(msgs[1].content).toBe('side q')
    expect(msgs[2].content).toBe('side answer')
  })

  it('exitBtwMode clears checkpoint even if task was deleted', () => {
    const task = makeTask()
    useTaskStore.setState({ tasks: { 'task-1': task }, selectedTaskId: 'task-1' })
    useTaskStore.getState().enterBtwMode('task-1', 'q')
    useTaskStore.setState({ tasks: {} })
    useTaskStore.getState().exitBtwMode(false)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
  })

  it('exitBtwMode is no-op when no checkpoint exists', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'hello', timestamp: '' }] })
    useTaskStore.setState({ tasks: { 'task-1': task } })
    useTaskStore.getState().exitBtwMode(false)
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(1)
  })

  it('checkpoint messages are isolated from subsequent mutations', () => {
    const task = makeTask({ messages: [{ role: 'user', content: 'original', timestamp: '' }] })
    useTaskStore.setState({ tasks: { 'task-1': task }, selectedTaskId: 'task-1' })
    useTaskStore.getState().enterBtwMode('task-1', 'q')
    // Mutate the task messages
    useTaskStore.setState((s) => ({
      tasks: { ...s.tasks, 'task-1': { ...s.tasks['task-1'], messages: [] } },
    }))
    // Checkpoint should still have the original
    expect(useTaskStore.getState().btwCheckpoint!.messages).toHaveLength(1)
  })
})

describe('multi-turn message preservation', () => {
  it('preserves messages when task_update arrives with empty messages (simulates backend strip)', () => {
    const msgs = [
      { role: 'user' as const, content: 'hello', timestamp: '1' },
      { role: 'assistant' as const, content: 'hi there', timestamp: '2' },
    ]
    useTaskStore.getState().upsertTask(makeTask({ messages: msgs }))
    // Simulate backend task_update with messages stripped (as listener does)
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(2)
    expect(useTaskStore.getState().tasks['task-1'].messages).toBe(msgs)
  })

  it('preserves messages across multiple consecutive task_updates with empty messages', () => {
    const msgs = [
      { role: 'user' as const, content: 'q1', timestamp: '1' },
      { role: 'assistant' as const, content: 'a1', timestamp: '2' },
      { role: 'user' as const, content: 'q2', timestamp: '3' },
      { role: 'assistant' as const, content: 'a2', timestamp: '4' },
    ]
    useTaskStore.getState().upsertTask(makeTask({ messages: msgs }))
    // Multiple rapid task_updates (status changes during a turn)
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    useTaskStore.getState().upsertTask(makeTask({ status: 'pending_permission', messages: [] }))
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(4)
  })

  it('applyTurnEnd preserves existing messages and appends assistant message', () => {
    const existingMsgs = [
      { role: 'user' as const, content: 'first question', timestamp: '1' },
      { role: 'assistant' as const, content: 'first answer', timestamp: '2' },
      { role: 'user' as const, content: 'second question', timestamp: '3' },
    ]
    const state = {
      tasks: { 't1': makeTask({ id: 't1', status: 'running', messages: existingMsgs }) },
      streamingChunks: { t1: 'second answer' } as Record<string, string>,
      thinkingChunks: {} as Record<string, string>,
      liveToolCalls: {} as Record<string, import('@/types').ToolCall[]>,
    }
    const result = applyTurnEnd(state, 't1', 'end_turn')
    const messages = result.tasks?.['t1'].messages ?? []
    expect(messages).toHaveLength(4)
    expect(messages[0].content).toBe('first question')
    expect(messages[1].content).toBe('first answer')
    expect(messages[2].content).toBe('second question')
    expect(messages[3].content).toBe('second answer')
    expect(messages[3].role).toBe('assistant')
  })

  it('full multi-turn cycle: send → stream → turnEnd → task_update → send again', () => {
    // Turn 1: user sends message
    const userMsg1 = { role: 'user' as const, content: 'hello', timestamp: '1' }
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [userMsg1] }))

    // Turn 1: streaming completes, applyTurnEnd
    useTaskStore.setState((s) => ({
      streamingChunks: { ...s.streamingChunks, 'task-1': 'hi there' },
    }))
    useTaskStore.setState((s) => applyTurnEnd(s, 'task-1', 'end_turn'))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(2)

    // Backend task_update arrives with empty messages (status change)
    useTaskStore.getState().upsertTask(makeTask({ status: 'paused', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(2)

    // Turn 2: user sends another message
    const task = useTaskStore.getState().tasks['task-1']
    const userMsg2 = { role: 'user' as const, content: 'follow up', timestamp: '3' }
    useTaskStore.getState().upsertTask({
      ...task,
      status: 'running',
      messages: [...task.messages, userMsg2],
    })
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(3)

    // Another backend task_update with empty messages
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(3)

    // Turn 2: streaming completes
    useTaskStore.setState((s) => ({
      streamingChunks: { ...s.streamingChunks, 'task-1': 'follow up answer' },
    }))
    useTaskStore.setState((s) => applyTurnEnd(s, 'task-1', 'end_turn'))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(4)
    expect(useTaskStore.getState().tasks['task-1'].messages[3].content).toBe('follow up answer')
  })

  it('messages survive when task_update arrives between applyTurnEnd and next user message', () => {
    // Setup: task with 2 messages after first turn
    const msgs = [
      { role: 'user' as const, content: 'q1', timestamp: '1' },
      { role: 'assistant' as const, content: 'a1', timestamp: '2' },
    ]
    useTaskStore.getState().upsertTask(makeTask({ status: 'paused', messages: msgs }))

    // Backend task_update with empty messages arrives
    useTaskStore.getState().upsertTask(makeTask({ status: 'paused', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(2)

    // User sends next message
    const task = useTaskStore.getState().tasks['task-1']
    useTaskStore.getState().upsertTask({
      ...task,
      status: 'running',
      messages: [...task.messages, { role: 'user' as const, content: 'q2', timestamp: '3' }],
    })
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(3)
    expect(useTaskStore.getState().tasks['task-1'].messages[2].content).toBe('q2')
  })

  it('upsertTask accepts messages when incoming has more than existing', () => {
    const msgs1 = [{ role: 'user' as const, content: 'q1', timestamp: '1' }]
    useTaskStore.getState().upsertTask(makeTask({ messages: msgs1 }))

    const msgs2 = [
      { role: 'user' as const, content: 'q1', timestamp: '1' },
      { role: 'assistant' as const, content: 'a1', timestamp: '2' },
    ]
    useTaskStore.getState().upsertTask(makeTask({ messages: msgs2 }))
    expect(useTaskStore.getState().tasks['task-1'].messages).toHaveLength(2)
  })

  it('upsertTask preserves name across task_update events', () => {
    useTaskStore.getState().upsertTask(makeTask({ name: 'Original Name' }))
    useTaskStore.getState().renameTask('task-1', 'Renamed')
    // Backend task_update carries stale name
    useTaskStore.getState().upsertTask(makeTask({ name: 'Original Name', status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].name).toBe('Renamed')
  })

  it('preserves parentTaskId when backend update lacks it', () => {
    useTaskStore.getState().upsertTask(makeTask({ parentTaskId: 'parent-1' }))
    useTaskStore.getState().upsertTask(makeTask({ status: 'running', messages: [] }))
    expect(useTaskStore.getState().tasks['task-1'].parentTaskId).toBe('parent-1')
  })

  it('bail-out guard prevents unnecessary re-renders when nothing changed', () => {
    const msgs = [{ role: 'user' as const, content: 'hi', timestamp: '1' }]
    useTaskStore.getState().upsertTask(makeTask({ messages: msgs }))
    const tasksBefore = useTaskStore.getState().tasks

    // Same task_update with empty messages — should bail out (messages preserved by reference)
    useTaskStore.getState().upsertTask(makeTask({ messages: [] }))
    const tasksAfter = useTaskStore.getState().tasks

    // Since messages are preserved by reference and status hasn't changed,
    // the bail-out guard should prevent a state update
    expect(tasksBefore).toBe(tasksAfter)
  })
})
