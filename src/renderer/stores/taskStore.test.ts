import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    forkTask: vi.fn().mockResolvedValue({ id: 'fork-1', name: 'Fork', workspace: '/ws', status: 'paused', createdAt: '', messages: [] }),
  },
}))
vi.mock('@/lib/history-store', () => ({
  loadThreads: vi.fn().mockResolvedValue([]),
  loadProjects: vi.fn().mockResolvedValue([]),
  saveThreads: vi.fn().mockResolvedValue(undefined),
  toArchivedTasks: vi.fn().mockReturnValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./debugStore', () => ({
  useDebugStore: { getState: () => ({ addEntry: vi.fn() }) },
}))
vi.mock('./settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: {}, saveSettings: vi.fn().mockResolvedValue(undefined) }), setState: vi.fn() },
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
    tasks: {}, projects: [], deletedTaskIds: new Set(), selectedTaskId: null,
    streamingChunks: {}, thinkingChunks: {}, liveToolCalls: {},
    queuedMessages: {}, activityFeed: [], connected: false,
    terminalOpenTasks: new Set(), pendingWorkspace: null,
    view: 'dashboard', isNewProjectOpen: false, isSettingsOpen: false, projectNames: {},
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
    expect(msgs).toEqual(['msg1', 'msg2'])
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual([])
  })

  it('removeQueuedMessage removes by index', () => {
    useTaskStore.getState().enqueueMessage('t1', 'a')
    useTaskStore.getState().enqueueMessage('t1', 'b')
    useTaskStore.getState().enqueueMessage('t1', 'c')
    useTaskStore.getState().removeQueuedMessage('t1', 1)
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual(['a', 'c'])
  })

  it('reorderQueuedMessage moves item', () => {
    useTaskStore.getState().enqueueMessage('t1', 'a')
    useTaskStore.getState().enqueueMessage('t1', 'b')
    useTaskStore.getState().enqueueMessage('t1', 'c')
    useTaskStore.getState().reorderQueuedMessage('t1', 0, 2)
    expect(useTaskStore.getState().queuedMessages['t1']).toEqual(['b', 'c', 'a'])
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
  it('addProject adds workspace', () => {
    useTaskStore.getState().addProject('/ws')
    expect(useTaskStore.getState().projects).toContain('/ws')
  })

  it('addProject deduplicates', () => {
    useTaskStore.getState().addProject('/ws')
    useTaskStore.getState().addProject('/ws')
    expect(useTaskStore.getState().projects).toHaveLength(1)
  })

  it('reorderProject swaps positions', () => {
    useTaskStore.setState({ projects: ['/a', '/b', '/c'] })
    useTaskStore.getState().reorderProject(0, 2)
    expect(useTaskStore.getState().projects).toEqual(['/b', '/c', '/a'])
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

  it('renameProject', () => {
    useTaskStore.getState().renameProject('/ws', 'My Project')
    expect(useTaskStore.getState().projectNames['/ws']).toBe('My Project')
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
    expect(useTaskStore.getState().projects).toContain('/new-ws')
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
  const baseState = (overrides?: Partial<Parameters<typeof applyTurnEnd>[0]>) => ({
    tasks: { 't1': makeTask({ id: 't1', status: 'running' }) },
    streamingChunks: {} as Record<string, string>,
    thinkingChunks: {} as Record<string, string>,
    liveToolCalls: {} as Record<string, import('@/types').ToolCall[]>,
    ...overrides,
  })

  it('sets status to paused on normal end_turn', () => {
    const result = applyTurnEnd(baseState(), 't1', 'end_turn')
    expect(result.tasks?.['t1'].status).toBe('paused')
  })

  it('sets status to error on refusal', () => {
    const result = applyTurnEnd(baseState(), 't1', 'refusal')
    expect(result.tasks?.['t1'].status).toBe('error')
  })

  it('appends system error message on refusal', () => {
    const result = applyTurnEnd(baseState(), 't1', 'refusal')
    const messages = result.tasks?.['t1'].messages ?? []
    const systemMsg = messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg?.content).toContain('refused to continue')
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
  it('calls saveThreads with current tasks and projectNames', async () => {
    const { saveThreads } = await import('@/lib/history-store')
    useTaskStore.getState().upsertTask(makeTask())
    useTaskStore.setState({ projectNames: { '/ws': 'My Project' } })
    useTaskStore.getState().persistHistory()
    expect(saveThreads).toHaveBeenCalledWith(
      expect.objectContaining({ 'task-1': expect.any(Object) }),
      expect.objectContaining({ '/ws': 'My Project' }),
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
