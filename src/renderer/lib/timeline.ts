import type { TaskMessage, ToolCall } from '@/types'
import { parseReport, shouldRenderReportCard } from '@/components/chat/TaskCompletionCard'
import { hasQuestionBlocks } from '@/lib/question-parser'

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

export type SystemMessageVariant = 'error' | 'info' | 'worktree'

export interface SystemMessageRow {
  kind: 'system-message'
  id: string
  content: string
  timestamp: string
  variant: SystemMessageVariant
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
  /** True when a changed-files row follows this row (report card rendered there instead) */
  hasChangedFiles?: boolean
  /** True when the questions in this message have already been answered by the user */
  questionsAnswered?: boolean
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
  /** True when streaming text/thinking is already visible — show a subtle dot instead of cycling words */
  hasStreamingContent?: boolean
}

export interface ChangedFilesRow {
  kind: 'changed-files'
  id: string
  toolCalls: ToolCall[]
  /** Completion report parsed from the preceding assistant text, if any */
  report?: {
    status: 'done' | 'partial' | 'blocked'
    summary: string
    filesChanged?: string[]
    linesAdded?: number
    linesRemoved?: number
  }
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
  let inTangent = false
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Skip btw/tangent messages — they only render in the BtwOverlay
    if (msg.content.includes('<kirodex_tangent>')) {
      inTangent = true
      continue
    }
    if (inTangent && msg.role === 'assistant') {
      inTangent = false
      continue
    }
    inTangent = false

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
      const isWorktree = msg.content.startsWith('Working in worktree')
      const isError = msg.content.startsWith('⚠️') || msg.content.toLowerCase().includes('failed')
      rows.push({
        kind: 'system-message',
        id: `msg-${i}-system`,
        content: msg.content,
        timestamp: msg.timestamp,
        variant: isWorktree ? 'worktree' : isError ? 'error' : 'info',
      })
      continue
    }

    // Assistant message: text first, then tool calls below
    const hasToolCalls = !!(msg.toolCalls && msg.toolCalls.length > 0)
    const hasFileChanges = hasToolCalls && msg.toolCalls!.some(
      (tc) => tc.status === 'completed' && isFileMutation(tc.kind, tc.title),
    )

    if (msg.content || msg.thinking) {
      // Check if questions in this message have been answered by a subsequent user message
      const questionsAnswered = !!(msg.content && hasQuestionBlocks(msg.content) &&
        messages.slice(i + 1).some((m) => m.role === 'user' && m.questionAnswers?.length))
      rows.push({
        kind: 'assistant-text',
        id: `msg-${i}-text`,
        content: msg.content,
        timestamp: msg.timestamp,
        thinking: msg.thinking,
        squashed: hasToolCalls,
        hasChangedFiles: hasFileChanges,
        questionsAnswered,
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
          report: (() => {
            if (!msg.content) return undefined
            const parsed = parseReport(msg.content)
            return parsed && shouldRenderReportCard(parsed) ? parsed : undefined
          })(),
        })
      }
    }
  }

  // ── Live streaming state ────────────────────────────────────
  const hasLiveTools = liveToolCalls && liveToolCalls.length > 0
  const hasLiveText = !!streamingChunk
  const hasLiveThinking = !!liveThinking

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

  // Show activity indicator whenever the agent is running (green pause
  // button visible). Placed above live tool calls so the dot sits at
  // the top of the activity block. When streaming text/thinking is
  // already on screen, the row renders as a subtle dot.
  if (isRunning) {
    rows.push({ kind: 'working', id: 'working', hasStreamingContent: hasLiveText || hasLiveThinking })
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
