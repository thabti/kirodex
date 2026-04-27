/**
 * Thread memory estimation.
 *
 * Approximates the in-memory footprint of each thread held by the Zustand
 * task store, plus the global runtime stores (debug log, JS console capture,
 * soft-deleted threads, drafts). The numbers are estimates — V8 string
 * representation, hidden classes and shared references mean the real
 * footprint can vary by ±30% — but they are stable enough to compare threads
 * against each other and to spot runaway growth.
 *
 * Strings are charged as `length * 2` (V8 stores most strings as UTF-16).
 * Objects are serialized with JSON.stringify and the resulting string charged
 * the same way. This deliberately undercounts for very large objects with
 * shared subtrees but overcounts for objects with non-string keys; the two
 * effects roughly cancel for the data shapes we hold here.
 */
import type { AgentTask, TaskMessage, ToolCall, Attachment } from '@/types'
import type { TaskStore } from '@/stores/task-store-types'

const BYTES_PER_CHAR = 2

const sizeOfString = (s: string | undefined | null): number =>
  s ? s.length * BYTES_PER_CHAR : 0

/** Cheap byte estimate for an arbitrary value. JSON.stringify is the fallback. */
const sizeOfValue = (v: unknown): number => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'string') return v.length * BYTES_PER_CHAR
  if (typeof v === 'number') return 8
  if (typeof v === 'boolean') return 4
  try {
    const json = JSON.stringify(v)
    return json ? json.length * BYTES_PER_CHAR : 0
  } catch {
    return 0
  }
}

const sizeOfToolCall = (tc: ToolCall): number => {
  let n = 0
  n += sizeOfString(tc.toolCallId)
  n += sizeOfString(tc.title)
  n += sizeOfString(tc.status)
  n += sizeOfString(tc.kind)
  if (tc.locations) {
    for (const loc of tc.locations) n += sizeOfString(loc.path) + 8
  }
  if (tc.content) {
    for (const item of tc.content) {
      n += sizeOfString(item.type)
      n += sizeOfString(item.text)
      n += sizeOfString(item.path)
      n += sizeOfString(item.oldText)
      n += sizeOfString(item.newText)
      n += sizeOfString(item.terminalId)
    }
  }
  n += sizeOfValue(tc.rawInput)
  n += sizeOfValue(tc.rawOutput)
  return n
}

const sizeOfMessage = (msg: TaskMessage): number => {
  let n = 0
  n += sizeOfString(msg.role)
  n += sizeOfString(msg.content)
  n += sizeOfString(msg.timestamp)
  n += sizeOfString(msg.thinking)
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) n += sizeOfToolCall(tc)
  }
  if (msg.questionAnswers) {
    for (const qa of msg.questionAnswers) {
      n += sizeOfString(qa.question) + sizeOfString(qa.answer)
    }
  }
  return n
}

const sizeOfAttachment = (att: Attachment): number => {
  let n = 0
  n += sizeOfString(att.id)
  n += sizeOfString(att.name)
  n += sizeOfString(att.path)
  n += sizeOfString(att.type)
  n += sizeOfString(att.mimeType)
  n += sizeOfString(att.preview)
  n += sizeOfString(att.textContent)
  n += sizeOfString(att.base64Content)
  return n
}

export interface ThreadMemoryBreakdown {
  readonly taskId: string
  readonly name: string
  readonly status: string
  readonly isArchived: boolean
  /** Bytes used by finalized messages.content + thinking text (excluding tool calls). */
  readonly messages: number
  /** Bytes used by tool calls embedded in finalized messages (rawInput/rawOutput dominate). */
  readonly toolCalls: number
  /** Bytes used by current-turn buffers: streaming chunk, live thinking, live tool calls. */
  readonly liveTurn: number
  /** Bytes used by queued user messages (typed while agent is running). */
  readonly queued: number
  /** Number of finalized messages. */
  readonly messageCount: number
  /** Total bytes for this thread. */
  readonly total: number
}

export interface MemoryReport {
  /** Per-thread footprint, sorted by total bytes desc. */
  readonly threads: readonly ThreadMemoryBreakdown[]
  /** Total bytes across all live threads (sum of threads[].total). */
  readonly threadsTotal: number
  /** Bytes used by soft-deleted threads still in RAM. */
  readonly softDeleted: number
  readonly softDeletedCount: number
  /** Bytes used by lazy-loaded archived thread metadata (very small per entry). */
  readonly archivedMeta: number
  readonly archivedMetaCount: number
  /** Bytes used by per-workspace drafts (text + attachments + pasted chunks). */
  readonly drafts: number
  /** Bytes used by the Rust→WebView debug log buffer. */
  readonly debugLog: number
  readonly debugLogCount: number
  /** Bytes used by the JS console / network capture buffer. */
  readonly jsDebugLog: number
  readonly jsDebugLogCount: number
  /** Sum of every category. Best estimate of Zustand-held memory overall. */
  readonly grandTotal: number
}

