import { memo, useState } from 'react'
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

  const completedCount = toolCalls.filter((tc) => tc.status === 'completed').length
  const runningCount = toolCalls.filter((tc) => tc.status === 'in_progress').length
  const failedCount = toolCalls.filter((tc) => tc.status === 'failed').length

  const visibleCalls = showAll ? toolCalls : toolCalls.slice(0, MAX_VISIBLE_DEFAULT)
  const hasMore = toolCalls.length > MAX_VISIBLE_DEFAULT

  return (
    <div data-testid="tool-call-display" className="rounded-lg border border-border/30 bg-card/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/5"
      >
        {expanded ? (
          <IconChevronDown className="size-3 shrink-0 text-muted-foreground/40" />
        ) : (
          <IconChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
        )}
        <IconBolt className="size-3 shrink-0 text-amber-400/60" />
        <span className="text-[11px] font-medium text-muted-foreground/60">
          Tool calls
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/35">
          ({toolCalls.length})
        </span>

        <div className="flex-1" />
        {runningCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-primary">
            <IconLoader2 className="size-2.5 animate-spin" />
            {runningCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-red-400">
            <IconX className="size-2.5" />
            {failedCount}
          </span>
        )}
        {completedCount > 0 && runningCount === 0 && failedCount === 0 && (
          <IconCheck className="size-3 text-emerald-400/50" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/20 py-0.5">
          {visibleCalls.map((tc) => (
            <ToolCallEntry key={tc.toolCallId} toolCall={tc} />
          ))}
          {hasMore && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-2 py-1 text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/60"
            >
              +{toolCalls.length - MAX_VISIBLE_DEFAULT} more
            </button>
          )}
        </div>
      )}
    </div>
  )
})
