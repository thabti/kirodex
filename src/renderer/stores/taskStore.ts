import { create } from 'zustand'
import type { AgentTask, ActivityEntry, ToolCall, PlanStep } from '@/types'
import { ipc } from '@/lib/ipc'
import { useDebugStore } from './debugStore'
import { useSettingsStore } from './settingsStore'
import { useDiffStore } from './diffStore'
import { useKiroStore } from './kiroStore'

interface TaskStore {
  tasks: Record<string, AgentTask>
  projects: string[]           // workspace paths
  selectedTaskId: string | null
  pendingWorkspace: string | null  // workspace for a new thread not yet created
  view: 'chat' | 'dashboard' | 'playground'
  isNewProjectOpen: boolean
  isSettingsOpen: boolean
  /** Accumulated text chunks for streaming display */
  streamingChunks: Record<string, string>
  /** Accumulated thinking chunks for live thinking display */
  thinkingChunks: Record<string, string>
  /** Live tool calls for the current turn (by taskId) */
  liveToolCalls: Record<string, ToolCall[]>
  activityFeed: ActivityEntry[]
  connected: boolean
  terminalOpen: boolean
  setSelectedTask: (id: string | null) => void
  setView: (view: 'chat' | 'dashboard' | 'playground') => void
  setNewProjectOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  addProject: (workspace: string) => void
  removeProject: (workspace: string) => void
  archiveThreads: (workspace: string) => void
  upsertTask: (task: AgentTask) => void
  removeTask: (id: string) => void
  appendChunk: (taskId: string, chunk: string) => void
  appendThinkingChunk: (taskId: string, chunk: string) => void
  upsertToolCall: (taskId: string, toolCall: ToolCall) => void
  updatePlan: (taskId: string, plan: PlanStep[]) => void
  updateUsage: (taskId: string, used: number, size: number) => void
  clearTurn: (taskId: string) => void
  createDraftThread: (workspace: string) => string
  setPendingWorkspace: (workspace: string | null) => void
  renameTask: (taskId: string, name: string) => void
  projectNames: Record<string, string>
  renameProject: (workspace: string, name: string) => void
  toggleTerminal: () => void
  loadTasks: () => Promise<void>
  setConnected: (v: boolean) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: {},
  projects: [],
  projectNames: {},
  selectedTaskId: null,
  pendingWorkspace: null,
  view: 'chat',
  isNewProjectOpen: false,
  isSettingsOpen: false,
  streamingChunks: {},
  thinkingChunks: {},
  liveToolCalls: {},
  activityFeed: [],
  connected: false,
  terminalOpen: false,

