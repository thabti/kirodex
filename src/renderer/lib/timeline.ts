import type { TaskMessage, ToolCall, ToolCallSplit } from '@/types'
import { parseReport, shouldRenderReportCard } from '@/components/chat/TaskCompletionCard'
import { hasInteractiveQuestionBlocks } from '@/lib/question-parser'

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

export type SystemMessageVariant = 'error' | 'info' | 'worktree' | 'connection_lost'

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
  /**
   * True for inline-mode segments that are not the last segment of a message.
   * When set, the row should suppress the report card / completion footer
   * because they belong on the trailing segment only.
   */
  isInlineSegment?: boolean
  /** When true, render a CompletionDivider after this row */
  showCompletionDivider?: boolean
  /** Turn duration in milliseconds (from first token to turn_end) */
  durationMs?: number
  /** Index of the source TaskMessage in `task.messages`. Absent on live/streaming rows. */
  messageIndex?: number
  /** True when this row represents the final completed assistant turn boundary
   *  (last segment of the message + no more user messages after it). Used by
   *  the per-turn chip / Rollback affordance. */
  isTurnBoundary?: boolean
}

export interface WorkRow {
  kind: 'work'
  id: string
  toolCalls: ToolCall[]
  /** True when this row is followed by another row from the same turn */
  squashed?: boolean
  /** True when this row is rendered between two text segments (inline mode). */
  inline?: boolean
}

export interface WorkingRow {
  kind: 'working'
  id: string
  /** True when streaming text/thinking is already visible — show a subtle dot instead of cycling words */
  hasStreamingContent?: boolean
  /** Epoch ms when this working state started (for elapsed timer and stuck detection).
   *  Currently not populated by timeline derivation — the component falls back to
   *  `Date.now()` at mount time, which resets on remount. Populate this from the
   *  task store's turn-start timestamp when that becomes available. */
  startedAt?: number
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

// ── Options ──────────────────────────────────────────────────────

export interface DeriveTimelineOptions {
  /**
   * When true, interleave tool calls between assistant text segments based on
   * {@link TaskMessage.toolCallSplits} for persisted messages and the live
   * `liveToolSplits` for the in-flight turn. When the splits array is missing
   * or empty for a given message/turn, that message falls back to the
   * grouped layout. Default: false (preserve historical behavior).
   */
  inlineToolCalls?: boolean
  /** Anchors recorded for the currently streaming turn. Used only in inline mode. */
  liveToolSplits?: ToolCallSplit[]
}

// ── Pure helpers ─────────────────────────────────────────────────

/**
 * Split assistant text content into ordered segments interleaved with tool
 * calls based on the supplied splits. Splits whose offset falls outside the
 * content range are clamped to the boundary. Tool calls without a matching
 * split id are appended to the end so they aren't lost.
 *
 * Returns an ordered list of segments — each is either a piece of text or
 * a single tool call. Empty leading/trailing text segments are omitted.
 */
export interface InlineSegment {
  kind: 'text' | 'tool'
  text?: string
  toolCall?: ToolCall
}

/**
 * Snap a split offset to the nearest preceding double-newline boundary (or
 * single-newline if no double exists in the prefix). This keeps rendered
 * markdown well-formed when the agent invokes tools mid-paragraph or
 * mid-fenced-block — slicing in those positions can leave unterminated
 * code fences or broken inline spans on either side. The cost is that
 * tool entries snap "up" to the start of the paragraph that contained
 * them, which reads naturally for users.
 *
 * Also guards against landing between UTF-16 surrogate halves: streaming
 * offsets are recorded as `streamingChunks[taskId].length`, which counts
 * code units, so an emoji emitted right before a tool call can leave the
 * split sitting between a high and low surrogate. Slicing there would
 * produce a malformed string. When no newline boundary exists we step the
 * offset back by one to escape the pair.
 */
function snapToBlockBoundary(content: string, at: number): number {
  if (at <= 0 || at >= content.length) return at
  const prefix = content.slice(0, at)
  const para = prefix.lastIndexOf('\n\n')
  if (para >= 0) return para + 2
  const line = prefix.lastIndexOf('\n')
  if (line >= 0) return line + 1
  // No newline before this point — keep the original offset so we don't
  // drop the entire prefix (which would always render as orphan tool calls
  // followed by all the text). Step back by one if we'd otherwise split a
  // surrogate pair so the rendered text isn't garbled.
  const code = content.charCodeAt(at - 1)
  if (code >= 0xd800 && code <= 0xdbff) return at - 1
  return at
}

export function buildInlineSegments(
  content: string,
  toolCalls: ToolCall[] | undefined,
  splits: ToolCallSplit[] | undefined,
): InlineSegment[] {
  const tools = toolCalls ?? []
  if (tools.length === 0) {
    return content.length > 0 ? [{ kind: 'text', text: content }] : []
  }

  const byId = new Map<string, ToolCall>()
  for (const tc of tools) byId.set(tc.toolCallId, tc)

  // Sort splits by offset, snap to a safe markdown boundary so we don't
  // bisect a code fence or inline span, then drop entries that don't match
  // a known tool call. When two splits share the same offset (common for
  // MCP tools batched in a single agent step), break the tie by the tool
  // call's `createdAt` so insertion order matches the order the agent
  // emitted them.
  const sorted = (splits ?? [])
    .filter((split) => byId.has(split.toolCallId))
    .map((split) => ({
      at: snapToBlockBoundary(content, Math.max(0, Math.min(split.at, content.length))),
      toolCallId: split.toolCallId,
    }))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at
      const aAt = byId.get(a.toolCallId)?.createdAt ?? ''
      const bAt = byId.get(b.toolCallId)?.createdAt ?? ''
      return aAt.localeCompare(bAt)
    })

  const segments: InlineSegment[] = []
  let cursor = 0
  const consumed = new Set<string>()

  for (const split of sorted) {
    if (consumed.has(split.toolCallId)) continue
    if (split.at > cursor) {
      segments.push({ kind: 'text', text: content.slice(cursor, split.at) })
      cursor = split.at
    }
    const tc = byId.get(split.toolCallId)
    if (tc) {
      segments.push({ kind: 'tool', toolCall: tc })
      consumed.add(split.toolCallId)
    }
  }

  // Tail text after the last split.
  if (cursor < content.length) {
    segments.push({ kind: 'text', text: content.slice(cursor) })
  }

  // Append any tool calls that lacked a split anchor (e.g. legacy messages).
  for (const tc of tools) {
    if (!consumed.has(tc.toolCallId)) {
      segments.push({ kind: 'tool', toolCall: tc })
    }
  }

  return segments
}

