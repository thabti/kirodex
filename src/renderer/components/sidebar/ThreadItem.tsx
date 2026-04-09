import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { SidebarTask } from '@/hooks/useSidebarTasks'

const STATUS_DOT: Record<string, { color: string; pulse?: boolean }> = {
  running: { color: 'bg-emerald-400', pulse: true },
  pending_permission: { color: 'bg-amber-400' },
  error: { color: 'bg-red-400' },
  cancelled: { color: 'bg-red-400/50' },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface ThreadItemProps {
  task: SidebarTask
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
}

export const ThreadItem = memo(function ThreadItem({ task, isActive, onSelect, onDelete, onRename }: ThreadItemProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const dot = STATUS_DOT[task.status]

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.name) onRename(trimmed)
    setEditing(false)
  }, [editValue, task.name, onRename])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setEditValue(task.name)
    setEditing(true)
  }, [task.name])

  return (
    <li className="group/thread relative min-w-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        className={cn(
          'flex min-w-0 h-7 w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg px-2 pr-6 text-xs select-none',
          'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring transition-colors',
          isActive
            ? 'bg-accent/85 dark:bg-accent/55 text-foreground font-medium hover:bg-accent dark:hover:bg-accent/70'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {dot && (
          <span className={cn('size-1.5 shrink-0 rounded-full', dot.color, dot.pulse && 'animate-pulse')} />
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate bg-transparent text-xs outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs">{task.name}</span>
        )}
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/40 group-hover/thread:hidden">
          {relativeTime(task.createdAt)}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Delete thread"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="absolute right-1 top-0.5 hidden group-hover/thread:flex size-5 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <Trash2 className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Delete</TooltipContent>
      </Tooltip>
    </li>
  )
})
