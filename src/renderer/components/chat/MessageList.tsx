import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconArrowDown } from '@tabler/icons-react'
import type { TaskMessage, ToolCall, ToolCallSplit } from '@/types'
import { deriveTimeline, type TimelineRow } from '@/lib/timeline'
import { computeStableTimelineRows, EMPTY_STABLE_STATE, type StableTimelineState } from '@/lib/timeline-stability'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/stores/taskStore'
import { createContext, useContext } from 'react'
import {
  UserMessageRow,
  SystemMessageRow,
  AssistantTextRow,
  WorkGroupRow,
  WorkingRow,
  ChangedFilesSummary,
} from './TimelineRows'

/** Context to pass the current taskId down to deeply nested components (e.g. QuestionCards) */
export const MessageListTaskIdContext = createContext<string | null>(null)
export const useMessageListTaskId = (): string | null => useContext(MessageListTaskIdContext)

import { AUTO_SCROLL_THRESHOLD, ROW_HEIGHT_ESTIMATES } from './MessageList.logic'
import { SelectionToolbar } from '@/components/diff/SelectionToolbar'

interface MessageListProps {
  taskId?: string | null
  messages: TaskMessage[]
  streamingChunk?: string
  liveToolCalls?: ToolCall[]
  liveToolSplits?: ToolCallSplit[]
  liveThinking?: string
  isRunning?: boolean
  /** When true, render tool calls inline within prose (Cursor / Kiro IDE style). */
  inlineToolCalls?: boolean
  /** IDs of timeline rows that match the current search query */
  searchMatchIds?: string[]
  /** ID of the currently active (focused) search match */
  activeMatchId?: string | null
  /** Callback to expose derived timeline rows to the parent */
  onTimelineRows?: (rows: TimelineRow[]) => void
  /** Optional header content rendered inside the scroll container (scrolls with messages) */
  headerContent?: React.ReactNode
  /** Current workspace — forwarded to SelectionToolbar for new-thread action */
  workspace?: string | null
}

