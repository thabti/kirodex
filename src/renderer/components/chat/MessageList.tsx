import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconArrowDown } from '@tabler/icons-react'
import type { TaskMessage, ToolCall } from '@/types'
import { deriveTimeline, type TimelineRow } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import {
  UserMessageRow,
  SystemMessageRow,
  AssistantTextRow,
  WorkGroupRow,
  WorkingRow,
  ChangedFilesSummary,
} from './TimelineRows'

const AUTO_SCROLL_THRESHOLD = 150

/** Per-row-type height estimates so the virtualizer doesn't leave large gaps
 *  before measureElement fires. Overestimating slightly is better than
 *  underestimating — underestimates cause rows to overlap until measured. */
const ROW_HEIGHT_ESTIMATES: Record<string, number> = {
  'user-message': 72,
  'system-message': 44,
  'assistant-text': 100,
  'work': 64,
  'working': 40,
  'changed-files': 120,
}

interface MessageListProps {
  messages: TaskMessage[]
  streamingChunk?: string
  liveToolCalls?: ToolCall[]
  liveThinking?: string
  isRunning?: boolean
  /** IDs of timeline rows that match the current search query */
  searchMatchIds?: string[]
  /** ID of the currently active (focused) search match */
  activeMatchId?: string | null
  /** Callback to expose derived timeline rows to the parent */
  onTimelineRows?: (rows: TimelineRow[]) => void
}

export const MessageList = memo(function MessageList({
  messages,
  streamingChunk,
  liveToolCalls,
  liveThinking,
  isRunning,
  searchMatchIds,
  activeMatchId,
  onTimelineRows,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)
  /** Guard so programmatic scrolls don't flip isNearBottomRef */
  const isProgrammaticScrollRef = useRef(false)

  const timelineRows = useMemo(
    () => deriveTimeline(messages, streamingChunk, liveToolCalls, liveThinking, isRunning),
    [messages, streamingChunk, liveToolCalls, liveThinking, isRunning],
  )

  // Expose timeline rows to parent for search
  useEffect(() => {
    onTimelineRows?.(timelineRows)
  }, [timelineRows, onTimelineRows])

  const matchIdSet = useMemo(
    () => (searchMatchIds ? new Set(searchMatchIds) : null),
    [searchMatchIds],
  )

  const estimateSize = useCallback(
    (index: number) => ROW_HEIGHT_ESTIMATES[timelineRows[index]?.kind] ?? 60,
    [timelineRows],
  )

  const virtualizer = useVirtualizer({
    count: timelineRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
  })

  const scrollToBottom = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    isNearBottomRef.current = true
    setShowScrollBtn(false)
    isProgrammaticScrollRef.current = true
    el.scrollTop = el.scrollHeight
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false
    })
  }, [])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const handleScroll = () => {
      // Ignore scroll events triggered by our own programmatic scrolls
      if (isProgrammaticScrollRef.current) return
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearBottom = distFromBottom < AUTO_SCROLL_THRESHOLD
      isNearBottomRef.current = nearBottom
      setShowScrollBtn(!nearBottom)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll when new content arrives and user is near bottom.
  // Use raw scrollTop instead of scrollToIndex to avoid fighting
  // the virtualizer's stale measurements during streaming.
  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = parentRef.current
    if (!el) return
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = true
      el.scrollTop = el.scrollHeight
      // Reset the flag after the browser processes the scroll event
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false
      })
    })
  }, [timelineRows, streamingChunk, liveToolCalls, liveThinking])

  // Scroll to the active search match
  useEffect(() => {
    if (!activeMatchId) return
    const idx = timelineRows.findIndex((r) => r.id === activeMatchId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
    }
  }, [activeMatchId, timelineRows, virtualizer])

  if (!timelineRows.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-[15px]">Send a message to start the conversation.</p>
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        data-testid="message-list"
        className="h-full overflow-auto overscroll-y-contain px-0"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = timelineRows[virtualRow.index]
            const isMatch = matchIdSet?.has(row.id) ?? false
            const isActive = row.id === activeMatchId
            return (
              <div
                key={row.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-timeline-row-kind={row.kind}
                data-row-id={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  'transition-colors duration-200',
                  isActive && 'bg-primary/10',
                  isMatch && !isActive && 'bg-primary/5',
                  virtualRow.index === 0 && 'pt-4 sm:pt-6',
                  virtualRow.index === timelineRows.length - 1 && 'pb-6 sm:pb-8',
                )}
              >
                <div className="mx-auto w-full min-w-0 max-w-3xl px-5 sm:px-8 lg:max-w-4xl xl:max-w-5xl">
                  <TimelineRowRenderer row={row} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          data-testid="scroll-to-bottom-button"
          className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] text-muted-foreground shadow-lg transition-colors hover:border-primary hover:text-foreground"
        >
          <IconArrowDown className="size-3" />
          Scroll to bottom
        </button>
      )}
    </div>
  )
})

// ── Row dispatcher ────────────────────────────────────────────

const TimelineRowRenderer = memo(function TimelineRowRenderer({ row }: { row: TimelineRow }) {
  switch (row.kind) {
    case 'user-message':
      return <UserMessageRow row={row} />
    case 'system-message':
      return <SystemMessageRow row={row} />
    case 'assistant-text':
      return <AssistantTextRow row={row} />
    case 'work':
      return <WorkGroupRow row={row} />
    case 'working':
      return <WorkingRow row={row} />
    case 'changed-files':
      return <ChangedFilesSummary row={row} />
  }
})
