import type { TaskMessage, ToolCall } from '@/types'

/** Check if a tool call represents a file mutation (edit, delete, move) */
function isFileMutation(kind?: string, title?: string): boolean {
  if (kind === 'edit' || kind === 'delete' || kind === 'move') return true
  if (kind) return false
  const t = (title ?? '').toLowerCase()
  return t.includes('edit') || t.includes('write') || t.includes('patch') || t.includes('delet') || t.includes('mov') || t.includes('renam')
}

// ── Timeline row types ───────────────────────────────────────────

export type TimelineRowKind = 'user-message' | 'system-message' | 'assistant-text' | 'work' | 'working' | 'changed-files'

export interface UserMessageRow {
  kind: 'user-message'
  id: string
  content: string
  timestamp: string
  questionAnswers?: { question: string; answer: string }[]
}

export interface SystemMessageRow {
  kind: 'system-message'
  id: string
  content: string
  timestamp: string
}

export interface AssistantTextRow {
  kind: 'assistant-text'
  id: string
  content: string
  timestamp: string
  thinking?: string
  isStreaming?: boolean
  /** True when this row is followed by another row from the same turn */
  squashed?: boolean
}

export interface WorkRow {
  kind: 'work'
  id: string
  toolCalls: ToolCall[]
  /** True when this row is followed by another row from the same turn */
  squashed?: boolean
}

export interface WorkingRow {
  kind: 'working'
  id: string
}

export interface ChangedFilesRow {
  kind: 'changed-files'
  id: string
  toolCalls: ToolCall[]
}

export type TimelineRow = UserMessageRow | SystemMessageRow | AssistantTextRow | WorkRow | WorkingRow | ChangedFilesRow

// ── Derivation ───────────────────────────────────────────────────

/**
 * Convert messages + live streaming state into a flat, ordered list of
 * timeline rows. Each row becomes a separate virtualizer item.
 *
 * For persisted assistant messages:
 *   - assistant text row first (the message content)
 *   - then tool calls row (work) below as a compact activity log
 *
 * For streaming (live) state:
 *   - streaming text as an assistant-text row first
 *   - live tool calls as a work row below
 *   - working indicator if running with no content yet
 */
export function deriveTimeline(
  messages: TaskMessage[],
  streamingChunk: string | undefined,
  liveToolCalls: ToolCall[] | undefined,
  liveThinking: string | undefined,
  isRunning: boolean | undefined,
): TimelineRow[] {
  const rows: TimelineRow[] = []

  // ── Persisted messages ──────────────────────────────────────
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'user') {
      rows.push({
        kind: 'user-message',
        id: `msg-${i}-user`,
        content: msg.content,
        timestamp: msg.timestamp,
        questionAnswers: msg.questionAnswers,
      })
      continue
    }

    if (msg.role === 'system') {
      rows.push({
        kind: 'system-message',
        id: `msg-${i}-system`,
        content: msg.content,
        timestamp: msg.timestamp,
      })
      continue
    }

    // Assistant message: text first, then tool calls below
    const hasToolCalls = !!(msg.toolCalls && msg.toolCalls.length > 0)
    const hasFileChanges = hasToolCalls && msg.toolCalls!.some(
      (tc) => tc.status === 'completed' && isFileMutation(tc.kind, tc.title),
    )

    if (msg.content || msg.thinking) {
      rows.push({
        kind: 'assistant-text',
        id: `msg-${i}-text`,
        content: msg.content,
        timestamp: msg.timestamp,
        thinking: msg.thinking,
        squashed: hasToolCalls,
      })
    }

    if (hasToolCalls) {
      rows.push({
        kind: 'work',
        id: `msg-${i}-work`,
        toolCalls: msg.toolCalls!,
        squashed: hasFileChanges,
      })
      if (hasFileChanges) {
        rows.push({
          kind: 'changed-files',
          id: `msg-${i}-changed-files`,
          toolCalls: msg.toolCalls!,
        })
      }
    }
  }

  // ── Live streaming state ────────────────────────────────────
  const hasLiveTools = liveToolCalls && liveToolCalls.length > 0
  const hasLiveText = !!streamingChunk
  const hasLiveThinking = !!liveThinking
  const hasLiveActivity = hasLiveTools || hasLiveText || hasLiveThinking

  if (hasLiveText || hasLiveThinking) {
    rows.push({
      kind: 'assistant-text',
      id: 'live-text',
      content: streamingChunk ?? '',
      timestamp: '',
      thinking: liveThinking,
      isStreaming: true,
      squashed: hasLiveTools,
    })
  }

  // Show "Working..." indicator above tool calls so it reads as a status header
  if (isRunning) {
    rows.push({ kind: 'working', id: 'working' })
  }

  if (hasLiveTools) {
    rows.push({
      kind: 'work',
      id: 'live-work',
      toolCalls: liveToolCalls,
    })
  }

  return rows
}
