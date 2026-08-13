import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { IconPencil, IconTrash, IconHistory, IconGitBranch, IconLayoutColumns, IconArrowsSplit, IconPin, IconPinnedOff, IconArrowUp, IconArrowDown, IconCopy, IconGitFork, IconX } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskStore } from '@/stores/taskStore'
import { SplitThreadPicker } from '@/components/chat/SplitThreadPicker'
import { useMenuPosition } from '@/hooks/useMenuPosition'
import { cn } from '@/lib/utils'
import type { SidebarTask } from '@/hooks/useSidebarTasks'

type StatusShape = 'spin' | 'half' | 'ring' | 'x'
type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'muted'

const STATUS_DOT: Record<string, { tone: StatusTone; shape: StatusShape; label: string }> = {
  running: { tone: 'success', shape: 'spin', label: 'Agent is working' },
  pending_permission: { tone: 'warning', shape: 'half', label: 'Waiting for permission' },
  pending_question: { tone: 'info', shape: 'half', label: 'Question needs your answer' },
  error: { tone: 'danger', shape: 'x', label: 'Error occurred' },
  cancelled: { tone: 'muted', shape: 'ring', label: 'Cancelled' },
}

const STATUS_TONE_CLASSES: Record<StatusTone, { border: string; fill: string; soft: string; text: string }> = {
  success: { border: 'border-success', fill: 'bg-success', soft: 'border-success/25', text: 'text-success' },
  warning: { border: 'border-warning', fill: 'bg-warning', soft: 'border-warning/25', text: 'text-warning' },
  info: { border: 'border-primary', fill: 'bg-primary', soft: 'border-primary/25', text: 'text-primary' },
  danger: { border: 'border-destructive', fill: 'bg-destructive', soft: 'border-destructive/25', text: 'text-destructive' },
  muted: { border: 'border-muted-foreground/70', fill: 'bg-muted-foreground', soft: 'border-muted-foreground/20', text: 'text-muted-foreground' },
}

function StatusIndicator({ shape, tone }: { shape: StatusShape; tone: StatusTone }) {
  const colors = STATUS_TONE_CLASSES[tone]
  if (shape === 'spin') {
    return (
      <span
        className={cn('size-2.5 animate-spin rounded-full border-[1.5px] motion-reduce:animate-none', colors.soft, colors.text, 'border-t-current')}
      />
    )
  }
  if (shape === 'half') {
    return (
      <span className={cn('relative size-2.5 rounded-full border-[1.5px]', colors.border)}>
        <span className={cn('absolute inset-0 rounded-full [clip-path:inset(0_0_50%_0)]', colors.fill)} />
      </span>
    )
  }
  if (shape === 'ring') {
    return <span className={cn('size-2.5 rounded-full border-[1.5px]', colors.border)} />
  }
  if (shape === 'x') {
    return (
      <span className={cn('inline-flex size-2.5 items-center justify-center rounded-full', colors.soft, colors.text)}>
        <IconX className="size-2" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  return null
}

function formatActivityTime(iso: string): string {
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
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
  const preview = task.hasPendingQuestion
    ? 'Waiting for your answer'
    : task.status === 'running'
      ? 'Kiro is working…'
      : task.preview

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

  useMenuPosition(ctxRef, ctxMenu)

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
  const accessibleDetails = [
    preview,
    dot?.label,
    task.isArchived ? 'Resumed from history' : null,
    task.worktreePath && !task.isArchived ? 'Worktree thread' : null,
    isInSplit ? 'Open side-by-side' : null,
    isPinned && !isInSplit ? 'Pinned' : null,
    isNotified ? 'New activity' : null,
  ].filter(Boolean).join('. ')

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

  const handleCopyThreadId = useCallback(() => {
    void navigator.clipboard.writeText(task.id)
    setCtxMenu(null)
  }, [task.id])

  const handleCopySessionId = useCallback(() => {
    const sessionId = useTaskStore.getState().sessionIds[task.id]
    if (sessionId) void navigator.clipboard.writeText(sessionId)
    setCtxMenu(null)
  }, [task.id])

  const handleFork = useCallback(() => {
    setCtxMenu(null)
    void useTaskStore.getState().forkTask(task.id)
  }, [task.id])

  return (
    <li data-slot="sidebar-thread" className="group/thread relative min-w-0">
      <button
        type="button"
        tabIndex={editing ? -1 : 0}
        aria-current={isActive ? 'page' : undefined}
        aria-hidden={editing || undefined}
        aria-label={`${task.name}. ${accessibleDetails}`}
        onClick={editing ? undefined : onSelect}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative flex h-8 min-w-0 w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left text-[13px] select-none',
          'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring transition-colors',
          isActive
            ? 'bg-accent/30 text-foreground/90 hover:bg-accent/35'
            : 'text-foreground/75 hover:bg-accent/20 hover:text-foreground/90',
          editing && 'pointer-events-none',
        )}
      >
        <span className="relative flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70" aria-hidden>
          {!task.isDraft && dot && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex size-3.5 items-center justify-center">
                  <StatusIndicator shape={dot.shape} tone={dot.tone} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{dot.label}</TooltipContent>
            </Tooltip>
          )}
          {!task.isDraft && !dot ? <IconHistory className="size-3.5" aria-hidden /> : null}
          {isNotified && (
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning" />
          )}
        </span>
        {task.worktreePath && !task.isArchived ? <IconGitBranch className="size-3 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
        {isInSplit ? <IconLayoutColumns className="size-3 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
        {isPinned && !isInSplit ? <IconPin className="size-3 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', isActive && 'font-medium', editing && 'opacity-0')}>{task.name}</span>
          </TooltipTrigger>
          <TooltipContent side="top" align="start">{task.name}</TooltipContent>
        </Tooltip>
        {jumpLabel ? (
          <kbd className="pointer-events-none inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-md bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground select-none">{jumpLabel}</kbd>
        ) : task.isDraft ? (
          <span className="shrink-0 rounded-md bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">Draft</span>
        ) : (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">{formatActivityTime(task.lastActivityAt)}</span>
        )}
      </button>

      {editing && (
        <input
          ref={inputRef}
          type="text"
          name={`thread-name-${task.id}`}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Rename ${task.name}`}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') {
              setEditValue(task.name)
              setEditing(false)
            }
          }}
          className="absolute left-7 right-1.5 top-1.5 z-20 h-5 min-w-0 rounded-md bg-background px-1 text-[13px] font-medium text-foreground outline-none ring-1 ring-ring"
        />
      )}

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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                    onClick={handleFork}
                  >
                    <IconGitFork className="size-3.5" /> Fork thread
                  </button>
                  <div className="my-1 border-t border-border/50" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                    onClick={handleCopyThreadId}
                  >
                    <IconCopy className="size-3.5" /> Copy Thread ID
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                    onClick={handleCopySessionId}
                  >
                    <IconCopy className="size-3.5" /> Copy Session ID
                  </button>
                  <div className="my-1 border-t border-border/50" />
                  {isInSplit ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                      onClick={handleUnsplit}
                    >
                      <IconArrowsSplit className="size-3.5" /> Remove side-by-side
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                      onClick={handleNewSplitView}
                    >
                      <IconLayoutColumns className="size-3.5" /> Open side-by-side
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