/** Strip empty text segments. */
function compactSegments(segments: InlineSegment[]): InlineSegment[] {
  return segments.filter((seg) => {
    if (seg.kind === 'tool') return true
    return (seg.text ?? '').length > 0
  })
}

/**
 * Group consecutive `tool` segments into a single work block so adjacent
 * tool calls render as one card rather than a stack of single-call cards.
 */
function groupAdjacentTools(segments: InlineSegment[]): Array<{ kind: 'text'; text: string } | { kind: 'tools'; toolCalls: ToolCall[] }> {
  const out: Array<{ kind: 'text'; text: string } | { kind: 'tools'; toolCalls: ToolCall[] }> = []
  for (const seg of segments) {
    if (seg.kind === 'text') {
      out.push({ kind: 'text', text: seg.text ?? '' })
      continue
    }
    if (!seg.toolCall) continue
    const last = out[out.length - 1]
    if (last && last.kind === 'tools') {
      // `last.toolCalls` is a fresh array we created in this loop, so a
      // direct push is safe and avoids the O(n²) spread cost on long runs.
      last.toolCalls.push(seg.toolCall)
    } else {
      out.push({ kind: 'tools', toolCalls: [seg.toolCall] })
    }
  }
  return out
}

// ── Derivation ───────────────────────────────────────────────────