export const MessageList = memo(function MessageList({
  taskId,
  messages,
  streamingChunk,
  liveToolCalls,
  liveToolSplits,
  liveThinking,
  isRunning,
  inlineToolCalls,
  searchMatchIds,
  activeMatchId,
  onTimelineRows,
  headerContent,
  workspace,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)
  /** Guard so programmatic scrolls don't flip isNearBottomRef */
  const isProgrammaticScrollRef = useRef(false)
  const prevTaskIdRef = useRef(taskId)
  /** True while we're waiting for the virtualizer to settle after a thread switch */
  const pendingScrollRef = useRef<'bottom' | number | null>(null)

  // Save scroll position when switching away from a thread
  useEffect(() => {
    const prevId = prevTaskIdRef.current
    if (prevId === taskId) return
    // Save the old thread's scroll position
    if (prevId && parentRef.current) {
      useTaskStore.getState().saveScrollPosition(prevId, parentRef.current.scrollTop)
    }
    prevTaskIdRef.current = taskId
    // Reset stable timeline state for the new thread
    stableStateRef.current = EMPTY_STABLE_STATE
    // Always scroll to bottom when switching threads
    if (!taskId) return
    isNearBottomRef.current = true
    pendingScrollRef.current = 'bottom'
  }, [taskId])

  // Save scroll position on unmount (e.g., switching to dashboard/analytics)
  useEffect(() => {
    return () => {
      // Cancel any in-flight scroll retry loop
      scrollGenRef.current++
      const id = prevTaskIdRef.current
      if (id && parentRef.current) {
        useTaskStore.getState().saveScrollPosition(id, parentRef.current.scrollTop)
      }
    }
  }, [])

  // Derive raw timeline rows
  const rawTimelineRows = useMemo(
    () => deriveTimeline(messages, streamingChunk, liveToolCalls, liveThinking, isRunning, {
      inlineToolCalls,
      liveToolSplits,
    }),
    [messages, streamingChunk, liveToolCalls, liveThinking, isRunning, inlineToolCalls, liveToolSplits],
  )

  // Stabilize row references: reuse previous objects when content hasn't changed.
  // This prevents unnecessary virtualizer re-measurement and React re-renders
  // during streaming, where only the live-text row changes each frame.
  const stableStateRef = useRef<StableTimelineState>(EMPTY_STABLE_STATE)
  const stableState = useMemo(() => {
    const next = computeStableTimelineRows(rawTimelineRows, stableStateRef.current)
    stableStateRef.current = next
    return next
  }, [rawTimelineRows])

  const timelineRows = stableState.result

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

  /** Cancellation token for in-flight scroll-to-bottom retry loops.
   *  Incrementing this aborts any loop started with a previous value. */
  const scrollGenRef = useRef(0)

  /** Scroll to the last virtualizer item, retrying until scrollHeight stabilizes.
   *  Each call increments the generation counter, cancelling any prior loop. */
  const scrollToBottomStable = useCallback((maxRetries: number) => {
    const gen = ++scrollGenRef.current
    isProgrammaticScrollRef.current = true
    isNearBottomRef.current = true
    setShowScrollBtn(false)
    if (timelineRows.length === 0) {
      const el = parentRef.current
      if (el) el.scrollTop = el.scrollHeight
      requestAnimationFrame(() => { isProgrammaticScrollRef.current = false })
      return
    }
    let retries = 0
    let lastScrollHeight = parentRef.current?.scrollHeight ?? 0
    const tick = (): void => {
      if (gen !== scrollGenRef.current) return // cancelled
      const el = parentRef.current
      if (!el) { isProgrammaticScrollRef.current = false; return }
      virtualizer.scrollToIndex(timelineRows.length - 1, { align: 'end' })
      requestAnimationFrame(() => {
        if (gen !== scrollGenRef.current) return
        if (!parentRef.current) { isProgrammaticScrollRef.current = false; return }
        parentRef.current.scrollTop = parentRef.current.scrollHeight
        const h = parentRef.current.scrollHeight
        retries++
        if (h !== lastScrollHeight && retries < maxRetries) {
          lastScrollHeight = h
          requestAnimationFrame(tick)
        } else {
          requestAnimationFrame(() => { isProgrammaticScrollRef.current = false })
        }
      })
    }
    requestAnimationFrame(tick)
  }, [timelineRows.length, virtualizer])

  const scrollToBottom = useCallback(() => {
    scrollToBottomStable(10)
  }, [scrollToBottomStable])

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

  // Execute pending scroll after the virtualizer has laid out the new content.
  // For scroll-to-bottom on long threads, the virtualizer's total size is based on
  // estimated row heights. After the initial scroll, visible items get measured,
  // total size changes, and the scroll position drifts. scrollToBottomStable retries
  // until scrollHeight stabilizes.
  useEffect(() => {
    if (pendingScrollRef.current === null) return
    if (timelineRows.length === 0) return
    const target = pendingScrollRef.current
    pendingScrollRef.current = null
    if (target === 'bottom') {
      scrollToBottomStable(15)
    } else {
      isProgrammaticScrollRef.current = true
      requestAnimationFrame(() => {
        const el = parentRef.current
        if (!el) { isProgrammaticScrollRef.current = false; return }
        el.scrollTop = target
        const distFromBottom = el.scrollHeight - target - el.clientHeight
        isNearBottomRef.current = distFromBottom < AUTO_SCROLL_THRESHOLD
        setShowScrollBtn(!isNearBottomRef.current)
        requestAnimationFrame(() => { isProgrammaticScrollRef.current = false })
      })
    }
  }, [taskId, timelineRows.length, scrollToBottomStable])

  // Auto-scroll when new content arrives and user is near bottom.
  useEffect(() => {
    if (!isNearBottomRef.current) return
    // Don't auto-scroll if we have a pending thread-switch scroll
    if (pendingScrollRef.current !== null) return
    const el = parentRef.current
    if (!el) return
    isProgrammaticScrollRef.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
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
    <MessageListTaskIdContext.Provider value={taskId ?? null}>
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        data-testid="message-list"
        className="h-full overflow-auto overscroll-y-contain px-0"
      >
        {headerContent}
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
      <SelectionToolbar containerRef={parentRef} workspace={workspace} />
    </div>
    </MessageListTaskIdContext.Provider>
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