  setSelectedTask: (id) => {
    if (get().selectedTaskId === id) return
    set({ selectedTaskId: id })
  },
  setView: (view) => {
    if (get().view === view) return
    set({ view })
  },
  setNewProjectOpen: (open) => set({ isNewProjectOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  addProject: (workspace) => {
    if (get().projects.includes(workspace)) return
    set((s) => ({ projects: [...s.projects, workspace] }))
  },

  removeProject: (workspace) => set((s) => {
    const taskIds = Object.keys(s.tasks).filter((id) => s.tasks[id].workspace === workspace)
    const tasks = { ...s.tasks }
    taskIds.forEach((id) => { delete tasks[id] })
    taskIds.forEach((id) => { void ipc.cancelTask(id).catch(() => {}) })
    taskIds.forEach((id) => { void ipc.deleteTask(id) })
    const selectedTaskId = taskIds.includes(s.selectedTaskId ?? '') ? null : s.selectedTaskId
    return {
      projects: s.projects.filter((p) => p !== workspace),
      tasks,
      selectedTaskId,
      view: selectedTaskId === null && s.view === 'chat' ? 'dashboard' : s.view,
    }
  }),

  archiveThreads: (workspace) => set((s) => {
    const taskIds = Object.keys(s.tasks).filter((id) => s.tasks[id].workspace === workspace)
    const tasks = { ...s.tasks }
    taskIds.forEach((id) => { delete tasks[id] })
    taskIds.forEach((id) => { void ipc.cancelTask(id).catch(() => {}) })
    taskIds.forEach((id) => { void ipc.deleteTask(id) })
    const selectedTaskId = taskIds.includes(s.selectedTaskId ?? '') ? null : s.selectedTaskId
    return {
      tasks,
      selectedTaskId,
      view: selectedTaskId === null && s.view === 'chat' ? 'dashboard' : s.view,
    }
  }),

  upsertTask: (task) =>
    set((state) => {
      const prev = state.tasks[task.id]
      // Always preserve existing messages when incoming has fewer.
      // Backend task_update events arrive with messages: [] (stripped at listener).
      // Only frontend callers (onTurnEnd, handleSendMessage) pass real messages.
      const messages = prev && prev.messages.length > task.messages.length
        ? prev.messages
        : task.messages
      // Bail out if nothing meaningful changed
      if (prev
        && prev.status === task.status
        && prev.messages === messages
        && prev.name === task.name
        && prev.pendingPermission === task.pendingPermission
        && prev.plan === task.plan
        && prev.contextUsage === task.contextUsage
      ) {
        return state
      }
      const merged = { ...task, messages }
      const activity: ActivityEntry[] =
        !prev || prev.status !== task.status
          ? [
              {
                taskId: task.id,
                taskName: task.name,
                status: task.status,
                timestamp: new Date().toISOString(),
              },
              ...state.activityFeed,
            ].slice(0, 20)
          : state.activityFeed
      return {
        tasks: { ...state.tasks, [task.id]: merged },
        activityFeed: activity,
      }
    }),

  removeTask: (id) =>
    set((state) => {
      if (!state.tasks[id]) return state
      const { [id]: _, ...rest } = state.tasks
      const { [id]: _c, ...chunks } = state.streamingChunks
      const { [id]: _t, ...thinking } = state.thinkingChunks
      const { [id]: _tc, ...tools } = state.liveToolCalls
      return {
        tasks: rest,
        streamingChunks: chunks,
        thinkingChunks: thinking,
        liveToolCalls: tools,
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }
    }),

  appendChunk: (taskId, chunk) =>
    set((state) => ({
      streamingChunks: {
        ...state.streamingChunks,
        [taskId]: (state.streamingChunks[taskId] ?? '') + chunk,
      },
    })),

  appendThinkingChunk: (taskId, chunk) =>
    set((state) => ({
      thinkingChunks: {
        ...state.thinkingChunks,
        [taskId]: (state.thinkingChunks[taskId] ?? '') + chunk,
      },
    })),

  upsertToolCall: (taskId, toolCall) =>
    set((state) => {
      const existing = state.liveToolCalls[taskId] ?? []
      const idx = existing.findIndex((tc) => tc.toolCallId === toolCall.toolCallId)
      if (idx >= 0 && existing[idx].status === toolCall.status && existing[idx].content === toolCall.content) {
        return state
      }
      const updated = idx >= 0
        ? existing.map((tc, i) => (i === idx ? toolCall : tc))
        : [...existing, toolCall]
      return {
        liveToolCalls: { ...state.liveToolCalls, [taskId]: updated },
      }
    }),

  updatePlan: (taskId, plan) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.plan === plan) return state
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, plan } },
      }
    }),

  updateUsage: (taskId, used, size) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      const cu = task.contextUsage
      if (cu && cu.used === used && cu.size === size) return state
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, contextUsage: { used, size } } },
      }
    }),

  clearTurn: (taskId) =>
    set((state) => {
      const hasChunks = !!state.streamingChunks[taskId]
      const hasThinking = !!state.thinkingChunks[taskId]
      const hasTools = state.liveToolCalls[taskId]?.length > 0
      if (!hasChunks && !hasThinking && !hasTools) return state
      return {
        streamingChunks: { ...state.streamingChunks, [taskId]: '' },
        thinkingChunks: { ...state.thinkingChunks, [taskId]: '' },
        liveToolCalls: { ...state.liveToolCalls, [taskId]: [] },
      }
    }),

  createDraftThread: (workspace) => {
    const id = crypto.randomUUID()
    const name = `Thread ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    const draft: AgentTask = {
      id,
      name,
      workspace,
      status: 'paused',
      createdAt: new Date().toISOString(),
      messages: [],
    }
    set((state) => ({
      tasks: { ...state.tasks, [id]: draft },
      selectedTaskId: id,
      view: 'chat' as const,
      activityFeed: [
        { taskId: id, taskName: name, status: 'paused' as const, timestamp: draft.createdAt },
        ...state.activityFeed,
      ].slice(0, 20),
    }))
    return id
  },

  setPendingWorkspace: (workspace) => set({
    pendingWorkspace: workspace,
    selectedTaskId: null,
    view: 'chat' as const,
  }),

  renameTask: (taskId, name) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.name === name) return state
      return { tasks: { ...state.tasks, [taskId]: { ...task, name } } }
    }),

  renameProject: (workspace, name) =>
    set((state) => {
      if (state.projectNames[workspace] === name) return state
      return { projectNames: { ...state.projectNames, [workspace]: name } }
    }),

  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),

  loadTasks: async () => {
    try {
      const list = await ipc.listTasks()
      const tasks = Object.fromEntries(list.map((t) => [t.id, t]))
      const projects = [...new Set(list.map((t) => t.workspace))]
      set({ tasks, projects, connected: true })
    } catch {
      set({ connected: false })
    }
  },

  setConnected: (v) => {
    if (get().connected === v) return
    set({ connected: v })
  },
}))

export function initTaskListeners(): () => void {
  useTaskStore.getState().setConnected(true)

  const unsub1 = ipc.onTaskUpdate((task) => {
    // Strip messages from backend updates — the frontend is the sole source of truth
    // for conversation history. The backend only tracks user messages, never assistant
    // responses, tool calls, or system messages.
    useTaskStore.getState().upsertTask({ ...task, messages: [] })
  })

  // Batch streaming chunks with rAF to reduce state updates
  let chunkBuf: Record<string, string> = {}
  let chunkRaf: number | null = null
  const flushChunks = () => {
    const buf = chunkBuf; chunkBuf = {}; chunkRaf = null
    useTaskStore.setState((s) => {
      const next = { ...s.streamingChunks }
      for (const [id, text] of Object.entries(buf)) next[id] = (next[id] ?? '') + text
      return { streamingChunks: next }
    })
  }
  const unsub2 = ipc.onMessageChunk(({ taskId, chunk }) => {
    chunkBuf[taskId] = (chunkBuf[taskId] ?? '') + chunk
    if (!chunkRaf) chunkRaf = requestAnimationFrame(flushChunks)
  })

  let thinkBuf: Record<string, string> = {}
  let thinkRaf: number | null = null
  const flushThinking = () => {
    const buf = thinkBuf; thinkBuf = {}; thinkRaf = null
    useTaskStore.setState((s) => {
      const next = { ...s.thinkingChunks }
      for (const [id, text] of Object.entries(buf)) next[id] = (next[id] ?? '') + text
      return { thinkingChunks: next }
    })
  }
  const unsub3 = ipc.onThinkingChunk(({ taskId, chunk }) => {
    thinkBuf[taskId] = (thinkBuf[taskId] ?? '') + chunk
    if (!thinkRaf) thinkRaf = requestAnimationFrame(flushThinking)
  })

  const unsub4 = ipc.onToolCall(({ taskId, toolCall }) => {
    useTaskStore.getState().upsertToolCall(taskId, toolCall)
  })

  const unsub5 = ipc.onToolCallUpdate(({ taskId, toolCall }) => {
    useTaskStore.getState().upsertToolCall(taskId, toolCall)
    if (
      toolCall.status === 'completed' &&
      (toolCall.kind === 'edit' || toolCall.kind === 'delete' || toolCall.kind === 'move')
    ) {
      useDiffStore.getState().fetchDiff(taskId)
    }
  })

  const unsub6 = ipc.onPlanUpdate(({ taskId, plan }) => {
    useTaskStore.getState().updatePlan(taskId, plan)
  })

  const unsub7 = ipc.onUsageUpdate(({ taskId, used, size }) => {
    useTaskStore.getState().updateUsage(taskId, used, size)
  })

  const unsub8 = ipc.onTurnEnd(({ taskId }) => {
    // Use a single setState to avoid stale reads between getState() calls
    useTaskStore.setState((s) => {
      const chunk = s.streamingChunks[taskId] ?? ''
      const thinking = s.thinkingChunks[taskId] ?? ''
      const liveTools = s.liveToolCalls[taskId] ?? []
      const task = s.tasks[taskId]
      if (!task) return s
      let updatedTask: AgentTask
      if (chunk || liveTools.length > 0) {
        const assistantMsg: import('@/types').TaskMessage = {
          role: 'assistant' as const,
          content: chunk,
          timestamp: new Date().toISOString(),
          ...(thinking ? { thinking } : {}),
          ...(liveTools.length > 0 ? { toolCalls: liveTools } : {}),
        }
        updatedTask = {
          ...task,
          status: 'paused',
          messages: [...task.messages, assistantMsg],
          pendingPermission: undefined,
        }
      } else {
        updatedTask = { ...task, status: 'paused' }
      }
      return {
        tasks: { ...s.tasks, [taskId]: updatedTask },
        streamingChunks: { ...s.streamingChunks, [taskId]: '' },
        thinkingChunks: { ...s.thinkingChunks, [taskId]: '' },
        liveToolCalls: { ...s.liveToolCalls, [taskId]: [] },
      }
    })
  })

  const unsub9 = ipc.onDebugLog((entry) => {
    useDebugStore.getState().addEntry(entry)
    if (entry.category === 'stderr') {
      const text = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload)
      if (text.includes('Dynamic registration failed') || text.includes('invalid_redirect_uri')) {
        const knownServers = ['slack', 'figma', 'github', 'notion', 'linear', 'jira', 'atlassian']
        const serverName = entry.mcpServerName
          ?? knownServers.find((s) => text.toLowerCase().includes(s))
          ?? 'unknown'
        useKiroStore.getState().setMcpError(serverName, 'OAuth setup needed — add http://127.0.0.1 as a redirect URI in your OAuth app, or disable in ~/.kiro/settings/mcp.json')
      }
    }
  })

  const unsub10 = ipc.onSessionInit(({ taskId, models, modes }) => {
    console.log('[session_init] received', { taskId, models, modes })
    if (models && typeof models === 'object') {
      const m = models as { availableModels?: Array<{ modelId: string; name: string; description?: string | null }>; currentModelId?: string }
      if (m.availableModels) {
        const existingModel = useSettingsStore.getState().currentModelId
        const validExistingModel = existingModel && m.availableModels.some((mod) => mod.modelId === existingModel)
        useSettingsStore.setState({
          availableModels: m.availableModels,
          ...(validExistingModel ? {} : { currentModelId: m.currentModelId ?? null }),
        })
      }
    }
    if (modes && typeof modes === 'object') {
      const md = modes as { availableModes?: Array<{ id: string; name: string; description?: string | null }>; currentModeId?: string }
      if (md.availableModes) {
        const existingMode = useSettingsStore.getState().currentModeId
        const validExistingMode = existingMode && md.availableModes.some((m) => m.id === existingMode)
        useSettingsStore.setState({
          availableModes: md.availableModes,
          ...(validExistingMode ? {} : { currentModeId: md.currentModeId ?? null }),
        })
        if (validExistingMode && existingMode !== md.currentModeId && taskId !== '__probe__') {
          ipc.setMode(taskId, existingMode).catch(() => {})
        }
      }
    }
  })

  const unsub11 = ipc.onCommandsUpdate(({ commands, mcpServers }) => {
    useSettingsStore.setState({
      availableCommands: commands,
      ...(mcpServers ? { liveMcpServers: mcpServers } : {}),
    })
  })

  const unsub12 = ipc.onTaskError(({ taskId, message }) => {
    useTaskStore.setState((s) => {
      const task = s.tasks[taskId]
      if (!task) return s
      const errorMsg: import('@/types').TaskMessage = {
        role: 'system' as const,
        content: `\u26a0\ufe0f ${message}`,
        timestamp: new Date().toISOString(),
      }
      return {
        tasks: { ...s.tasks, [taskId]: { ...task, messages: [...task.messages, errorMsg], status: 'error' } },
        streamingChunks: { ...s.streamingChunks, [taskId]: '' },
        thinkingChunks: { ...s.thinkingChunks, [taskId]: '' },
        liveToolCalls: { ...s.liveToolCalls, [taskId]: [] },
      }
    })
  })

  return () => {
    unsub1(); unsub2(); unsub3(); unsub4(); unsub5()
    unsub6(); unsub7(); unsub8(); unsub9(); unsub10(); unsub11(); unsub12()
  }
}
