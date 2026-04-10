import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconArrowDown } from '@tabler/icons-react'
import type { TaskMessage, ToolCall } from '@/types'
import { deriveTimeline, type TimelineRow } from '@/lib/timeline'
import {
  UserMessageRow,
  SystemMessageRow,
  AssistantTextRow,
  WorkGroupRow,
  WorkingRow,
  ChangedFilesSummary,
} from './TimelineRows'

const AUTO_SCROLL_THRESHOLD = 150

const ROW_ESTIMATES: Record<TimelineRow['kind'], number> = {
  'user-message': 60,
  'system-message': 60,
  'assistant-text': 80,
  'work': 40,
  'working': 40,
  'changed-files': 48,
}

interface MessageListProps {
  messages: TaskMessage[]
  streamingChunk?: string
  liveToolCalls?: ToolCall[]
  liveThinking?: string
  isRunning?: boolean
}

export const MessageList = memo(function MessageList({
  messages,
  streamingChunk,
  liveToolCalls,
  liveThinking,
  isRunning,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)

  const timelineRows = useMemo(
    () => deriveTimeline(messages, streamingChunk, liveToolCalls, liveThinking, isRunning),
    [messages, streamingChunk, liveToolCalls, liveThinking, isRunning],
  )

  const virtualizer = useVirtualizer({
    count: timelineRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => ROW_ESTIMATES[timelineRows[index]?.kind ?? 'assistant-text'],
    overscan: 5,
    getItemKey: (index) => timelineRows[index]?.id ?? index,
  })

  const scrollToBottom = useCallback(() => {
    if (!parentRef.current) return
    parentRef.current.scrollTop = parentRef.current.scrollHeight
  }, [])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearBottom = distFromBottom < AUTO_SCROLL_THRESHOLD
      isNearBottomRef.current = nearBottom
      setShowScrollBtn(!nearBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (isNearBottomRef.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }, [timelineRows.length, streamingChunk, liveToolCalls, liveThinking, scrollToBottom])

  if (!timelineRows.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-sm">Send a message to start the conversation.</p>
      </div>
    )
  }

  return (
    <div ref={parentRef} data-testid="message-list" className="relative min-h-0 flex-1 overflow-auto overscroll-y-contain px-0 py-3 sm:py-4">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = timelineRows[virtualRow.index]
          if (!row) return null
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="mx-auto w-full min-w-0 max-w-2xl overflow-x-hidden px-4 sm:px-6 lg:max-w-3xl xl:max-w-4xl">
                <TimelineRowRenderer row={row} />
              </div>
            </div>
          )
        })}
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          data-testid="scroll-to-bottom-button"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-lg transition-colors hover:bg-secondary"
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
      return <WorkingRow />
    case 'changed-files':
      return <ChangedFilesSummary row={row} />
  }
})
