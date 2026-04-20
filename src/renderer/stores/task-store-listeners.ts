import type { AgentTask } from '@/types'
import { ipc } from '@/lib/ipc'
import { joinChunk } from '@/lib/utils'
import { sendTaskNotification } from '@/lib/notifications'
import { useDebugStore } from '@/stores/debugStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useKiroStore } from '@/stores/kiroStore'
import { useDiffStore } from '@/stores/diffStore'
import { useTaskStore } from './taskStore'
import type { TaskStore } from './task-store-types'
import { record } from '@/lib/analytics-collector'

/** Get the project basename from a workspace path (privacy: no full paths). */
const projectName = (workspace: string): string => {
  const parts = workspace.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || workspace
}

// ── Throttled periodic backup ────────────────────────────────────

const BACKUP_THROTTLE_MS = 5 * 60 * 1000 // 5 minutes
let lastBackupTime = 0

/** Best-effort backup, throttled to once per 5 minutes */
const throttledBackup = (): void => {
  const now = Date.now()
  if (now - lastBackupTime < BACKUP_THROTTLE_MS) return
  lastBackupTime = now
  import('@/lib/history-store').then((hs) =>
    hs.createBackup(useSettingsStore.getState().settings),
  ).catch(() => {})
}

/** Pure state reducer for turn_end — exported for testing. */
export const applyTurnEnd = (
  s: Pick<TaskStore, 'tasks' | 'streamingChunks' | 'thinkingChunks' | 'liveToolCalls'>,
  taskId: string,
  stopReason?: string,
  refusalRetry?: boolean,
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
    const msg = refusalRetry
      ? '\u26a0\ufe0f The agent refused to continue. Retrying automatically\u2026'
      : '\u26a0\ufe0f The agent refused to continue. You can try rephrasing your request or sending a new message.'
    newMessages.push({
      role: 'system' as const,
      content: msg,
      timestamp: new Date().toISOString(),
    })
  }
  const updatedTask: AgentTask = {
    ...task,
    // On refusal: stay 'paused' so the user can send new messages (not 'error' which feels stuck)
    status: stopReason === 'refusal' ? 'paused' : 'paused',
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
      for (const [id, text] of Object.entries(buf)) {
        if (s.tasks[id]?.status !== 'running') continue
        next[id] = joinChunk(next[id] ?? '', text)
      }
      return { streamingChunks: next }
    })
  }
  const unsub2 = ipc.onMessageChunk(({ taskId, chunk }) => {
    if (useTaskStore.getState().tasks[taskId]?.status !== 'running') return
    chunkBuf[taskId] = (chunkBuf[taskId] ?? '') + chunk
    if (!chunkRaf) chunkRaf = requestAnimationFrame(flushChunks)
  })

  let thinkBuf: Record<string, string> = {}
  let thinkRaf: number | null = null
  const flushThinking = () => {
    const buf = thinkBuf; thinkBuf = {}; thinkRaf = null
    useTaskStore.setState((s) => {
      const next = { ...s.thinkingChunks }
      for (const [id, text] of Object.entries(buf)) {
        if (s.tasks[id]?.status !== 'running') continue
        next[id] = joinChunk(next[id] ?? '', text)
      }
      return { thinkingChunks: next }
    })
  }
  const unsub3 = ipc.onThinkingChunk(({ taskId, chunk }) => {
    if (useTaskStore.getState().tasks[taskId]?.status !== 'running') return
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
    // Analytics: record completed tool calls
    if (toolCall.status === 'completed') {
      const task = useTaskStore.getState().tasks[taskId]
      const proj = task ? projectName(task.originalWorkspace ?? task.workspace) : undefined
      record('tool_call', { project: proj, thread: taskId, detail: toolCall.kind ?? 'other' })
      if (toolCall.kind === 'edit' || toolCall.kind === 'delete' || toolCall.kind === 'move') {
        const filePath = toolCall.locations?.[0]?.path
        const fileName = filePath ? filePath.split('/').pop() ?? filePath : undefined
        record('file_edited', { project: proj, thread: taskId, detail: fileName })
      }
    }
  })

  const unsub6 = ipc.onPlanUpdate(({ taskId, plan }) => {
    useTaskStore.getState().updatePlan(taskId, plan)
  })

  const unsub7 = ipc.onUsageUpdate(({ taskId, used, size }) => {
    useTaskStore.getState().updateUsage(taskId, used, size)
    const task = useTaskStore.getState().tasks[taskId]
    record('token_usage', {
      project: task ? projectName(task.originalWorkspace ?? task.workspace) : undefined,
      thread: taskId,
      value: used,
      value2: size,
    })
  })

  // Track refusal retries per task — allows one automatic retry before giving up
  const refusalRetried: Record<string, boolean> = {}

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

    // On refusal: auto-retry once, then give up and let the user send a new message
    if (stopReason === 'refusal') {
      const alreadyRetried = !!refusalRetried[taskId]

      // Apply turn end with retry flag so the system message is appropriate
      useTaskStore.setState((s) => applyTurnEnd(s, taskId, stopReason, !alreadyRetried))
      useTaskStore.getState().persistHistory()
      throttledBackup()

      if (!alreadyRetried) {
        // First refusal: mark as retried and auto-retry the last user message
        refusalRetried[taskId] = true
        const task = useTaskStore.getState().tasks[taskId]
        if (task) {
          // Find the last user message to retry
          const lastUserMsg = [...task.messages].reverse().find((m) => m.role === 'user')
          if (lastUserMsg) {
            useTaskStore.getState().upsertTask({ ...task, status: 'running' })
            useTaskStore.getState().clearTurn(taskId)
            ipc.sendMessage(taskId, lastUserMsg.content)
            return // skip notification and queue processing — we're retrying
          }
        }
      } else {
        // Second refusal: reset the retry tracker and let the user recover
        delete refusalRetried[taskId]
      }

      // Notify on refusal (only if we didn't auto-retry)
      const settings = useSettingsStore.getState().settings
      const task = useTaskStore.getState().tasks[taskId]
      if (task) {
        sendTaskNotification({
          task,
          status: 'error',
          isNotificationsEnabled: settings.notifications ?? true,
          isSoundEnabled: settings.soundNotifications ?? true,
          onNotified: (tid) => {
            useTaskStore.setState((s) => ({
              notifiedTaskIds: s.notifiedTaskIds.includes(tid) ? s.notifiedTaskIds : [...s.notifiedTaskIds, tid],
            }))
          },
        })
      }
      return // don't process queue on refusal
    }

    // Non-refusal turn end: clear any refusal tracker for this task
    delete refusalRetried[taskId]

    // Use a single setState to avoid stale reads between getState() calls
    useTaskStore.setState((s) => applyTurnEnd(s, taskId, stopReason))

    // Analytics: record assistant output word count and diff stats
    {
      const t = useTaskStore.getState().tasks[taskId]
      if (t) {
        const proj = projectName(t.originalWorkspace ?? t.workspace)
        const lastMsg = t.messages[t.messages.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.content) {
          record('message_received', {
            project: proj,
            thread: taskId,
            value: lastMsg.content.split(/\s+/).filter(Boolean).length,
          })
        }
        const ws = t.worktreePath ?? t.workspace
        ipc.gitDiffStats(ws).then((stats) => {
          if (stats.additions > 0 || stats.deletions > 0) {
            record('diff_stats', { project: proj, thread: taskId, value: stats.additions, value2: stats.deletions })
          }
        }).catch(() => {})
        const model = useSettingsStore.getState().currentModelId
        if (model) record('model_used', { project: proj, thread: taskId, detail: model })
      }
    }

    // Persist history after turn ends
    useTaskStore.getState().persistHistory()
    throttledBackup()

    // Send a native notification when the window is not focused and notifications are enabled
    const settings = useSettingsStore.getState().settings
    const task = useTaskStore.getState().tasks[taskId]
    if (task) {
      const notifStatus = task.status === 'error' ? 'error' : 'completed'
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