/**
 * Convert messages + live streaming state into a flat, ordered list of
 * timeline rows. Each row becomes a separate virtualizer item.
 *
 * For persisted assistant messages (default layout):
 *   - assistant text row first (the message content)
 *   - then tool calls row (work) below as a compact activity log
 *
 * For persisted assistant messages (inline layout, when
 * `options.inlineToolCalls` is true and the message has `toolCallSplits`):
 *   - one row per text segment, interspersed with `work` rows that contain
 *     the tool call(s) that appeared at that point
 *   - file-mutation `changed-files` row still appears after the message
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
  options?: DeriveTimelineOptions,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  const inlineMode = options?.inlineToolCalls === true

  // Precompute, for each index, whether any *later* user message has
  // questionAnswers attached. This collapses the O(N²) `slice + some`
  // lookup that used to run inside the assistant-message branch into a
  // single O(N) backwards pass — meaningful on long threads where the
  // timeline is recomputed every streaming token.
  const hasQuestionAnswerAfter: boolean[] = new Array(messages.length).fill(false)
  {
    let seen = false
    for (let i = messages.length - 1; i >= 0; i--) {
      hasQuestionAnswerAfter[i] = seen
      const m = messages[i]
      if (m.role === 'user' && m.questionAnswers && m.questionAnswers.length > 0) {
        seen = true
      }
    }
  }

  // ── Persisted messages ──────────────────────────────────────
  let inTangent = false
  let lastUserTimestamp: string | null = null
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
      lastUserTimestamp = msg.timestamp
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
      const isConnectionLost = msg.content.includes('Connection to the agent was lost')
      const isError = msg.content.startsWith('⚠️') || msg.content.toLowerCase().includes('failed')
      const variant: SystemMessageVariant = isWorktree ? 'worktree' : isConnectionLost ? 'connection_lost' : isError ? 'error' : 'info'
      rows.push({
        kind: 'system-message',
        id: `msg-${i}-system`,
        content: msg.content,
        timestamp: msg.timestamp,
        variant,
      })
      continue
    }

    // Assistant message
    const hasToolCalls = !!(msg.toolCalls && msg.toolCalls.length > 0)
    const hasFileChanges = hasToolCalls && msg.toolCalls!.some(
      (tc) => tc.status === 'completed' && isFileMutation(tc.kind, tc.title),
    )
    // Pre-compute questionsAnswered — same logic in both layouts.
    // The O(N) `messages.slice + some` has been replaced by a single
    // index lookup into `hasQuestionAnswerAfter`, which is built once
    // per `deriveTimeline` call.
    const questionsAnswered = !!(msg.content && hasInteractiveQuestionBlocks(msg.content) &&
      hasQuestionAnswerAfter[i])

    // Inline rendering only kicks in when we have splits to interleave by;
    // without splits we'd produce identical output to the grouped layout.
    const canInline = inlineMode && hasToolCalls && (msg.toolCallSplits?.length ?? 0) > 0

    if (canInline) {
      const segments = compactSegments(
        buildInlineSegments(msg.content, msg.toolCalls, msg.toolCallSplits),
      )
      const grouped = groupAdjacentTools(segments)
      // Identify the trailing text segment so we render thinking/report on it.
      let lastTextIndex = -1
      for (let j = grouped.length - 1; j >= 0; j--) {
        if (grouped[j].kind === 'text') { lastTextIndex = j; break }
      }
      const showDivider = lastUserTimestamp !== null
      let dividerShown = false
      // If the message had thinking but no text segments survived, still show it once.
      if (lastTextIndex < 0 && msg.thinking) {
        rows.push({
          kind: 'assistant-text',
          id: `msg-${i}-text`,
          content: '',
          timestamp: msg.timestamp,
          thinking: msg.thinking,
          squashed: true,
          hasChangedFiles: hasFileChanges,
          questionsAnswered,
          showCompletionDivider: showDivider,
          messageIndex: i,
          isTurnBoundary: true,
        })
        dividerShown = true
      }
      for (let j = 0; j < grouped.length; j++) {
        const block = grouped[j]
        if (block.kind === 'text') {
          const isLastText = j === lastTextIndex
          // Trailing block? Then it owns thinking + completion-footer state.
          rows.push({
            kind: 'assistant-text',
            id: `msg-${i}-text-${j}`,
            content: block.text,
            timestamp: msg.timestamp,
            thinking: isLastText ? msg.thinking : undefined,
            // squashed if anything else follows in this message
            squashed: isLastText ? hasFileChanges : true,
            hasChangedFiles: isLastText ? hasFileChanges : false,
            questionsAnswered: isLastText ? questionsAnswered : false,
            isInlineSegment: !isLastText,
            showCompletionDivider: !dividerShown && showDivider,
            messageIndex: i,
            isTurnBoundary: isLastText,
          })
          dividerShown = true
        } else {
          rows.push({
            kind: 'work',
            id: `msg-${i}-work-${j}`,
            toolCalls: block.toolCalls,
            squashed: true,
            inline: true,
          })
        }
      }
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
      lastUserTimestamp = null
      continue
    }

    // Default (grouped) layout: text first, then tool calls below
    if (msg.content || msg.thinking) {
      // Compute response duration using the tracked lastUserTimestamp (O(1) instead of scanning backwards)
      let durationMs: number | undefined
      if (msg.timestamp && lastUserTimestamp) {
        const start = new Date(lastUserTimestamp).getTime()
        const end = new Date(msg.timestamp).getTime()
        if (start > 0 && end > start) durationMs = end - start
      }
      const showDivider = lastUserTimestamp !== null
      rows.push({
        kind: 'assistant-text',
        id: `msg-${i}-text`,
        content: msg.content,
        timestamp: msg.timestamp,
        thinking: msg.thinking,
        squashed: hasToolCalls,
        hasChangedFiles: hasFileChanges,
        questionsAnswered,
        durationMs,
        showCompletionDivider: showDivider,
        messageIndex: i,
        isTurnBoundary: true,
      })
      lastUserTimestamp = null
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

  // Inline rendering for the live turn: interleave the streaming buffer with
  // any tool calls observed so far. We always end with a working/dot indicator
  // when running so the user sees activity.
  const canInlineLive = inlineMode && hasLiveTools && (options?.liveToolSplits?.length ?? 0) > 0

  if (canInlineLive) {
    const segments = compactSegments(
      buildInlineSegments(streamingChunk ?? '', liveToolCalls, options?.liveToolSplits),
    )
    const grouped = groupAdjacentTools(segments)
    let lastTextIndex = -1
    for (let j = grouped.length - 1; j >= 0; j--) {
      if (grouped[j].kind === 'text') { lastTextIndex = j; break }
    }
    // If we have thinking but no text segments survived, surface it on a leading row.
    if (lastTextIndex < 0 && hasLiveThinking) {
      rows.push({
        kind: 'assistant-text',
        id: 'live-text-thinking',
        content: '',
        timestamp: '',
        thinking: liveThinking,
        isStreaming: true,
        squashed: true,
        isInlineSegment: true,
      })
    }
    for (let j = 0; j < grouped.length; j++) {
      const block = grouped[j]
      if (block.kind === 'text') {
        const isLastText = j === lastTextIndex
        // Only the trailing text segment carries the blinking-cursor affordance.
        // Middle segments are effectively frozen — once a tool call splits past
        // them their content can't grow, so painting a cursor on each one would
        // produce a row of cursors stacked through the prose.
        rows.push({
          kind: 'assistant-text',
          id: `live-text-${j}`,
          content: block.text,
          timestamp: '',
          thinking: isLastText ? liveThinking : undefined,
          isStreaming: isLastText,
          squashed: true,
          isInlineSegment: !isLastText,
        })
      } else {
        rows.push({
          kind: 'work',
          id: `live-work-${j}`,
          toolCalls: block.toolCalls,
          squashed: true,
          inline: true,
        })
      }
    }
    if (isRunning) {
      rows.push({ kind: 'working', id: 'working', hasStreamingContent: hasLiveText || hasLiveThinking })
    }
    return rows
  }

  // Default (grouped) live layout — unchanged from historical behavior.
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
