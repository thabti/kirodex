import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTaskStore } from '@/stores/taskStore'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    selectPermissionOption: vi.fn().mockResolvedValue(undefined),
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
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
vi.mock('./ChatMarkdown', () => ({
  default: ({ text }: { text: string }) => <div data-testid="chat-markdown">{text}</div>,
}))
vi.mock('./TaskCompletionCard', () => ({
  parseReport: () => null,
  stripReport: (t: string) => t,
}))

import { BtwOverlay } from './BtwOverlay'

const baseStoreState = {
  tasks: {},
  projects: [],
  deletedTaskIds: new Set<string>(),
  softDeleted: {},
  selectedTaskId: null,
  streamingChunks: {},
  thinkingChunks: {},
  liveToolCalls: {},
  queuedMessages: {},
  activityFeed: [],
  connected: false,
  terminalOpenTasks: new Set<string>(),
  pendingWorkspace: null,
  view: 'dashboard' as const,
  isNewProjectOpen: false,
  isSettingsOpen: false,
  projectNames: {},
  btwCheckpoint: null,
  worktreeCleanupPending: null,
}

beforeEach(() => {
  useTaskStore.setState(baseStoreState)
})

describe('BtwOverlay', () => {
  it('returns null when btwCheckpoint is null', () => {
    const { container } = render(<BtwOverlay />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the question text when checkpoint is set', () => {
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'What are brand colours?' },
    })
    render(<BtwOverlay />)
    expect(screen.getByText('What are brand colours?')).toBeInTheDocument()
  })

  it('shows thinking state when no response yet', () => {
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
  })

  it('renders assistant response when available', () => {
    const msgs = [
      { role: 'user' as const, content: 'test', timestamp: '' },
      { role: 'assistant' as const, content: 'The brand colours are blue and green.', timestamp: '' },
    ]
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: msgs, workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('The brand colours are blue and green.')
  })

  it('does NOT render PermissionBanner when no pending permission', () => {
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    expect(screen.queryByTestId('permission-banner')).not.toBeInTheDocument()
  })

  it('renders PermissionBanner when pending permission exists', () => {
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: {
        'task-1': {
          id: 'task-1',
          name: 'Task 1',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'running',
          messages: [],
          workspace: '/ws',
          pendingPermission: {
            requestId: 'req-1',
            toolName: 'fs_write',
            description: 'Write to file',
            options: [
              { optionId: 'opt-allow', name: 'Allow', kind: 'allow_once' },
              { optionId: 'opt-deny', name: 'Deny', kind: 'reject_once' },
            ],
          },
        },
      },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    expect(screen.getByTestId('permission-banner')).toBeInTheDocument()
    expect(screen.getByText('Allow')).toBeInTheDocument()
    expect(screen.getByText('Deny')).toBeInTheDocument()
  })

  it('calls ipc.selectPermissionOption when permission option clicked', async () => {
    const { ipc } = await import('@/lib/ipc')
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: {
        'task-1': {
          id: 'task-1',
          name: 'Task 1',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'running',
          messages: [],
          workspace: '/ws',
          pendingPermission: {
            requestId: 'req-1',
            toolName: 'fs_write',
            description: 'Write to file',
            options: [
              { optionId: 'opt-allow', name: 'Allow', kind: 'allow_once' },
              { optionId: 'opt-deny', name: 'Deny', kind: 'reject_once' },
            ],
          },
        },
      },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    fireEvent.click(screen.getByText('Allow'))
    expect(ipc.selectPermissionOption).toHaveBeenCalledWith('task-1', 'req-1', 'opt-allow')
  })

  it('calls exitBtwMode when dismiss button clicked', () => {
    const exitBtwMode = vi.fn()
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
      exitBtwMode,
    })
    render(<BtwOverlay />)
    fireEvent.click(screen.getByLabelText('Dismiss side question'))
    expect(exitBtwMode).toHaveBeenCalledWith(false)
  })

  it('calls exitBtwMode on Escape key', () => {
    const exitBtwMode = vi.fn()
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
      exitBtwMode,
    })
    render(<BtwOverlay />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(exitBtwMode).toHaveBeenCalledWith(false)
  })

  it('calls exitBtwMode when backdrop clicked', () => {
    const exitBtwMode = vi.fn()
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: { 'task-1': { id: 'task-1', name: 'Task 1', createdAt: '2026-01-01T00:00:00Z', status: 'running', messages: [], workspace: '/ws' } },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
      exitBtwMode,
    })
    render(<BtwOverlay />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(exitBtwMode).toHaveBeenCalledWith(false)
  })

  it('displays tool name in permission banner', () => {
    useTaskStore.setState({
      selectedTaskId: 'task-1',
      tasks: {
        'task-1': {
          id: 'task-1',
          name: 'Task 1',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'running',
          messages: [],
          workspace: '/ws',
          pendingPermission: {
            requestId: 'req-2',
            toolName: 'execute_bash',
            description: 'Run command',
            options: [],
          },
        },
      },
      btwCheckpoint: { taskId: 'task-1', messages: [], question: 'test' },
    })
    render(<BtwOverlay />)
    expect(screen.getByTestId('permission-banner')).toBeInTheDocument()
    expect(screen.getByText('execute bash')).toBeInTheDocument()
  })
})
