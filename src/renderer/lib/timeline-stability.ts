/**
 * Stable row identity for timeline rendering.
 *
 * Instead of returning fresh objects from `deriveTimeline` on every render,
 * this module maintains referential identity for rows whose content hasn't
 * changed. This prevents unnecessary virtualizer re-measurement and React
 * re-renders during streaming.
 */

import type { TimelineRow, UserMessageRow, SystemMessageRow, AssistantTextRow, WorkRow, WorkingRow, ChangedFilesRow } from './timeline'

export interface StableTimelineState {
  byId: Map<string, TimelineRow>
  result: TimelineRow[]
}

export const EMPTY_STABLE_STATE: StableTimelineState = {
  byId: new Map(),
  result: [],
}

/**
 * Compare two timeline rows for shallow equality based on their variant.
 * Returns true if the row content is unchanged and the previous reference
 * can be reused.
 */
function isRowUnchanged(prev: TimelineRow, next: TimelineRow): boolean {
  if (prev.kind !== next.kind || prev.id !== next.id) return false

  switch (prev.kind) {
    case 'user-message': {
      const b = next as UserMessageRow
      return (
        prev.content === b.content &&
        prev.timestamp === b.timestamp &&
        prev.questionAnswers === b.questionAnswers
      )
    }
    case 'system-message': {
      const b = next as SystemMessageRow
      return (
        prev.content === b.content &&
        prev.timestamp === b.timestamp &&
        prev.variant === b.variant
      )
    }
    case 'assistant-text': {
      const b = next as AssistantTextRow
      return (
        prev.content === b.content &&
        prev.timestamp === b.timestamp &&
        prev.thinking === b.thinking &&
        prev.isStreaming === b.isStreaming &&
        prev.squashed === b.squashed &&
        prev.hasChangedFiles === b.hasChangedFiles &&
        prev.questionsAnswered === b.questionsAnswered &&
        prev.isInlineSegment === b.isInlineSegment &&
        prev.durationMs === b.durationMs &&
        prev.showCompletionDivider === b.showCompletionDivider &&
        prev.showModelLabel === b.showModelLabel
      )
    }
    case 'work': {
      const b = next as WorkRow
      return prev.toolCalls === b.toolCalls && prev.squashed === b.squashed && prev.inline === b.inline
    }
    case 'working': {
      const b = next as WorkingRow
      return prev.hasStreamingContent === b.hasStreamingContent && prev.startedAt === b.startedAt
    }
    case 'changed-files': {
      const b = next as ChangedFilesRow
      return prev.toolCalls === b.toolCalls && prev.report === b.report
    }
  }
}

/**
 * Given a freshly derived set of timeline rows and the previous stable state,
 * return a new state that reuses object references for unchanged rows.
 *
 * This is the key optimization: React's reconciler and the virtualizer both
 * use referential equality to decide whether to re-render/re-measure. By
 * preserving references for unchanged rows, we avoid unnecessary work.
 */
export function computeStableTimelineRows(
  nextRows: TimelineRow[],
  previous: StableTimelineState,
): StableTimelineState {
  const nextById = new Map<string, TimelineRow>()
  let anyChanged = nextRows.length !== previous.byId.size

  const result = nextRows.map((row, index) => {
    const prevRow = previous.byId.get(row.id)
    // Reuse the previous reference if the row content is unchanged
    const stableRow = prevRow && isRowUnchanged(prevRow, row) ? prevRow : row
    nextById.set(row.id, stableRow)
    if (!anyChanged && previous.result[index] !== stableRow) {
      anyChanged = true
    }
    return stableRow
  })

  // If nothing changed at all, return the previous state to preserve
  // the top-level array reference too
  return anyChanged ? { byId: nextById, result } : previous
}
