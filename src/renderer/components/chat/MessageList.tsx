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
  'user-message': 72,
  'system-message': 72,
  'assistant-text': 96,
  'work': 140,
  'working': 48,
  'changed-files': 160,
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

  // Stable identity key that changes when the row list changes structurally
  // (not just content). Used to trigger virtualizer remeasure and auto-scroll.
  const rowFingerprint = useMemo(
    () => timelineRows.map((r) => r.id).join(','),
    [timelineRows],
  )

  const virtualizer = useVirtualizer({
    count: timelineRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => ROW_ESTIMATES[timelineRows[index]?.kind ?? 'assistant-text'],
    overscan: 8,
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

  // Force virtualizer to recalculate when rows change structurally.
  // Without this, stale cached measurements from previous rows cause
  // content to appear missing until the user scrolls.
  useEffect(() => {
    virtualizer.measure()
  }, [rowFingerprint, virtualizer])

  useEffect(() => {
    if (isNearBottomRef.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }, [rowFingerprint, streamingChunk, liveToolCalls, liveThinking, scrollToBottom])

  if (!timelineRows.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-[15px]">Send a message to start the conversation.</p>
      </div>
    )
  }

  return (
    <div ref={parentRef} data-testid="message-list" className="relative min-h-0 flex-1 overflow-auto overscroll-y-contain px-0 py-4 sm:py-6">
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
              <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-5 sm:px-8 lg:max-w-4xl xl:max-w-5xl">
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
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] text-muted-foreground shadow-lg transition-colors hover:bg-secondary"
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
