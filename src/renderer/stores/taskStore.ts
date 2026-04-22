import { create } from 'zustand'
import type { AgentTask, ActivityEntry, SoftDeletedThread } from '@/types'
import { ipc } from '@/lib/ipc'
import { joinChunk } from '@/lib/utils'
import * as historyStore from '@/lib/history-store'
import { useSettingsStore } from './settingsStore'
import { track } from '@/lib/analytics'
import { sendTaskNotification } from '@/lib/notifications'
import type { TaskStore } from './task-store-types'

export type { TaskStore, BtwCheckpoint } from './task-store-types'
export { initTaskListeners, applyTurnEnd } from './task-store-listeners'

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
  btwCheckpoint: null,
  streamingChunks: {},
  thinkingChunks: {},
  liveToolCalls: {},
  queuedMessages: {},
  activityFeed: [],
  connected: false,
  terminalOpenTasks: new Set<string>(),
  isWorkspaceTerminalOpen: false,
  drafts: {},
  draftAttachments: {},
  draftPastedChunks: {},
  draftMentionedFiles: {},
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
    set((s) => {
      // Restore soft-deleted threads that belonged to this workspace
      const restoredIds = Object.keys(s.softDeleted).filter((tid) => {
        const t = s.softDeleted[tid].task
        return (t.originalWorkspace ?? t.workspace) === workspace
      })
      const tasks = { ...s.tasks }
      const softDeleted = { ...s.softDeleted }
      const deletedTaskIds = new Set(s.deletedTaskIds)
      for (const tid of restoredIds) {
        tasks[tid] = { ...softDeleted[tid].task, isArchived: true, projectId: id }
        delete softDeleted[tid]
        deletedTaskIds.delete(tid)
      }
      return {
        projects: [...s.projects, workspace],
        projectIds: { ...s.projectIds, [workspace]: id },
        tasks,
        softDeleted,
        deletedTaskIds,
      }
    })
    if (Object.keys(get().softDeleted).length > 0 || Object.keys(get().tasks).length > 0) {
      get().persistHistory()
    }
  },
  getProjectId: (workspace) => {
    const existing = get().projectIds[workspace]
    if (existing) return existing
    const id = crypto.randomUUID()
    set((s) => ({ projectIds: { ...s.projectIds, [workspace]: id } }))
    return id
  },

  removeProject: (workspace) => {
    set((s) => {
      let taskIds = Object.keys(s.tasks).filter((id) => {
        const t = s.tasks[id]
        const ws = t.originalWorkspace ?? t.workspace
        return ws === workspace
      })
      // If no tasks matched by workspace, try matching by projectId (orphaned UUID entries)
      if (taskIds.length === 0) {
        taskIds = Object.keys(s.tasks).filter((id) => s.tasks[id].projectId === workspace)
      }
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
      // Clean up projectIds entries that point to this UUID
      const projectIds = { ...s.projectIds }
      for (const [ws, pid] of Object.entries(projectIds)) {
        if (pid === workspace) delete projectIds[ws]
      }
      return {
        projects: s.projects.filter((p) => p !== workspace),
        projectIds,
        tasks,
        softDeleted,
        selectedTaskId,
        deletedTaskIds,
        drafts,
        taskModes,
        pendingWorkspace: s.pendingWorkspace === workspace ? null : s.pendingWorkspace,
        view: selectedTaskId === null && s.view === 'chat' ? 'dashboard' : s.view,
      }
    })
    get().persistHistory()
  },

  archiveThreads: (workspace) => {
    set((s) => {
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
    })
    get().persistHistory()
  },

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
        tasks: { ...state.tasks, [id]: { ...entry.task, isArchived: false } },
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

  updateCompactionStatus: (taskId, status, summary) => {
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
    })
    get().persistHistory()
  },

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

  enqueueMessage: (taskId, message, attachments) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [taskId]: [...(state.queuedMessages[taskId] ?? []), { text: message, attachments: attachments?.length ? attachments : undefined }],
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
    get().persistHistory()
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
    // Track in native Recent Projects menu
    if (workspace) {
      ipc.addRecentProject(workspace).then(() => ipc.rebuildRecentMenu()).catch(() => {})
    }
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

  reorderProject: (from, to) => {
    if (from === to) return
    set((state) => {
      const arr = [...state.projects]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { projects: arr }
    })
    get().persistHistory()
  },

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

  setDraftAttachments: (workspace, attachments) => {
    if (attachments.length === 0) {
      const { [workspace]: _, ...rest } = get().draftAttachments
      if (_ === undefined) return
      set({ draftAttachments: rest })
    } else {
      set((s) => ({ draftAttachments: { ...s.draftAttachments, [workspace]: attachments } }))
    }
  },

  setDraftPastedChunks: (workspace, chunks) => {
    if (chunks.length === 0) {
      const { [workspace]: _, ...rest } = get().draftPastedChunks
      if (_ === undefined) return
      set({ draftPastedChunks: rest })
    } else {
      set((s) => ({ draftPastedChunks: { ...s.draftPastedChunks, [workspace]: chunks } }))
    }
  },

  removeDraftAttachments: (workspace) => {
    if (get().draftAttachments[workspace] === undefined) return
    const { [workspace]: _, ...rest } = get().draftAttachments
    set({ draftAttachments: rest })
  },

  removeDraftPastedChunks: (workspace) => {
    if (get().draftPastedChunks[workspace] === undefined) return
    const { [workspace]: _, ...rest } = get().draftPastedChunks
    set({ draftPastedChunks: rest })
  },

  setDraftMentionedFiles: (workspace, files) => {
    if (files.length === 0) {
      const { [workspace]: _, ...rest } = get().draftMentionedFiles
      if (_ === undefined) return
      set({ draftMentionedFiles: rest })
    } else {
      set((s) => ({ draftMentionedFiles: { ...s.draftMentionedFiles, [workspace]: files } }))
    }
  },

  removeDraftMentionedFiles: (workspace) => {
    if (get().draftMentionedFiles[workspace] === undefined) return
    const { [workspace]: _, ...rest } = get().draftMentionedFiles
    set({ draftMentionedFiles: rest })
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
            // Create a new object to preserve Zustand reactivity (don't mutate in place)
            const live = tasks[t.id]
            tasks[t.id] = {
              ...live,
              ...(!live.worktreePath && t.worktreePath ? { worktreePath: t.worktreePath } : {}),
              ...(!live.originalWorkspace && t.originalWorkspace ? { originalWorkspace: t.originalWorkspace } : {}),
              ...(!live.projectId && t.projectId ? { projectId: t.projectId } : {}),
              ...(!live.parentTaskId && t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
            }
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
        // Restore missing threads from backup (covers data lost during update relaunch)
        try {
          const backup = await historyStore.loadBackup()
          if (backup.threads.length > 0) {
            const backupTasks = historyStore.toArchivedTasks(backup.threads)
            for (const bt of backupTasks) {
              if (!tasks[bt.id] && !deletedTaskIds.has(bt.id)) tasks[bt.id] = bt
            }
            for (const bp of backup.projects) {
              if (bp.displayName && !projectNames[bp.workspace]) projectNames[bp.workspace] = bp.displayName
              if (bp.projectId && !projectIds[bp.workspace]) projectIds[bp.workspace] = bp.projectId
              if (!projects.includes(bp.workspace)) projects.push(bp.workspace)
            }
            for (const sd of backup.softDeleted) {
              if (!softDeleted[sd.task.id] && !tasks[sd.task.id]) {
                softDeleted[sd.task.id] = sd
                deletedTaskIds.add(sd.task.id)
              }
            }
          }
        } catch { /* backup load is best-effort */ }
        // Never overwrite tasks that have an active session (running/paused) —
        // they have live messages, streaming chunks, and tool calls that would be lost.
        const existing = get().tasks
        for (const [id, t] of Object.entries(existing)) {
          if (t.status === 'running' || t.status === 'paused') {
            tasks[id] = t
          }
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
        // Restore missing threads from backup (covers data lost during update relaunch)
        try {
          const backup = await historyStore.loadBackup()
          if (backup.threads.length > 0) {
            const backupTasks = historyStore.toArchivedTasks(backup.threads)
            for (const bt of backupTasks) {
              if (!tasks[bt.id] && !deletedTaskIds.has(bt.id)) tasks[bt.id] = bt
            }
            for (const bp of backup.projects) {
              if (bp.displayName && !projectNames[bp.workspace]) projectNames[bp.workspace] = bp.displayName
              if (bp.projectId && !projectIds[bp.workspace]) projectIds[bp.workspace] = bp.projectId
              if (!projects.includes(bp.workspace)) projects.push(bp.workspace)
            }
            for (const sd of backup.softDeleted) {
              if (!softDeleted[sd.task.id] && !tasks[sd.task.id]) {
                softDeleted[sd.task.id] = sd
                deletedTaskIds.add(sd.task.id)
              }
            }
          }
        } catch { /* backup load is best-effort */ }
        // Preserve live tasks (same guard as the primary path above)
        const existing = get().tasks
        for (const [id, t] of Object.entries(existing)) {
          if (t.status === 'running' || t.status === 'paused') {
            tasks[id] = t
          }
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
    historyStore.saveThreads(tasks, projectNames, projectIds).catch((err) => {
      console.warn('[persistHistory] saveThreads failed:', err)
    })
    historyStore.saveSoftDeleted(Object.values(softDeleted)).catch((err) => {
      console.warn('[persistHistory] saveSoftDeleted failed:', err)
    })
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
      activityFeed: [],
    })
    // Clear project-specific preferences but preserve core settings (onboarding, CLI path, model, etc.)
    const currentSettings = useSettingsStore.getState().settings
    const updatedSettings = { ...currentSettings, projectPrefs: {} }
    await useSettingsStore.getState().saveSettings(updatedSettings)
    useSettingsStore.setState({ settings: updatedSettings })
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

  enterBtwMode: (taskId, question) => {
    const task = get().tasks[taskId]
    if (!task) return
    set({ btwCheckpoint: { taskId, messages: [...task.messages], question } })
  },

  exitBtwMode: (keepTail) => {
    const checkpoint = get().btwCheckpoint
    if (!checkpoint) return
    const { taskId, messages: savedMessages } = checkpoint
    const task = get().tasks[taskId]
    if (!task) {
      set({ btwCheckpoint: null })
      return
    }
    if (keepTail) {
      // Find the last user+assistant pair added after the checkpoint
      const currentMessages = task.messages
      const newMessages = currentMessages.slice(savedMessages.length)
      const lastUser = [...newMessages].reverse().find((m) => m.role === 'user')
      const lastAssistant = [...newMessages].reverse().find((m) => m.role === 'assistant')
      const tail = [lastUser, lastAssistant].filter(Boolean) as import('@/types').TaskMessage[]
      set((s) => ({
        btwCheckpoint: null,
        tasks: { ...s.tasks, [taskId]: { ...task, messages: [...savedMessages, ...tail] } },
      }))
    } else {
      set((s) => ({
        btwCheckpoint: null,
        tasks: { ...s.tasks, [taskId]: { ...task, messages: [...savedMessages] } },
      }))
    }
  },
}))

