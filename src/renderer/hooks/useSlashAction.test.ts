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
    liveToolSplits: {},
    queuedMessages: {},
    activityFeed: [],
    connected: true,
    terminalOpenTasks: new Set(),
    projectNames: {},
    btwCheckpoint: null,
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
  it('/usage navigates to analytics view', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/usage') })
    expect(useTaskStore.getState().view).toBe('analytics')
  })

  it('/data navigates to analytics view', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/data') })
    expect(useTaskStore.getState().view).toBe('analytics')
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
    act(() => { result.current.execute('/branch') })
    expect(result.current.panel).toBe('branch')
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

describe('useSlashAction /branch', () => {
  it('/branch opens branch panel', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/branch') })
    expect(result.current.panel).toBe('branch')
  })

  it('/branch toggles panel off when already open', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/branch') })
    expect(result.current.panel).toBe('branch')
    act(() => { result.current.execute('/branch') })
    expect(result.current.panel).toBeNull()
  })

  it('execute returns true for /branch', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/branch') })
    expect(handled!).toBe(true)
  })
})

describe('useSlashAction /worktree', () => {
  it('/worktree opens worktree panel', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/worktree') })
    expect(result.current.panel).toBe('worktree')
  })

  it('/worktree toggles panel off when already open', () => {
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.execute('/worktree') })
    expect(result.current.panel).toBe('worktree')
    act(() => { result.current.execute('/worktree') })
    expect(result.current.panel).toBeNull()
  })

  it('execute returns true for /worktree', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/worktree') })
    expect(handled!).toBe(true)
  })
})

describe('useSlashAction /btw and /tangent', () => {
  it('execute returns false for /btw when not in btw mode (pass-through to insert /btw)', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/btw') })
    expect(handled!).toBe(false)
  })

  it('execute returns false for /tangent when not in btw mode', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/tangent') })
    expect(handled!).toBe(false)
  })

  it('/btw from picker exits btw mode if already active', () => {
    // Manually enter btw mode
    useTaskStore.getState().enterBtwMode('task-1', 'test question')
    expect(useTaskStore.getState().btwCheckpoint).not.toBeNull()
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.execute('/btw') })
    expect(handled!).toBe(true)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
  })

  it('executeFullInput enters btw mode with /btw <question>', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.executeFullInput('/btw what is useEffect?') })
    // Returns false so the caller sends the question as a message
    expect(handled!).toBe(false)
    expect(useTaskStore.getState().btwCheckpoint).not.toBeNull()
    expect(useTaskStore.getState().btwCheckpoint!.question).toBe('what is useEffect?')
  })

  it('executeFullInput enters btw mode with /tangent <question>', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.executeFullInput('/tangent what is useMemo?') })
    expect(handled!).toBe(false)
    expect(useTaskStore.getState().btwCheckpoint!.question).toBe('what is useMemo?')
  })

  it('executeFullInput exits btw mode when called without question', () => {
    useTaskStore.getState().enterBtwMode('task-1', 'test')
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.executeFullInput('/btw') })
    expect(handled!).toBe(true)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
  })

  it('executeFullInput exits with tail when /btw tail is used', () => {
    // Set up messages and enter btw mode
    useTaskStore.setState((s) => ({
      tasks: { ...s.tasks, 'task-1': { ...s.tasks['task-1'], messages: [
        { role: 'user', content: 'original', timestamp: '' },
      ] } },
    }))
    useTaskStore.getState().enterBtwMode('task-1', 'side q')
    // Simulate btw response added to messages
    useTaskStore.setState((s) => ({
      tasks: { ...s.tasks, 'task-1': { ...s.tasks['task-1'], messages: [
        { role: 'user', content: 'original', timestamp: '' },
        { role: 'user', content: 'side q', timestamp: '' },
        { role: 'assistant', content: 'side answer', timestamp: '' },
      ] } },
    }))
    const { result } = renderHook(() => useSlashAction())
    act(() => { result.current.executeFullInput('/btw tail') })
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
    // Original message + tail Q&A preserved
    const msgs = useTaskStore.getState().tasks['task-1'].messages
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toBe('original')
    expect(msgs[1].content).toBe('side q')
    expect(msgs[2].content).toBe('side answer')
  })

  it('executeFullInput returns false for non-btw commands', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.executeFullInput('/plan') })
    expect(handled!).toBe(false)
  })

  it('executeFullInput is no-op when no question and not in btw mode', () => {
    const { result } = renderHook(() => useSlashAction())
    let handled: boolean
    act(() => { handled = result.current.executeFullInput('/btw') })
    // No checkpoint, no question — returns true (handled, but no-op)
    expect(handled!).toBe(true)
    expect(useTaskStore.getState().btwCheckpoint).toBeNull()
  })
})
