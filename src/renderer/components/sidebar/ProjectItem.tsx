import { memo, useState, useRef, useEffect } from 'react'
import { IconChevronRight, IconChevronDown, IconEdit, IconTrash, IconArchive, IconMessagePlus, IconFolderOpen, IconPalette, IconMessage, IconCopy, IconArrowUp, IconArrowDown } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import { ThreadItem } from './ThreadItem'
import { ProjectIcon } from './ProjectIcon'
import { useProjectIcon, setProjectIconOverride } from '@/hooks/useProjectIcon'
import { IconPickerDialog } from './IconPickerDialog'
import type { SidebarTask } from '@/hooks/useSidebarTasks'

interface ProjectItemProps {
  name: string
  cwd: string
  tasks: readonly SidebarTask[]
  selectedTaskId: string | null
  isActiveProject: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  autoFocus?: boolean
  jumpLabel?: string | null
  isMetaHeld?: boolean
  onSelectTask: (id: string) => void
  onNewThread: () => void
  onDeleteTask: (id: string) => void
  onRenameTask: (id: string, name: string) => void
  onRemoveProject: () => void
  onArchiveThreads: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export const ProjectItem = memo(function ProjectItem({
  name, cwd, tasks, selectedTaskId, isActiveProject, canMoveUp, canMoveDown, autoFocus, jumpLabel, isMetaHeld,
  onSelectTask, onNewThread, onDeleteTask, onRenameTask,
  onRemoveProject, onArchiveThreads,
  onMoveUp, onMoveDown,
}: ProjectItemProps) {
  const [expanded, setExpanded] = useState(true)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const ctxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const projectIcon = useProjectIcon(cwd)

  useEffect(() => {
    if (!autoFocus) return
    buttonRef.current?.focus()
    useTaskStore.getState().clearLastAddedProject()
  }, [autoFocus])

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  return (
    <li
      className={cn(
        'group/menu-item relative min-w-0 rounded-md transition-colors',
        isActiveProject && 'bg-accent/30',
      )}
    >
      <div className="relative flex items-center">
        {isActiveProject && (
          <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary" aria-hidden />
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
          className={cn(
            'peer/menu-button flex w-full h-8 cursor-pointer items-center gap-1 overflow-hidden rounded-lg px-1.5 py-1 text-[13px] text-left',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'hover:bg-accent hover:text-foreground transition-colors',
          )}
        >
          {expanded
            ? <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            : <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
          }
          <ProjectIcon icon={projectIcon} />
          <span className={cn('flex-1 truncate text-[13px] text-foreground/85', isActiveProject ? 'font-semibold' : 'font-normal')}>{name}</span>
          {jumpLabel && (
            <kbd className="pointer-events-none ml-auto mr-1 inline-flex h-4 shrink-0 items-center rounded-sm bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground select-none">
              {jumpLabel}
            </kbd>
          )}
        </button>

        {/* Always-visible action buttons with gradient fade */}
        <div
          className="absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-end gap-0.5 pr-1"
          style={{ background: 'linear-gradient(to right, transparent 0%, var(--sidebar) 35%)' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`New thread in ${name}`}
                onClick={onNewThread}
                className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground outline-none"
              >
                <IconEdit className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New thread</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={onRemoveProject}
                className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive outline-none"
              >
                <IconTrash className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Remove project</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {ctxMenu && (
        <div ref={ctxRef} className="fixed z-[300] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            onClick={() => { onNewThread(); setCtxMenu(null) }}>
            <IconMessagePlus className="size-3.5" /> New Thread
          </button>
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            onClick={() => { ipc.openUrl(cwd); setCtxMenu(null) }}>
            <IconFolderOpen className="size-3.5" /> Open in Finder
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            onClick={() => { void navigator.clipboard.writeText(cwd); setCtxMenu(null) }}>
            <IconCopy className="size-3.5" /> Copy Path
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            aria-label="Change project icon"
            onClick={() => { setIconPickerOpen(true); setCtxMenu(null) }}>
            <IconPalette className="size-3.5" /> Change Icon
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            onClick={() => { onArchiveThreads(); setCtxMenu(null) }}>
            <IconArchive className="size-3.5" /> Archive Threads
          </button>
          {(canMoveUp || canMoveDown) && (
            <>
              <div className="my-1 border-t border-border/50" />
              {canMoveUp && (
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                  onClick={() => { onMoveUp(); setCtxMenu(null) }}>
                  <IconArrowUp className="size-3.5" /> Move Up
                </button>
              )}
              {canMoveDown && (
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                  onClick={() => { onMoveDown(); setCtxMenu(null) }}>
                  <IconArrowDown className="size-3.5" /> Move Down
                </button>
              )}
            </>
          )}
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => { onRemoveProject(); setCtxMenu(null) }}>
            <IconTrash className="size-3.5" /> Delete
          </button>
        </div>
      )}

      <IconPickerDialog
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        cwd={cwd}
        onSelect={(override) => { setProjectIconOverride(cwd, override); setIconPickerOpen(false) }}
        onReset={() => { setProjectIconOverride(cwd, null); setIconPickerOpen(false) }}
      />

      {expanded && tasks.length > 0 && (
        <ul className="flex min-w-0 flex-col overflow-hidden border-l mx-1 my-0 gap-0 px-1.5 py-0" style={{ borderColor: 'var(--border)' }}>
          {tasks.map((task, i) => {
            const threadJumpLabel = isMetaHeld && i < 9 ? `${i + 1}` : null
            return (
              <ThreadItem
                key={task.id}
                task={task}
                isActive={selectedTaskId === task.id}
                jumpLabel={threadJumpLabel}
                onSelect={() => onSelectTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
                onRename={(n) => onRenameTask(task.id, n)}
              />
            )
          })}
        </ul>
      )}

      {expanded && tasks.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-2 mx-1 border-l" style={{ borderColor: 'var(--border)' }}>
          <IconMessage className="size-3.5 text-muted-foreground/50" aria-hidden />
          <span className="text-[12px] text-muted-foreground/60">No threads yet</span>
        </div>
      )}
    </li>
  )
})
