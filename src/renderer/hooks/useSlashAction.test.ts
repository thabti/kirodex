import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    setMode: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockResolvedValue({ id: 'task-1', name: 'Test', workspace: '/ws', status: 'running', createdAt: '', messages: [] }),
  },
}))

import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { useSlashAction } from './useSlashAction'

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({
    settings: { kiroBin: 'kiro-cli', agentProfiles: [], fontSize: 13 },
    availableModes: [
      { id: 'kiro_default', name: 'Default' },
      { id: 'kiro_planner', name: 'Planner' },
    ],
    currentModeId: 'kiro_default',
    currentModelId: null,
    availableModels: [],
    modelsLoading: false,
    modelsError: null,
    isLoaded: true,
    activeWorkspace: null,
    availableCommands: [],
    liveMcpServers: [],
    kiroAuth: null,
    kiroAuthChecked: false,
  })
  useTaskStore.setState({
    tasks: { 'task-1': { id: 'task-1', name: 'Test', workspace: '/ws', status: 'paused', createdAt: '', messages: [] } },
    selectedTaskId: 'task-1',
    projects: ['/ws'],
    deletedTaskIds: new Set(),
    pendingWorkspace: null,
    view: 'chat',
    isNewProjectOpen: false,
    isSettingsOpen: false,
    settingsInitialSection: null,
    streamingChunks: {},
    thinkingChunks: {},
    liveToolCalls: {},
    queuedMessages: {},
    activityFeed: [],
    connected: true,
    terminalOpenTasks: new Set(),
    projectNames: {},
  })
})

describe('useSlashAction /plan toggle', () => {
  it('/plan enables plan mode from default', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    expect(useSettingsStore.getState().currentModeId).toBe('kiro_planner')
  })

  it('/plan disables plan mode when already in plan mode', () => {
    useSettingsStore.setState({ currentModeId: 'kiro_planner' })
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    expect(useSettingsStore.getState().currentModeId).toBe('kiro_default')
  })

  it('/plan calls ipc.setMode with kiro_planner when enabling', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    expect(ipc.setMode).toHaveBeenCalledWith('task-1', 'kiro_planner')
  })

  it('/plan calls ipc.setMode with kiro_default when disabling', () => {
    useSettingsStore.setState({ currentModeId: 'kiro_planner' })
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    expect(ipc.setMode).toHaveBeenCalledWith('task-1', 'kiro_default')
  })

  it('/plan does not call ipc.setMode when no task is selected', () => {
    useTaskStore.setState({ selectedTaskId: null })
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    expect(useSettingsStore.getState().currentModeId).toBe('kiro_planner')
    expect(ipc.setMode).not.toHaveBeenCalled()
  })

  it('/plan adds a system message to the task', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/plan') })
    const task = useTaskStore.getState().tasks['task-1']
    expect(task.messages).toHaveLength(1)
    expect(task.messages[0].role).toBe('system')
    expect(task.messages[0].content).toContain('Plan mode')
  })

  it('execute returns true for /plan', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/plan') })
    expect(handled!).toBe(true)
  })

  it('execute returns false for unknown commands', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/unknown') })
    expect(handled!).toBe(false)
  })
})

describe('useSlashAction /usage toggle', () => {
  it('/usage opens usage panel', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/usage') })
    expect(result.current.panel).toBe('usage')
  })

  it('/usage toggles panel off when already open', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/usage') })
    expect(result.current.panel).toBe('usage')
    act(() => { result.current.execute('/usage') })
    expect(result.current.panel).toBeNull()
  })

  it('execute returns true for /usage', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/usage') })
    expect(handled!).toBe(true)
  })
})

describe('useSlashAction /fork', () => {
  it('/fork calls forkTask on the selected task', () => {
    const forkSpy = vi.spyOn(useTaskStore.getState(), 'forkTask').mockResolvedValue(undefined)
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/fork') })
    expect(forkSpy).toHaveBeenCalledWith('task-1')
    forkSpy.mockRestore()
  })

  it('/fork does nothing when no task is selected', () => {
    useTaskStore.setState({ selectedTaskId: null })
    const forkSpy = vi.spyOn(useTaskStore.getState(), 'forkTask').mockResolvedValue(undefined)
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/fork') })
    expect(forkSpy).not.toHaveBeenCalled()
    forkSpy.mockRestore()
  })

  it('execute returns true for /fork', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/fork') })
    expect(handled!).toBe(true)
  })

  it('/fork clears panel', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/model') })
    expect(result.current.panel).toBe('model')
    act(() => { result.current.execute('/fork') })
    expect(result.current.panel).toBeNull()
  })
})

describe('createTask passes modeId', () => {
  it('includes modeId when currentModeId is kiro_planner', async () => {
    useSettingsStore.setState({ currentModeId: 'kiro_planner', activeWorkspace: '/ws' })
    const { currentModeId } = useSettingsStore.getState()
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined
    await ipc.createTask({ name: 'Test', workspace: '/ws', prompt: 'hello', modeId })
    expect(ipc.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: 'kiro_planner' }),
    )
  })

  it('omits modeId when currentModeId is kiro_default', async () => {
    useSettingsStore.setState({ currentModeId: 'kiro_default' })
    const { currentModeId } = useSettingsStore.getState()
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined
    await ipc.createTask({ name: 'Test', workspace: '/ws', prompt: 'hello', modeId })
    expect(ipc.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: undefined }),
    )
  })

  it('omits modeId when currentModeId is null', async () => {
    useSettingsStore.setState({ currentModeId: null })
    const { currentModeId } = useSettingsStore.getState()
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined
    await ipc.createTask({ name: 'Test', workspace: '/ws', prompt: 'hello', modeId })
    expect(ipc.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: undefined }),
    )
  })
})
