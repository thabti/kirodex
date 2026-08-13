import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTask } from '@/types'

const chatInputHarness = vi.hoisted(() => ({
  props: null as null | {
    onSendMessage: (message: string) => Promise<void>
    onDraftChange: (message: string) => void
  },
}))

const ipcMocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  gitWorktreeCreate: vi.fn(),
  gitWorktreeSetup: vi.fn(),
  gitWorktreeRemove: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  webStoreSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ipc', () => ({ ipc: ipcMocks }))
vi.mock('./ChatInput', () => ({
  ChatInput: (props: NonNullable<typeof chatInputHarness.props>) => {
    chatInputHarness.props = props
    return <div data-testid="chat-input" />
  },
}))
vi.mock('./EmptyThreadSplash', () => ({ EmptyThreadSplash: () => <div>Start a thread</div> }))
vi.mock('./AgentHandoffLoader', () => ({ AgentHandoffLoader: ({ label }: { label: string }) => <div role="status">{label}</div> }))
vi.mock('./TerminalDrawer', () => ({ TerminalDrawer: () => null }))

import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { PendingChat } from './PendingChat'

const WORKSPACE = '/workspace/project'
const createdTask: AgentTask = {
  id: 'created-task',
  name: 'Build the feature',
  workspace: WORKSPACE,
  status: 'running',
  createdAt: '2026-08-13T09:00:00.000Z',
  messages: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  chatInputHarness.props = null
  ipcMocks.createTask.mockResolvedValue(createdTask)
  ipcMocks.gitWorktreeCreate.mockResolvedValue({
    worktreePath: '/workspace/project/.kiro/worktrees/feature',
    branch: 'kiro/feature',
  })
  ipcMocks.gitWorktreeSetup.mockResolvedValue(undefined)
  ipcMocks.gitWorktreeRemove.mockResolvedValue(undefined)
  ipcMocks.saveSettings.mockResolvedValue(undefined)

  useTaskStore.setState({
    tasks: {},
    projects: [WORKSPACE],
    projectIds: { [WORKSPACE]: 'project-id' },
    drafts: { [WORKSPACE]: 'Build the feature' },
    draftAttachments: {},
    draftPastedChunks: {},
    draftMentionedFiles: {},
    pendingWorkspace: WORKSPACE,
    selectedTaskId: null,
    isWorkspaceTerminalOpen: false,
    _suppressDraftSave: null,
  })
  useSettingsStore.setState((state) => ({
    kiroAuthChecked: true,
    kiroAuth: { email: null, accountType: 'Builder ID' },
    currentModeId: 'kiro_default',
    currentModelId: null,
    activeWorkspace: WORKSPACE,
    settings: { ...state.settings, projectPrefs: {} },
  }))
})

describe('PendingChat task creation', () => {
  it('prevents duplicate sends and clears the draft only after creation succeeds', async () => {
    let resolveCreate: ((task: AgentTask) => void) | undefined
    ipcMocks.createTask.mockReturnValueOnce(new Promise<AgentTask>((resolve) => {
      resolveCreate = resolve
    }))
    render(<PendingChat workspace={WORKSPACE} />)

    const firstSend = chatInputHarness.props?.onSendMessage('Build the feature')
    const duplicateSend = chatInputHarness.props?.onSendMessage('Build the feature')

    expect(ipcMocks.createTask).toHaveBeenCalledOnce()
    expect(useTaskStore.getState().drafts[WORKSPACE]).toBe('Build the feature')

    resolveCreate?.(createdTask)
    await act(async () => {
      await Promise.all([firstSend, duplicateSend])
    })

    expect(useTaskStore.getState().drafts[WORKSPACE]).toBeUndefined()
    expect(useTaskStore.getState().selectedTaskId).toBe(createdTask.id)
  })

  it('keeps the draft when task creation fails', async () => {
    ipcMocks.createTask.mockRejectedValueOnce(new Error('Kiro CLI is unavailable'))
    render(<PendingChat workspace={WORKSPACE} />)

    let caughtError: unknown
    await act(async () => {
      try {
        await chatInputHarness.props?.onSendMessage('Build the feature')
      } catch (error) {
        caughtError = error
      }
    })

    expect(caughtError).toEqual(new Error('Kiro CLI is unavailable'))
    expect(useTaskStore.getState().drafts[WORKSPACE]).toBe('Build the feature')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('finishes failed-worktree cleanup before falling back to the project workspace', async () => {
    let resolveCleanup: (() => void) | undefined
    ipcMocks.gitWorktreeSetup.mockRejectedValueOnce(new Error('Dependency setup failed'))
    ipcMocks.gitWorktreeRemove.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveCleanup = resolve
    }))
    render(<PendingChat workspace={WORKSPACE} />)

    act(() => {
      chatInputHarness.props?.onDraftChange('Build the feature')
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use worktree for this thread' }))

    const sendPromise = chatInputHarness.props?.onSendMessage('Build the feature')
    await waitFor(() => expect(ipcMocks.gitWorktreeRemove).toHaveBeenCalledOnce())
    expect(ipcMocks.createTask).not.toHaveBeenCalled()

    resolveCleanup?.()
    await act(async () => {
      await sendPromise
    })

    expect(ipcMocks.createTask).toHaveBeenCalledWith(expect.objectContaining({ workspace: WORKSPACE }))
    expect(useTaskStore.getState().tasks[createdTask.id]?.messages[0]?.content).toContain('Worktree creation failed')
  })
})
