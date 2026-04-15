import { create } from 'zustand'
import type { AgentTask, ActivityEntry, ToolCall, PlanStep, SoftDeletedThread } from '@/types'
import { ipc } from '@/lib/ipc'
import { joinChunk } from '@/lib/utils'
import * as historyStore from '@/lib/history-store'
import { useDebugStore } from './debugStore'
import { useSettingsStore } from './settingsStore'
import { useDiffStore } from './diffStore'
import { useKiroStore } from './kiroStore'
import { track } from '@/lib/analytics'
import { sendTaskNotification } from '@/lib/notifications'

interface TaskStore {
  tasks: Record<string, AgentTask>
  projects: string[]           // workspace paths
  /** Maps workspace path → stable UUID for project identity */
  projectIds: Record<string, string>
  deletedTaskIds: Set<string>  // guard against backend re-adding deleted tasks
  softDeleted: Record<string, SoftDeletedThread>  // threads pending permanent deletion
  selectedTaskId: string | null
  pendingWorkspace: string | null  // workspace for a new thread not yet created
  view: 'chat' | 'dashboard'
  isNewProjectOpen: boolean
  isSettingsOpen: boolean
  settingsInitialSection: string | null
  /** Accumulated text chunks for streaming display */
  streamingChunks: Record<string, string>
  /** Accumulated thinking chunks for live thinking display */
  thinkingChunks: Record<string, string>
  /** Live tool calls for the current turn (by taskId) */
  liveToolCalls: Record<string, ToolCall[]>
  /** Queued messages per task — typed while agent is running, sent on turn end */
  queuedMessages: Record<string, string[]>
  activityFeed: ActivityEntry[]
  connected: boolean
  terminalOpenTasks: Set<string>
  /** Workspace-level terminal open state (for PendingChat when no task is selected) */
  isWorkspaceTerminalOpen: boolean
  /** Per-workspace draft text (in-memory only, not persisted to disk) */
  drafts: Record<string, string>
  /** One-shot guard: workspace whose next setDraft call should be suppressed */
  _suppressDraftSave: string | null
  /** Task IDs from desktop notifications pending click-to-navigate */
  notifiedTaskIds: string[]
  /** Per-thread mode (e.g. 'kiro_planner') so toggling plan mode in one thread doesn't affect others */
  taskModes: Record<string, string>
  /** Whether a fork operation is in progress */
  isForking: boolean
  /** Pending worktree cleanup — set when a worktree thread is being deleted/archived */
  worktreeCleanupPending: { taskId: string; worktreePath: string; branch: string; originalWorkspace: string; action: 'archive' | 'delete'; hasChanges: boolean | null } | null
  setSelectedTask: (id: string | null) => void
  setView: (view: 'chat' | 'dashboard') => void
  setNewProjectOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean, section?: string | null) => void
  addProject: (workspace: string) => void
  /** Returns the stable UUID for a workspace, generating one if needed */
  getProjectId: (workspace: string) => string
  removeProject: (workspace: string) => void
  archiveThreads: (workspace: string) => void
  upsertTask: (task: AgentTask) => void
  removeTask: (id: string) => void
  archiveTask: (id: string) => void
  softDeleteTask: (id: string) => void
  restoreTask: (id: string) => void
  permanentlyDeleteTask: (id: string) => void
  purgeExpiredSoftDeletes: () => void
  appendChunk: (taskId: string, chunk: string) => void
  appendThinkingChunk: (taskId: string, chunk: string) => void
  upsertToolCall: (taskId: string, toolCall: ToolCall) => void
  updatePlan: (taskId: string, plan: PlanStep[]) => void
  updateUsage: (taskId: string, used: number, size: number) => void
  updateCompactionStatus: (taskId: string, status: import('@/types').CompactionStatus, summary?: string) => void
  clearTurn: (taskId: string) => void
  enqueueMessage: (taskId: string, message: string) => void
  dequeueMessages: (taskId: string) => string[]
  removeQueuedMessage: (taskId: string, index: number) => void
  reorderQueuedMessage: (taskId: string, from: number, to: number) => void
  createDraftThread: (workspace: string) => string
  setPendingWorkspace: (workspace: string | null) => void
  renameTask: (taskId: string, name: string) => void
  forkTask: (taskId: string) => Promise<void>
  projectNames: Record<string, string>
  reorderProject: (from: number, to: number) => void
  setDraft: (workspace: string, content: string) => void
  removeDraft: (workspace: string) => void
  toggleTerminal: (taskId: string) => void
  toggleWorkspaceTerminal: () => void
  setTaskMode: (taskId: string, modeId: string) => void
  loadTasks: () => Promise<void>
  setConnected: (v: boolean) => void
  persistHistory: () => void
  clearHistory: () => Promise<void>
  resolveWorktreeCleanup: (remove: boolean) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: {},
  projects: [],
  projectIds: {},
  projectNames: {},
  deletedTaskIds: new Set<string>(),
  softDeleted: {},
  selectedTaskId: null,
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
  connected: false,
  terminalOpenTasks: new Set<string>(),
  isWorkspaceTerminalOpen: false,
  drafts: {},
  _suppressDraftSave: null,
  notifiedTaskIds: [],
  taskModes: {},
  isForking: false,
  worktreeCleanupPending: null,

  setSelectedTask: (id) => {
    if (get().selectedTaskId === id) return
    set({ selectedTaskId: id })
    const task = id ? get().tasks[id] : null
    const modeId = id ? (get().taskModes[id] ?? 'kiro_default') : 'kiro_default'
    const workspace = task ? (task.originalWorkspace ?? task.workspace) : null
    const operationalWs = task ? task.workspace : null
    useSettingsStore.getState().setActiveWorkspace(workspace, operationalWs)
    useSettingsStore.setState({ currentModeId: modeId })
  },
  setView: (view) => {
    if (get().view === view) return
    set({ view })
  },
  setNewProjectOpen: (open) => set({ isNewProjectOpen: open }),
  setSettingsOpen: (open, section) => set({ isSettingsOpen: open, settingsInitialSection: section ?? null }),
  addProject: (workspace) => {
    if (get().projects.includes(workspace)) return
    if (workspace.includes('/.kiro/worktrees/')) return
    const id = crypto.randomUUID()
    set((s) => ({
      projects: [...s.projects, workspace],
      projectIds: { ...s.projectIds, [workspace]: id },
    }))
  },
  getProjectId: (workspace) => {
    const existing = get().projectIds[workspace]
    if (existing) return existing
    const id = crypto.randomUUID()
    set((s) => ({ projectIds: { ...s.projectIds, [workspace]: id } }))
    return id
  },

  removeProject: (workspace) => set((s) => {
    const taskIds = Object.keys(s.tasks).filter((id) => {
      const t = s.tasks[id]
      const ws = t.originalWorkspace ?? t.workspace
      return ws === workspace
    })
    const tasks = { ...s.tasks }
    const softDeleted = { ...s.softDeleted }
    const now = new Date().toISOString()
    taskIds.forEach((id) => {
      softDeleted[id] = { task: { ...tasks[id], isArchived: true, status: 'completed' }, deletedAt: now }
      delete tasks[id]
    })
    taskIds.forEach((id) => { void ipc.cancelTask(id).catch(() => {}) })
    taskIds.forEach((id) => { void ipc.deleteTask(id) })
    const selectedTaskId = taskIds.includes(s.selectedTaskId ?? '') ? null : s.selectedTaskId
    const deletedTaskIds = new Set(s.deletedTaskIds)
    taskIds.forEach((id) => deletedTaskIds.add(id))
    const { [workspace]: _, ...drafts } = s.drafts
    const taskModes = { ...s.taskModes }
    taskIds.forEach((id) => { delete taskModes[id] })
    return {
      projects: s.projects.filter((p) => p !== workspace),
      tasks,
      softDeleted,
      selectedTaskId,
      deletedTaskIds,
      drafts,
      taskModes,
      pendingWorkspace: s.pendingWorkspace === workspace ? null : s.pendingWorkspace,
      view: selectedTaskId === null && s.view === 'chat' ? 'dashboard' : s.view,
    }
  }),

  archiveThreads: (workspace) => set((s) => {
    const taskIds = Object.keys(s.tasks).filter((id) => {
      const t = s.tasks[id]
      const ws = t.originalWorkspace ?? t.workspace
      return ws === workspace
    })
    const tasks = { ...s.tasks }
    const softDeleted = { ...s.softDeleted }
    const now = new Date().toISOString()
    taskIds.forEach((id) => {
      softDeleted[id] = { task: { ...tasks[id], isArchived: true, status: 'completed' }, deletedAt: now }
      delete tasks[id]
    })
    taskIds.forEach((id) => { void ipc.cancelTask(id).catch(() => {}) })
    taskIds.forEach((id) => { void ipc.deleteTask(id) })
    const selectedTaskId = taskIds.includes(s.selectedTaskId ?? '') ? null : s.selectedTaskId
    const deletedTaskIds = new Set(s.deletedTaskIds)
    taskIds.forEach((id) => deletedTaskIds.add(id))
    return {
      tasks,
      softDeleted,
      selectedTaskId,
      deletedTaskIds,
      view: selectedTaskId === null && s.view === 'chat' ? 'dashboard' : s.view,
    }
  }),

  upsertTask: (task) => {
    set((state) => {
      // Don't re-add tasks that were explicitly deleted
      if (state.deletedTaskIds.has(task.id)) return state
      const prev = state.tasks[task.id]
      // Always preserve existing messages when incoming has fewer.
      // Backend task_update events arrive with messages: [] (stripped at listener).
      // Only frontend callers (onTurnEnd, handleSendMessage) pass real messages.
      const messages = prev && prev.messages.length > task.messages.length
        ? prev.messages
        : task.messages
      // Preserve client-side name: backend task_update events carry the stale
      // creation-time name and are unaware of user renames via renameTask().
      const name = prev ? prev.name : task.name
      // Bail out if nothing meaningful changed
      if (prev
        && prev.status === task.status
        && prev.messages === messages
        && prev.name === name
        && prev.pendingPermission === task.pendingPermission
        && prev.plan === task.plan
        && prev.contextUsage === task.contextUsage
        && prev.worktreePath === (task.worktreePath ?? prev.worktreePath)
        && prev.originalWorkspace === (task.originalWorkspace ?? prev.originalWorkspace)
        && prev.projectId === (task.projectId ?? prev.projectId)
      ) {
        return state
      }
      // Preserve client-only fields that the backend doesn't track
      const merged = {
        ...task,
        messages,
        name,
        ...(prev?.parentTaskId && !task.parentTaskId ? { parentTaskId: prev.parentTaskId } : {}),
        ...(prev?.worktreePath && !task.worktreePath ? { worktreePath: prev.worktreePath } : {}),
        ...(prev?.originalWorkspace && !task.originalWorkspace ? { originalWorkspace: prev.originalWorkspace } : {}),
        ...(prev?.projectId && !task.projectId ? { projectId: prev.projectId } : {}),
      }
      const statusChanged = !prev || prev.status !== task.status
      if (statusChanged && (task.status === 'completed' || task.status === 'error' || task.status === 'cancelled')) {
        track('task_completed', { status: task.status })
      }
      const activity: ActivityEntry[] = statusChanged
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
    })
    // Notify on permission requests while backgrounded
    if (task.pendingPermission) {
      const prev = get().tasks[task.id]
      // Only fire if this is a new permission (not already notified)
      if (!prev || prev.pendingPermission?.requestId !== task.pendingPermission.requestId) {
        const permSettings = useSettingsStore.getState().settings
        sendTaskNotification({
          task,
          status: 'permission',
          isNotificationsEnabled: permSettings.notifications ?? true,
          isSoundEnabled: permSettings.soundNotifications ?? true,
          onNotified: (tid) => {
            set((s) => ({
              notifiedTaskIds: s.notifiedTaskIds.includes(tid) ? s.notifiedTaskIds : [...s.notifiedTaskIds, tid],
            }))
          },
        })
      }
    }
  },

  removeTask: (id) => {
    get().softDeleteTask(id)
  },

  archiveTask: (id) => {
    const task = get().tasks[id]
    if (!task || task.isArchived) return
    // Worktree threads: show confirmation dialog BEFORE deleting
    if (task.worktreePath && task.originalWorkspace) {
      const branch = task.worktreePath.split('/').pop() ?? 'unknown'
      // Set pending immediately with hasChanges=null (loading), then check async
      set({ worktreeCleanupPending: { taskId: id, worktreePath: task.worktreePath, branch, originalWorkspace: task.originalWorkspace, action: 'archive', hasChanges: null } })
      void ipc.gitWorktreeHasChanges(task.worktreePath).then((hasChanges) => {
        set((s) => s.worktreeCleanupPending?.taskId === id
          ? { worktreeCleanupPending: { ...s.worktreeCleanupPending!, hasChanges } }
          : s)
      }).catch(() => {
        set((s) => s.worktreeCleanupPending?.taskId === id
          ? { worktreeCleanupPending: { ...s.worktreeCleanupPending!, hasChanges: false } }
          : s)
      })
      return
    }
    // Non-worktree: proceed immediately
    void ipc.cancelTask(id).catch(() => {})
    set((s) => ({
      tasks: { ...s.tasks, [id]: { ...s.tasks[id], isArchived: true, status: 'completed' } },
      streamingChunks: { ...s.streamingChunks, [id]: '' },
      thinkingChunks: { ...s.thinkingChunks, [id]: '' },
      liveToolCalls: { ...s.liveToolCalls, [id]: [] },
    }))
    void ipc.deleteTask(id)
    get().persistHistory()
  },

  softDeleteTask: (id) => {
    const task = get().tasks[id]
    if (!task) return
    // Worktree threads: show confirmation dialog BEFORE deleting
    if (task.worktreePath && task.originalWorkspace) {
      const branch = task.worktreePath.split('/').pop() ?? 'unknown'
      set({ worktreeCleanupPending: { taskId: id, worktreePath: task.worktreePath, branch, originalWorkspace: task.originalWorkspace, action: 'delete', hasChanges: null } })
      void ipc.gitWorktreeHasChanges(task.worktreePath).then((hasChanges) => {
        set((s) => s.worktreeCleanupPending?.taskId === id
          ? { worktreeCleanupPending: { ...s.worktreeCleanupPending!, hasChanges } }
          : s)
      }).catch(() => {
        set((s) => s.worktreeCleanupPending?.taskId === id
          ? { worktreeCleanupPending: { ...s.worktreeCleanupPending!, hasChanges: false } }
          : s)
      })
      return
    }
    // Non-worktree: proceed immediately
    void ipc.cancelTask(id).catch(() => {})
    void ipc.deleteTask(id)
    set((state) => {
      const { [id]: removed, ...rest } = state.tasks
      const { [id]: _c, ...chunks } = state.streamingChunks
      const { [id]: _t, ...thinking } = state.thinkingChunks
      const { [id]: _tc, ...tools } = state.liveToolCalls
      const { [id]: _m, ...modes } = state.taskModes
      const deletedTaskIds = new Set(state.deletedTaskIds)
      deletedTaskIds.add(id)
      const softDeleted = {
        ...state.softDeleted,
        [id]: { task: { ...removed, isArchived: true, status: 'completed' as const }, deletedAt: new Date().toISOString() },
      }
      return {
        tasks: rest,
        streamingChunks: chunks,
        thinkingChunks: thinking,
        liveToolCalls: tools,
        taskModes: modes,
        deletedTaskIds,
        softDeleted,
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }
    })
    get().persistHistory()
  },

  restoreTask: (id) => {
    const entry = get().softDeleted[id]
    if (!entry) return
    set((state) => {
      const { [id]: _, ...remaining } = state.softDeleted
      const deletedTaskIds = new Set(state.deletedTaskIds)
      deletedTaskIds.delete(id)
      const projectWorkspace = entry.task.originalWorkspace ?? entry.task.workspace
      const projects = state.projects.includes(projectWorkspace)
        ? state.projects
        : [...state.projects, projectWorkspace]
      return {
        tasks: { ...state.tasks, [id]: entry.task },
        softDeleted: remaining,
        deletedTaskIds,
        projects,
      }
    })
    get().persistHistory()
  },

  permanentlyDeleteTask: (id) => {
    if (!get().softDeleted[id]) return
    set((state) => {
      const { [id]: _, ...remaining } = state.softDeleted
      const deletedTaskIds = new Set(state.deletedTaskIds)
      deletedTaskIds.add(id)
      return { softDeleted: remaining, deletedTaskIds }
    })
    get().persistHistory()
  },

  purgeExpiredSoftDeletes: () => {
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000
    const now = Date.now()
    const { softDeleted } = get()
    const expiredIds = Object.keys(softDeleted).filter(
      (id) => now - new Date(softDeleted[id].deletedAt).getTime() >= TWO_DAYS_MS,
    )
    if (expiredIds.length === 0) return
    set((state) => {
      const next = { ...state.softDeleted }
      const deletedTaskIds = new Set(state.deletedTaskIds)
      for (const id of expiredIds) {
        delete next[id]
        deletedTaskIds.add(id)
      }
      return { softDeleted: next, deletedTaskIds }
    })
    get().persistHistory()
  },

  appendChunk: (taskId, chunk) =>
    set((state) => ({
      streamingChunks: {
        ...state.streamingChunks,
        [taskId]: joinChunk(state.streamingChunks[taskId] ?? '', chunk),
      },
    })),

  appendThinkingChunk: (taskId, chunk) =>
    set((state) => ({
      thinkingChunks: {
        ...state.thinkingChunks,
        [taskId]: joinChunk(state.thinkingChunks[taskId] ?? '', chunk),
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
      // Reset compaction status to idle when new usage arrives post-compaction
      const resetCompaction = task.compactionStatus === 'completed' || task.compactionStatus === 'failed'
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, contextUsage: { used, size }, ...(resetCompaction ? { compactionStatus: 'idle' as const } : {}) } },
      }
    }),

  updateCompactionStatus: (taskId, status, summary) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      if (task.compactionStatus === status) return state
      const messages = [...task.messages]
      if (status === 'compacting') {
        // Inject plan text so the backend summary includes it
        if (task.plan && task.plan.length > 0) {
          const planText = task.plan.map((s, i) => `${i + 1}. [${s.status}] ${s.content}`).join('\n')
          messages.push({
            role: 'system' as const,
            content: `⏳ Compacting context...\n\n**Plan to preserve:**\n${planText}`,
            timestamp: new Date().toISOString(),
          })
        } else {
          messages.push({
            role: 'system' as const,
            content: '⏳ Compacting context...',
            timestamp: new Date().toISOString(),
          })
        }
      } else if (status === 'completed') {
        const hasPlan = task.plan && task.plan.length > 0
        messages.push({
          role: 'system' as const,
          content: hasPlan ? '✅ Context compacted — plan preserved' : '✅ Context compacted',
          timestamp: new Date().toISOString(),
        })
      } else if (status === 'failed') {
        messages.push({
          role: 'system' as const,
          content: '⚠️ Context compaction failed',
          timestamp: new Date().toISOString(),
        })
      }
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, compactionStatus: status, messages } },
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

  enqueueMessage: (taskId, message) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [taskId]: [...(state.queuedMessages[taskId] ?? []), message],
      },
    })),

  dequeueMessages: (taskId) => {
    const msgs = get().queuedMessages[taskId] ?? []
    if (msgs.length > 0) {
      set((state) => ({
        queuedMessages: { ...state.queuedMessages, [taskId]: [] },
      }))
    }
    return msgs
  },

  removeQueuedMessage: (taskId, index) =>
    set((state) => {
      const queue = state.queuedMessages[taskId] ?? []
      if (index < 0 || index >= queue.length) return state
      return {
        queuedMessages: {
          ...state.queuedMessages,
          [taskId]: queue.filter((_, i) => i !== index),
        },
      }
    }),

  reorderQueuedMessage: (taskId, from, to) =>
    set((state) => {
      const queue = [...(state.queuedMessages[taskId] ?? [])]
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return state
      const [item] = queue.splice(from, 1)
      queue.splice(to, 0, item)
      return { queuedMessages: { ...state.queuedMessages, [taskId]: queue } }
    }),

  createDraftThread: (workspace) => {
    const id = crypto.randomUUID()
    const name = `Thread ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    const draft: AgentTask = {
      id,
      name,
      workspace,
      projectId: get().getProjectId(workspace),
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
    track('task_created', { has_prompt: false })
    return id
  },

  setPendingWorkspace: (workspace) => {
    set({
      pendingWorkspace: workspace,
      selectedTaskId: null,
      view: 'chat' as const,
    })
    useSettingsStore.getState().setActiveWorkspace(workspace, workspace)
    useSettingsStore.setState({ currentModeId: 'kiro_default' })
  },

  renameTask: (taskId, name) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.name === name) return state
      return { tasks: { ...state.tasks, [taskId]: { ...task, name } } }
    })
    get().persistHistory()
  },

  forkTask: async (taskId) => {
    if (get().isForking) return
    set({ isForking: true })
    try {
      const task = get().tasks[taskId]
      const forked = await ipc.forkTask(taskId, task?.workspace, task?.name)
      forked.parentTaskId = taskId
      // Preserve worktree fields from parent so forked thread nests under the same project
      if (task?.worktreePath) forked.worktreePath = task.worktreePath
      if (task?.originalWorkspace) forked.originalWorkspace = task.originalWorkspace
      forked.projectId = task?.projectId ?? get().getProjectId(task?.originalWorkspace ?? forked.workspace)
      set((state) => {
        const realWorkspace = forked.originalWorkspace ?? forked.workspace
        const projects = realWorkspace && !state.projects.includes(realWorkspace)
          ? [...state.projects, realWorkspace]
          : state.projects
        return {
          tasks: { ...state.tasks, [forked.id]: forked },
          selectedTaskId: forked.id,
          view: 'chat' as const,
          projects,
          isForking: false,
        }
      })
      get().persistHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const { selectedTaskId, tasks, upsertTask } = get()
      const tid = selectedTaskId ?? taskId
      const task = tasks[tid]
      if (task) {
        upsertTask({
          ...task,
          messages: [...task.messages, { role: 'system', content: `⚠️ Fork failed: ${msg}`, timestamp: new Date().toISOString() }],
        })
      }
      set({ isForking: false })
    }
  },

  reorderProject: (from, to) =>
    set((state) => {
      if (from === to) return state
      const arr = [...state.projects]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { projects: arr }
    }),

  setDraft: (workspace, content) => {
    // Skip save if this workspace was just explicitly deleted (unmount flush guard)
    if (get()._suppressDraftSave === workspace) {
      set({ _suppressDraftSave: null })
      return
    }
    const trimmed = content.trim()
    if (!trimmed) {
      // Remove empty drafts
      const { [workspace]: _, ...rest } = get().drafts
      if (_ === undefined) return  // bail-out: nothing to remove
      set({ drafts: rest })
    } else {
      if (get().drafts[workspace] === content) return  // bail-out: no change
      set((s) => ({ drafts: { ...s.drafts, [workspace]: content } }))
    }
  },

  removeDraft: (workspace) => {
    if (get().drafts[workspace] === undefined) return
    set((s) => {
      const { [workspace]: _, ...rest } = s.drafts
      return {
        drafts: rest,
        // Suppress the next setDraft call for this workspace so the
        // PendingChat unmount flush doesn't resurrect the deleted draft
        _suppressDraftSave: workspace,
      }
    })
  },

  toggleTerminal: (taskId) => set((s) => {
    const next = new Set(s.terminalOpenTasks)
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId)
    return { terminalOpenTasks: next }
  }),

  toggleWorkspaceTerminal: () => set((s) => ({ isWorkspaceTerminalOpen: !s.isWorkspaceTerminalOpen })),

  setTaskMode: (taskId, modeId) => {
    if (get().taskModes[taskId] === modeId) return
    set((s) => ({ taskModes: { ...s.taskModes, [taskId]: modeId } }))
  },

  loadTasks: async () => {
    try {
      const list = await ipc.listTasks()
      const tasks: Record<string, AgentTask> = Object.fromEntries(list.map((t) => [t.id, t]))

      // Load persisted history (archived threads from previous sessions)
      try {
        const [savedThreads, savedProjects, savedSoftDeleted] = await Promise.all([
          historyStore.loadThreads(),
          historyStore.loadProjects(),
          historyStore.loadSoftDeleted(),
        ])
        const archived = historyStore.toArchivedTasks(savedThreads)
        for (const t of archived) {
          if (!tasks[t.id]) {
            // No live task — use the archived version
            tasks[t.id] = t
          } else {
            // Live task exists — merge worktree metadata the backend doesn't track
            const live = tasks[t.id]
            if (!live.worktreePath && t.worktreePath) live.worktreePath = t.worktreePath
            if (!live.originalWorkspace && t.originalWorkspace) live.originalWorkspace = t.originalWorkspace
            if (!live.projectId && t.projectId) live.projectId = t.projectId
            if (!live.parentTaskId && t.parentTaskId) live.parentTaskId = t.parentTaskId
          }
        }
        // Derive projects AFTER merge so worktree tasks use restored originalWorkspace
        const projects = [...new Set(Object.values(tasks).map((t) => t.originalWorkspace ?? t.workspace))]
        // Merge project workspaces from history
        for (const sp of savedProjects) {
          if (!projects.includes(sp.workspace)) projects.push(sp.workspace)
        }
        // Restore project display names and projectIds
        const projectNames: Record<string, string> = {}
        const projectIds: Record<string, string> = {}
        for (const sp of savedProjects) {
          if (sp.displayName) projectNames[sp.workspace] = sp.displayName
          if (sp.projectId) projectIds[sp.workspace] = sp.projectId
        }
        // Generate UUIDs for projects that don't have one yet
        for (const ws of projects) {
          if (!projectIds[ws]) projectIds[ws] = crypto.randomUUID()
        }
        // Restore soft-deleted threads and rebuild deletedTaskIds guard
        const softDeleted: Record<string, import('@/types').SoftDeletedThread> = {}
        const deletedTaskIds = new Set<string>()
        for (const sd of savedSoftDeleted) {
          softDeleted[sd.task.id] = sd
          deletedTaskIds.add(sd.task.id)
          // Remove from tasks map so deleted threads don't appear in sidebar
          delete tasks[sd.task.id]
        }
        set({ tasks, projects, projectIds, projectNames, softDeleted, deletedTaskIds, connected: true })
      } catch {
        // History load failed — derive projects from live tasks, filtering worktree paths
        const projects = [...new Set(list.map((t) => t.originalWorkspace ?? t.workspace))]
        set({ tasks, projects, connected: true })
      }
    } catch {
      // Backend not available — try loading from history only
      try {
        const [savedThreads, savedProjects, savedSoftDeleted] = await Promise.all([
          historyStore.loadThreads(),
          historyStore.loadProjects(),
          historyStore.loadSoftDeleted(),
        ])
        const archived = historyStore.toArchivedTasks(savedThreads)
        const tasks = Object.fromEntries(archived.map((t) => [t.id, t]))
        const projects = savedProjects.map((sp) => sp.workspace)
        const projectNames: Record<string, string> = {}
        const projectIds: Record<string, string> = {}
        for (const sp of savedProjects) {
          if (sp.displayName) projectNames[sp.workspace] = sp.displayName
          if (sp.projectId) projectIds[sp.workspace] = sp.projectId
        }
        for (const ws of projects) {
          if (!projectIds[ws]) projectIds[ws] = crypto.randomUUID()
        }
        const softDeleted: Record<string, import('@/types').SoftDeletedThread> = {}
        const deletedTaskIds = new Set<string>()
        for (const sd of savedSoftDeleted) {
          softDeleted[sd.task.id] = sd
          deletedTaskIds.add(sd.task.id)
        }
        set({ tasks, projects, projectIds, projectNames, softDeleted, deletedTaskIds, connected: false })
      } catch {
        set({ connected: false })
      }
    }
  },

  setConnected: (v) => {
    if (get().connected === v) return
    set({ connected: v })
  },

  persistHistory: () => {
    const { tasks, projectNames, projectIds, softDeleted } = get()
    historyStore.saveThreads(tasks, projectNames, projectIds).catch(() => {})
    historyStore.saveSoftDeleted(Object.values(softDeleted)).catch(() => {})
  },

  clearHistory: async () => {
    // Cancel all running tasks first
    const currentTasks = get().tasks
    for (const [id, task] of Object.entries(currentTasks)) {
      if (task.status === 'running' || task.status === 'paused') {
        ipc.cancelTask(id).catch(() => {})
      }
    }
    // Clear the persisted thread/project store
    await historyStore.clearHistory()
    // Reset all in-memory state
    set({
      tasks: {},
      projects: [],
      projectIds: {},
      projectNames: {},
      deletedTaskIds: new Set<string>(),
      softDeleted: {},
      selectedTaskId: null,
      pendingWorkspace: null,
      streamingChunks: {},
      thinkingChunks: {},
      liveToolCalls: {},
      queuedMessages: {},
      terminalOpenTasks: new Set<string>(),
      isWorkspaceTerminalOpen: false,
      drafts: {},
      _suppressDraftSave: null,
      notifiedTaskIds: [],
    })
    // Reset settings to defaults and go back to onboarding
    const defaultSettings = { ...useSettingsStore.getState().settings, hasOnboardedV2: false, projectPrefs: {} }
    await useSettingsStore.getState().saveSettings(defaultSettings)
    useSettingsStore.setState({ settings: defaultSettings })
  },

  resolveWorktreeCleanup: (removeWorktree) => {
    const pending = get().worktreeCleanupPending
    if (!pending) return
    set({ worktreeCleanupPending: null })
    const { taskId, action, worktreePath, originalWorkspace } = pending
    // Proceed with the actual delete/archive
    if (action === 'archive') {
      const task = get().tasks[taskId]
      if (!task || task.isArchived) return
      void ipc.cancelTask(taskId).catch(() => {})
      set((s) => ({
        tasks: { ...s.tasks, [taskId]: { ...s.tasks[taskId], isArchived: true, status: 'completed' } },
        streamingChunks: { ...s.streamingChunks, [taskId]: '' },
        thinkingChunks: { ...s.thinkingChunks, [taskId]: '' },
        liveToolCalls: { ...s.liveToolCalls, [taskId]: [] },
      }))
      void ipc.deleteTask(taskId)
    } else {
      void ipc.cancelTask(taskId).catch(() => {})
      void ipc.deleteTask(taskId)
      set((state) => {
        const { [taskId]: removed, ...rest } = state.tasks
        const { [taskId]: _c, ...chunks } = state.streamingChunks
        const { [taskId]: _t, ...thinking } = state.thinkingChunks
        const { [taskId]: _tc, ...tools } = state.liveToolCalls
        const { [taskId]: _m, ...modes } = state.taskModes
        const deletedTaskIds = new Set(state.deletedTaskIds)
        deletedTaskIds.add(taskId)
        const softDeleted = {
          ...state.softDeleted,
          [taskId]: { task: { ...removed, isArchived: true, status: 'completed' as const }, deletedAt: new Date().toISOString() },
        }
        return {
          tasks: rest,
          streamingChunks: chunks,
          thinkingChunks: thinking,
          liveToolCalls: tools,
          taskModes: modes,
          deletedTaskIds,
          softDeleted,
          selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
        }
      })
    }
    if (removeWorktree) {
      void ipc.gitWorktreeRemove(originalWorkspace, worktreePath).catch((err) => {
        console.warn('[worktree] Failed to remove worktree during cleanup:', err)
      })
    }
    get().persistHistory()
  },
}))

/** Pure state reducer for turn_end — exported for testing. */
export const applyTurnEnd = (
  s: Pick<TaskStore, 'tasks' | 'streamingChunks' | 'thinkingChunks' | 'liveToolCalls'>,
  taskId: string,
  stopReason?: string,
): Partial<TaskStore> => {
  const chunk = s.streamingChunks[taskId] ?? ''
  const thinking = s.thinkingChunks[taskId] ?? ''
  const liveTools = s.liveToolCalls[taskId] ?? []
  const task = s.tasks[taskId]
  if (!task) return {}
  const fallbackStatus = stopReason === 'refusal' ? 'failed' as const : 'completed' as const
  const finalizedTools = liveTools.map((tc) =>
    tc.status === 'completed' || tc.status === 'failed' ? tc : { ...tc, status: fallbackStatus },
  )
  const newMessages = [...task.messages]
  if (chunk || finalizedTools.length > 0) {
    newMessages.push({
      role: 'assistant' as const,
      content: chunk,
      timestamp: new Date().toISOString(),
      ...(thinking ? { thinking } : {}),
      ...(finalizedTools.length > 0 ? { toolCalls: finalizedTools } : {}),
    })
  }
  if (stopReason === 'refusal') {
    newMessages.push({
      role: 'system' as const,
      content: '\u26a0\ufe0f The agent refused to continue. This can happen when the request conflicts with safety guidelines or the agent cannot proceed.',
      timestamp: new Date().toISOString(),
    })
  }
  const updatedTask: AgentTask = {
    ...task,
    status: stopReason === 'refusal' ? 'error' : 'paused',
    messages: newMessages,
    pendingPermission: undefined,
  }
  return {
    tasks: { ...s.tasks, [taskId]: updatedTask },
    streamingChunks: { ...s.streamingChunks, [taskId]: '' },
    thinkingChunks: { ...s.thinkingChunks, [taskId]: '' },
    liveToolCalls: { ...s.liveToolCalls, [taskId]: [] },
  }
}

export function initTaskListeners(): () => void {
  useTaskStore.getState().setConnected(true)

  // Batch task_update events with rAF — multiple threads can fire status changes rapidly
  let taskUpdateBuf: Record<string, AgentTask> = {}
  let taskUpdateRaf: number | null = null
  const flushTaskUpdates = () => {
    const buf = taskUpdateBuf; taskUpdateBuf = {}; taskUpdateRaf = null
    const store = useTaskStore.getState()
    for (const task of Object.values(buf)) {
      store.upsertTask({ ...task, messages: [] })
    }
  }
  const unsub1 = ipc.onTaskUpdate((task) => {
    // Keep only the latest update per task, strip messages
    taskUpdateBuf[task.id] = task
    if (!taskUpdateRaf) taskUpdateRaf = requestAnimationFrame(flushTaskUpdates)
  })

  // Batch streaming chunks with rAF to reduce state updates
  let chunkBuf: Record<string, string> = {}
  let chunkRaf: number | null = null
  const flushChunks = () => {
    const buf = chunkBuf; chunkBuf = {}; chunkRaf = null
    useTaskStore.setState((s) => {
      const next = { ...s.streamingChunks }
      for (const [id, text] of Object.entries(buf)) next[id] = joinChunk(next[id] ?? '', text)
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
      for (const [id, text] of Object.entries(buf)) next[id] = joinChunk(next[id] ?? '', text)
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

  const unsub8 = ipc.onTurnEnd(({ taskId, stopReason }) => {
    // Flush any pending rAF-buffered chunks synchronously so turn_end sees them
    if (chunkBuf[taskId] || Object.keys(chunkBuf).length > 0) {
      if (chunkRaf) { cancelAnimationFrame(chunkRaf); chunkRaf = null }
      flushChunks()
    }
    if (thinkBuf[taskId] || Object.keys(thinkBuf).length > 0) {
      if (thinkRaf) { cancelAnimationFrame(thinkRaf); thinkRaf = null }
      flushThinking()
    }
    // Use a single setState to avoid stale reads between getState() calls
    useTaskStore.setState((s) => applyTurnEnd(s, taskId, stopReason))

    // Persist history after turn ends
    useTaskStore.getState().persistHistory()

    // Send a native notification when the window is not focused and notifications are enabled
    const settings = useSettingsStore.getState().settings
    const task = useTaskStore.getState().tasks[taskId]
    if (task) {
      const notifStatus = stopReason === 'refusal' || task.status === 'error' ? 'error' : 'completed'
      sendTaskNotification({
        task,
        status: notifStatus,
        isNotificationsEnabled: settings.notifications ?? true,
        isSoundEnabled: settings.soundNotifications ?? true,
        onNotified: (tid) => {
          useTaskStore.setState((s) => ({
            notifiedTaskIds: s.notifiedTaskIds.includes(tid) ? s.notifiedTaskIds : [...s.notifiedTaskIds, tid],
          }))
        },
      })
    }

    // Auto-send the first queued message if any exist
    const state = useTaskStore.getState()
    const queue = state.queuedMessages[taskId] ?? []
    if (queue.length > 0) {
      const nextMsg = queue[0]
      // Remove the first message from the queue
      useTaskStore.setState((s) => ({
        queuedMessages: {
          ...s.queuedMessages,
          [taskId]: (s.queuedMessages[taskId] ?? []).slice(1),
        },
      }))
      // Send it — add as user message and dispatch to backend
      const task = useTaskStore.getState().tasks[taskId]
      if (task) {
        const userMsg: import('@/types').TaskMessage = {
          role: 'user' as const,
          content: nextMsg,
          timestamp: new Date().toISOString(),
        }
        useTaskStore.getState().upsertTask({
          ...task,
          status: 'running',
          messages: [...task.messages, userMsg],
        })
        useTaskStore.getState().clearTurn(taskId)
        ipc.sendMessage(taskId, nextMsg)
      }
    }
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
    // mcpServers may arrive as a flat array or a grouped object (e.g. { "other": [...] }).
    // Normalize to a flat LiveMcpServer[] so the UI can always .map() over it.
    let flatServers: import('@/stores/settingsStore').LiveMcpServer[] | undefined
    if (mcpServers) {
      if (Array.isArray(mcpServers)) {
        flatServers = mcpServers
      } else if (typeof mcpServers === 'object') {
        flatServers = Object.values(mcpServers as Record<string, import('@/stores/settingsStore').LiveMcpServer[]>).flat()
      }
    }
    useSettingsStore.setState({
      availableCommands: commands,
      ...(flatServers ? { liveMcpServers: flatServers } : {}),
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
    // Notify on errors while backgrounded
    const errSettings = useSettingsStore.getState().settings
    const errTask = useTaskStore.getState().tasks[taskId]
    if (errTask) {
      sendTaskNotification({
        task: errTask,
        status: 'error',
        isNotificationsEnabled: errSettings.notifications ?? true,
        isSoundEnabled: errSettings.soundNotifications ?? true,
        onNotified: (tid) => {
          useTaskStore.setState((s) => ({
            notifiedTaskIds: s.notifiedTaskIds.includes(tid) ? s.notifiedTaskIds : [...s.notifiedTaskIds, tid],
          }))
        },
      })
    }
  })

  const unsub13 = ipc.onCompactionStatus(({ taskId, status }) => {
    const mapped = status === 'started' ? 'compacting'
      : status === 'completed' ? 'completed'
      : status === 'failed' ? 'failed'
      : null
    if (mapped) {
      useTaskStore.getState().updateCompactionStatus(taskId, mapped as import('@/types').CompactionStatus)
    }
  })

  return () => {
    unsub1(); unsub2(); unsub3(); unsub4(); unsub5()
    unsub6(); unsub7(); unsub8(); unsub9(); unsub10(); unsub11(); unsub12()
    unsub13()
  }
}
