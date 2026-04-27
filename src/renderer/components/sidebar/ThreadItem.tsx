import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { IconPencil, IconTrash, IconLock, IconGitBranch, IconLayoutColumns, IconArrowsSplit, IconPin, IconPinnedOff, IconArrowUp, IconArrowDown } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskStore } from '@/stores/taskStore'
import { SplitThreadPicker } from '@/components/chat/SplitThreadPicker'
import { cn } from '@/lib/utils'
import type { SidebarTask } from '@/hooks/useSidebarTasks'

const STATUS_DOT: Record<string, { color: string; pulse?: boolean }> = {
  running: { color: 'bg-emerald-400', pulse: true },
  pending_permission: { color: 'bg-amber-400' },
  pending_question: { color: 'bg-blue-400' },
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
  jumpLabel?: string | null
  canMoveUp?: boolean
  canMoveDown?: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export const ThreadItem = memo(function ThreadItem({ task, isActive, jumpLabel, canMoveUp, canMoveDown, onSelect, onDelete, onRename, onMoveUp, onMoveDown }: ThreadItemProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.name)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const dot = STATUS_DOT[task.hasPendingQuestion ? 'pending_question' : task.status]

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.name) onRename(trimmed)
    setEditing(false)
  }, [editValue, task.name, onRename])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
    setConfirmDelete(false)
  }, [])

  const handleRenameClick = useCallback(() => {
    setEditValue(task.name)
    setEditing(true)
    setCtxMenu(null)
    setConfirmDelete(false)
  }, [task.name])

  const handleDeleteClick = useCallback(() => {
    setConfirmDelete(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    setCtxMenu(null)
    setConfirmDelete(false)
    onDelete()
  }, [onDelete])

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete(false)
    setCtxMenu(null)
  }, [])

  const [splitPicker, setSplitPicker] = useState<{ x: number; y: number } | null>(null)

  const isInSplit = useTaskStore((s) => s.splitViews.some((sv) => sv.left === task.id || sv.right === task.id))
  const isPinned = useTaskStore((s) => s.pinnedThreadIds.includes(task.id))
  const isNotified = useTaskStore((s) => s.notifiedTaskIds.includes(task.id))

  const handleNewSplitView = useCallback(() => {
    setCtxMenu(null)
    setSplitPicker(ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : { x: 200, y: 200 })
  }, [ctxMenu])

  const handleUnsplit = useCallback(() => {
    setCtxMenu(null)
    const state = useTaskStore.getState()
    const sv = state.splitViews.find((v) => v.left === task.id || v.right === task.id)
    if (sv) state.removeSplitView(sv.id)
  }, [task.id])

  const handleTogglePin = useCallback(() => {
    setCtxMenu(null)
    const state = useTaskStore.getState()
    if (state.pinnedThreadIds.includes(task.id)) {
      state.unpinThread(task.id)
    } else {
      state.pinThread(task.id)
    }
  }, [task.id])

  return (
    <li className="group/thread relative min-w-0">
      <div
        role="button"
        tabIndex={0}
        aria-label={task.isDraft ? `${task.name}, draft` : undefined}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        className={cn(
          'flex min-w-0 h-8 w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg px-2 pr-1 text-[13px] select-none',
          'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring transition-colors',
          isActive
            ? 'bg-accent/85 dark:bg-accent/55 text-foreground font-medium hover:bg-accent dark:hover:bg-accent/70'
            : 'text-foreground/80 hover:bg-accent hover:text-foreground',
        )}
      >
        {task.isDraft ? (
          <span className="size-1.5 shrink-0" />
        ) : dot ? (
          <span className={cn('size-1.5 shrink-0 rounded-full', dot.color, dot.pulse && 'animate-pulse')} />
        ) : null}
        {task.isArchived && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <IconLock className="size-3 text-muted-foreground/70" aria-label="View-only archived thread" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Archived — view only</TooltipContent>
          </Tooltip>
        )}
        {task.worktreePath && !task.isArchived && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconGitBranch className="size-3 shrink-0 text-violet-500 dark:text-violet-400" aria-label="Worktree thread" />
            </TooltipTrigger>
            <TooltipContent side="top">Worktree</TooltipContent>
          </Tooltip>
        )}
        {isInSplit && (
          <IconLayoutColumns className="size-3 shrink-0 text-primary/60" aria-label="In split view" />
        )}
        {isPinned && !isInSplit && (
          <IconPin className="size-3 shrink-0 text-amber-500/70" aria-label="Pinned" />
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate bg-transparent text-[13px] outline-none"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 flex-1 truncate text-[13px]">{task.name}</span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">{task.name}</TooltipContent>
          </Tooltip>
        )}
        {jumpLabel ? (
          <kbd className="pointer-events-none shrink-0 rounded-sm bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground select-none">
            {jumpLabel}
          </kbd>
        ) : task.isDraft ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground group-hover/thread:hidden" aria-hidden="true">
            Draft
          </span>
        ) : (
          <>
            {isNotified && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-orange-400 group-hover/thread:hidden"
                aria-label="New activity"
              />
            )}
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground group-hover/thread:hidden">
              {relativeTime(task.lastActivityAt)}
            </span>
          </>
        )}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-14 items-center justify-end rounded-r-lg pr-1 group-hover/thread:flex"
        style={{ background: isActive
          ? 'linear-gradient(to right, transparent 0%, hsl(var(--accent) / 0.85) 35%)'
          : 'linear-gradient(to right, transparent 0%, hsl(var(--accent)) 35%)'
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Delete thread"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="pointer-events-auto flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <IconTrash className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete thread</TooltipContent>
        </Tooltip>
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-[300] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {confirmDelete ? (
            <>
              <p className="px-3 py-1.5 text-[13px] text-muted-foreground">Delete this thread?</p>
              <div className="flex gap-1 px-2 pb-1.5">
                <button
                  type="button"
                  className="flex-1 rounded-md bg-destructive/90 px-2 py-1 text-[13px] font-medium text-white hover:bg-destructive transition-colors"
                  onClick={handleConfirmDelete}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-2 py-1 text-[13px] text-foreground hover:bg-accent transition-colors"
                  onClick={handleCancelDelete}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {!task.isDraft && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                    onClick={handleRenameClick}
                  >
                    <IconPencil className="size-3.5" /> Rename
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                    onClick={handleTogglePin}
                  >
                    {isPinned ? <IconPinnedOff className="size-3.5" /> : <IconPin className="size-3.5" />}
                    {isPinned ? 'Unpin' : 'Pin thread'}
                  </button>
                  <div className="my-1 border-t border-border/50" />
                  {isInSplit ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                      onClick={handleUnsplit}
                    >
                      <IconArrowsSplit className="size-3.5" /> Unsplit
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                      onClick={handleNewSplitView}
                    >
                      <IconLayoutColumns className="size-3.5" /> New split view
                    </button>
                  )}
                  <div className="my-1 border-t border-border/50" />
                  {(canMoveUp || canMoveDown) && (
                    <>
                      {canMoveUp && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                          onClick={() => { onMoveUp?.(); setCtxMenu(null) }}
                        >
                          <IconArrowUp className="size-3.5" /> Move Up
                        </button>
                      )}
                      {canMoveDown && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                          onClick={() => { onMoveDown?.(); setCtxMenu(null) }}
                        >
                          <IconArrowDown className="size-3.5" /> Move Down
                        </button>
                      )}
                      <div className="my-1 border-t border-border/50" />
                    </>
                  )}
                </>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10"
                onClick={handleDeleteClick}
              >
                <IconTrash className="size-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      )}
      {splitPicker && (
        <SplitThreadPicker
          anchorTaskId={task.id}
          position={splitPicker}
          onClose={() => setSplitPicker(null)}
        />
      )}
    </li>
  )
})