/** Per-thread memory for a single AgentTask, given the live-turn buffers held outside it. */
export const measureThread = (
  task: AgentTask,
  streamingChunk: string | undefined,
  thinkingChunk: string | undefined,
  liveToolCalls: readonly ToolCall[] | undefined,
  queued: readonly { text: string }[] | undefined,
): ThreadMemoryBreakdown => {
  let messages = 0
  let toolCalls = 0
  for (const msg of task.messages) {
    messages += sizeOfString(msg.role) + sizeOfString(msg.content) +
      sizeOfString(msg.timestamp) + sizeOfString(msg.thinking)
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) toolCalls += sizeOfToolCall(tc)
    }
    if (msg.questionAnswers) {
      for (const qa of msg.questionAnswers) {
        messages += sizeOfString(qa.question) + sizeOfString(qa.answer)
      }
    }
  }

  let liveTurn = 0
  liveTurn += sizeOfString(streamingChunk)
  liveTurn += sizeOfString(thinkingChunk)
  if (liveToolCalls) {
    for (const tc of liveToolCalls) liveTurn += sizeOfToolCall(tc)
  }
  liveTurn += sizeOfString(task.liveThinking)
  if (task.liveToolCalls) {
    for (const tc of task.liveToolCalls) liveTurn += sizeOfToolCall(tc)
  }

  let queuedBytes = 0
  if (queued) {
    for (const q of queued) queuedBytes += sizeOfString(q.text)
  }

  return {
    taskId: task.id,
    name: task.name,
    status: task.status,
    isArchived: !!task.isArchived,
    messages,
    toolCalls,
    liveTurn,
    queued: queuedBytes,
    messageCount: task.messages.length,
    total: messages + toolCalls + liveTurn + queuedBytes,
  }
}

interface DebugLikeStore {
  readonly entries: readonly unknown[]
}

/**
 * Measure all renderer-side memory tied to threads. Reads directly from the
 * provided task store snapshot plus optional debug store snapshots so the
 * caller can compute everything in a single React-batched pass.
 */
export const measureMemory = (
  store: TaskStore,
  debugStore?: DebugLikeStore,
  jsDebugStore?: DebugLikeStore,
): MemoryReport => {
  const threads: ThreadMemoryBreakdown[] = []
  for (const task of Object.values(store.tasks)) {
    threads.push(measureThread(
      task,
      store.streamingChunks[task.id],
      store.thinkingChunks[task.id],
      store.liveToolCalls[task.id],
      store.queuedMessages[task.id],
    ))
  }
  threads.sort((a, b) => b.total - a.total)
  const threadsTotal = threads.reduce((sum, t) => sum + t.total, 0)

  let softDeleted = 0
  for (const entry of Object.values(store.softDeleted)) {
    for (const msg of entry.task.messages) softDeleted += sizeOfMessage(msg)
    softDeleted += sizeOfString(entry.deletedAt)
  }

  let archivedMeta = 0
  for (const m of Object.values(store.archivedMeta)) {
    archivedMeta += sizeOfString(m.id) + sizeOfString(m.name) +
      sizeOfString(m.workspace) + sizeOfString(m.createdAt) +
      sizeOfString(m.lastActivityAt) + 8 +
      sizeOfString(m.parentTaskId) + sizeOfString(m.worktreePath) +
      sizeOfString(m.originalWorkspace) + sizeOfString(m.projectId)
  }
  const archivedMetaCount = Object.keys(store.archivedMeta).length

  let drafts = 0
  for (const text of Object.values(store.drafts)) drafts += sizeOfString(text)
  for (const list of Object.values(store.draftAttachments)) {
    for (const att of list) drafts += sizeOfAttachment(att)
  }
  for (const list of Object.values(store.draftPastedChunks)) {
    for (const chunk of list) drafts += sizeOfValue(chunk)
  }

  const debugLog = debugStore
    ? debugStore.entries.reduce<number>((sum, e) => sum + sizeOfValue(e), 0)
    : 0
  const jsDebugLog = jsDebugStore
    ? jsDebugStore.entries.reduce<number>((sum, e) => sum + sizeOfValue(e), 0)
    : 0

  return {
    threads,
    threadsTotal,
    softDeleted,
    softDeletedCount: Object.keys(store.softDeleted).length,
    archivedMeta,
    archivedMetaCount,
    drafts,
    debugLog,
    debugLogCount: debugStore?.entries.length ?? 0,
    jsDebugLog,
    jsDebugLogCount: jsDebugStore?.entries.length ?? 0,
    grandTotal: threadsTotal + softDeleted + archivedMeta + drafts + debugLog + jsDebugLog,
  }
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
