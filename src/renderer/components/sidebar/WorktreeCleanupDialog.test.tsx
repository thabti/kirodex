import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTaskStore } from '@/stores/taskStore'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    gitWorktreeRemove: vi.fn().mockResolvedValue(undefined),
    gitWorktreeHasChanges: vi.fn().mockResolvedValue(false),
  },
}))
vi.mock('@/lib/history-store', () => ({
  loadThreads: vi.fn().mockResolvedValue([]),
  loadProjects: vi.fn().mockResolvedValue([]),
  loadSoftDeleted: vi.fn().mockResolvedValue([]),
  saveThreads: vi.fn().mockResolvedValue(undefined),
  saveSoftDeleted: vi.fn().mockResolvedValue(undefined),
  toArchivedTasks: vi.fn().mockReturnValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/debugStore', () => ({
  useDebugStore: { getState: () => ({ addEntry: vi.fn() }) },
}))
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: {}, saveSettings: vi.fn().mockResolvedValue(undefined) }), setState: vi.fn() },
}))
vi.mock('@/stores/diffStore', () => ({
  useDiffStore: { getState: () => ({ fetchDiff: vi.fn() }) },
}))
vi.mock('@/stores/kiroStore', () => ({
  useKiroStore: { getState: () => ({ setMcpError: vi.fn() }) },
}))

import { WorktreeCleanupDialog } from './WorktreeCleanupDialog'

const makePending = (overrides = {}) => ({
  taskId: 'task-1',
  worktreePath: '/project/.kiro/worktrees/my-feature',
  branch: 'my-feature',
  originalWorkspace: '/project',
  action: 'delete' as const,
  hasChanges: false,
  ...overrides,
})

beforeEach(() => {
  useTaskStore.setState({
    tasks: {},
    projects: [],
    deletedTaskIds: new Set(),
    softDeleted: {},
    selectedTaskId: null,
    streamingChunks: {},
    thinkingChunks: {},
    liveToolCalls: {},
    queuedMessages: {},
    activityFeed: [],
    connected: false,
    terminalOpenTasks: new Set(),
    pendingWorkspace: null,
    view: 'dashboard',
    isNewProjectOpen: false,
    isSettingsOpen: false,
    projectNames: {},
    worktreeCleanupPending: null,
  })
})

describe('WorktreeCleanupDialog', () => {
  it('does not render when worktreeCleanupPending is null', () => {
    render(<WorktreeCleanupDialog />)
    expect(screen.queryByText(/worktree thread/i)).not.toBeInTheDocument()
  })

  it('renders dialog with branch name when pending is set', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending() })
    render(<WorktreeCleanupDialog />)
    expect(screen.getByText(/Delete worktree thread/)).toBeInTheDocument()
    expect(screen.getByText(/worktree-my-feature/)).toBeInTheDocument()
  })

  it('shows loading state when hasChanges is null', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending({ hasChanges: null }) })
    render(<WorktreeCleanupDialog />)
    expect(screen.getByText(/Checking for uncommitted changes/)).toBeInTheDocument()
  })

  it('shows warning when hasChanges is true', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending({ hasChanges: true }) })
    render(<WorktreeCleanupDialog />)
    expect(screen.getByText(/uncommitted changes that will be lost/)).toBeInTheDocument()
  })

  it('shows no changes message when hasChanges is false', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending({ hasChanges: false }) })
    render(<WorktreeCleanupDialog />)
    expect(screen.getByText(/No uncommitted changes detected/)).toBeInTheDocument()
  })

  it('uses "Close" label for archive action', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending({ action: 'archive' }) })
    render(<WorktreeCleanupDialog />)
    expect(screen.getByText(/Close worktree thread/)).toBeInTheDocument()
  })

  it('Cancel dismisses without deleting', () => {
    useTaskStore.setState({
      worktreeCleanupPending: makePending(),
      tasks: { 'task-1': { id: 'task-1', name: 'test', workspace: '/project/.kiro/worktrees/my-feature', status: 'paused', createdAt: '', messages: [] } },
    })
    render(<WorktreeCleanupDialog />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
    // Task should still exist
    expect(useTaskStore.getState().tasks['task-1']).toBeDefined()
  })

  it('"Delete & remove worktree" calls resolveWorktreeCleanup(true)', async () => {
    const { ipc } = await import('@/lib/ipc')
    useTaskStore.setState({
      worktreeCleanupPending: makePending(),
      tasks: { 'task-1': { id: 'task-1', name: 'test', workspace: '/project/.kiro/worktrees/my-feature', status: 'paused', createdAt: '', messages: [] } },
    })
    render(<WorktreeCleanupDialog />)
    fireEvent.click(screen.getByText(/Delete & remove worktree/))
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
    expect(ipc.gitWorktreeRemove).toHaveBeenCalledWith('/project', '/project/.kiro/worktrees/my-feature')
  })

  it('"Delete thread, keep worktree" calls resolveWorktreeCleanup(false)', async () => {
    const { ipc } = await import('@/lib/ipc')
    vi.mocked(ipc.gitWorktreeRemove).mockClear()
    useTaskStore.setState({
      worktreeCleanupPending: makePending(),
      tasks: { 'task-1': { id: 'task-1', name: 'test', workspace: '/project/.kiro/worktrees/my-feature', status: 'paused', createdAt: '', messages: [] } },
    })
    render(<WorktreeCleanupDialog />)
    fireEvent.click(screen.getByText(/keep worktree on disk/))
    expect(useTaskStore.getState().worktreeCleanupPending).toBeNull()
    expect(ipc.gitWorktreeRemove).not.toHaveBeenCalled()
  })

  it('disables action buttons while loading', () => {
    useTaskStore.setState({ worktreeCleanupPending: makePending({ hasChanges: null }) })
    render(<WorktreeCleanupDialog />)
    const removeBtn = screen.getByText(/Delete & remove worktree/)
    const keepBtn = screen.getByText(/keep worktree on disk/)
    expect(removeBtn).toBeDisabled()
    expect(keepBtn).toBeDisabled()
  })
})
