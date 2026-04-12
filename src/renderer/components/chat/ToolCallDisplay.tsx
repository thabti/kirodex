import { memo, useState, useMemo } from 'react'
import {
  IconChevronDown, IconChevronRight, IconCheck, IconLoader2, IconX, IconBolt,
} from '@tabler/icons-react'
import type { ToolCall } from '@/types'
import { ToolCallEntry } from './ToolCallEntry'

const MAX_VISIBLE_DEFAULT = 6

interface ToolCallDisplayProps {
  toolCalls: ToolCall[]
}

export const ToolCallDisplay = memo(function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  if (!toolCalls.length) return null

  const { completedCount, runningCount, failedCount } = useMemo(() => {
    let completed = 0, running = 0, failed = 0
    for (const tc of toolCalls) {
      if (tc.status === 'completed') completed++
      else if (tc.status === 'in_progress') running++
      else if (tc.status === 'failed') failed++
    }
    return { completedCount: completed, runningCount: running, failedCount: failed }
  }, [toolCalls])

  const visibleCalls = showAll ? toolCalls : toolCalls.slice(0, MAX_VISIBLE_DEFAULT)
  const hasMore = toolCalls.length > MAX_VISIBLE_DEFAULT

  return (
    <div data-testid="tool-call-display" className="rounded-lg border border-border/20 bg-card/15">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-accent/5"
      >
        {expanded ? (
          <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/40" />
        ) : (
          <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
        )}
        <IconBolt className="size-3.5 shrink-0 text-amber-400/60" />
        <span className="text-[13px] font-medium text-muted-foreground/60">
          Tool calls
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/35">
          ({toolCalls.length})
        </span>

        <div className="flex-1" />
        {runningCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-primary">
            <IconLoader2 className="size-3 animate-spin" />
            {runningCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-red-400">
            <IconX className="size-3" />
            {failedCount}
          </span>
        )}
        {completedCount > 0 && runningCount === 0 && failedCount === 0 && (
          <IconCheck className="size-3.5 text-emerald-400/50" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/20 py-1">
          {visibleCalls.map((tc) => (
            <ToolCallEntry key={tc.toolCallId} toolCall={tc} allToolCalls={toolCalls} />
          ))}
          {hasMore && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-3 py-1.5 text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/60"
            >
              +{toolCalls.length - MAX_VISIBLE_DEFAULT} more
            </button>
          )}
        </div>
      )}
    </div>
  )
})
