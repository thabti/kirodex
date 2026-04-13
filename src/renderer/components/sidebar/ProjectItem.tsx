import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { IconChevronRight, IconChevronDown, IconEdit, IconTrash, IconPencil, IconArchive, IconMessagePlus, IconFolderOpen } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { ThreadItem } from './ThreadItem'
import type { SidebarTask } from '@/hooks/useSidebarTasks'

interface ProjectItemProps {
  name: string
  cwd: string
  tasks: readonly SidebarTask[]
  selectedTaskId: string | null
  isDragOver: boolean
  onSelectTask: (id: string) => void
  onNewThread: () => void
  onDeleteTask: (id: string) => void
  onRenameTask: (id: string, name: string) => void
  onRemoveProject: () => void
  onArchiveThreads: () => void
  onRenameProject: (name: string) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

export const ProjectItem = memo(function ProjectItem({
  name, cwd, tasks, selectedTaskId, isDragOver,
  onSelectTask, onNewThread, onDeleteTask, onRenameTask,
  onRemoveProject, onArchiveThreads, onRenameProject,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: ProjectItemProps) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(name)
  const ctxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== name) onRenameProject(trimmed)
    setEditing(false)
  }, [editValue, name, onRenameProject])

  return (
    <li
      className={cn(
        'group/menu-item relative min-w-0 rounded-md transition-colors',
        isDragOver && 'ring-1 ring-primary/40 bg-primary/5',
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', cwd)
        onDragStart()
      }}
      onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
    >
      <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
          className={cn(
            'peer/menu-button flex w-full h-6 cursor-pointer items-center gap-1 overflow-hidden rounded-lg px-1.5 py-1 text-[11px] text-left',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'hover:bg-accent hover:text-foreground transition-colors',
          )}
        >
          {expanded
            ? <IconChevronDown className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
            : <IconChevronRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
          }
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 truncate bg-transparent text-[11px] font-normal text-foreground outline-none"
            />
          ) : (
            <span className="flex-1 truncate text-[11px] font-normal text-foreground/70">{name}</span>
          )}
        </button>

        {/* Floating action buttons with gradient fade */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-end gap-0.5 pr-1 transition-opacity',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: 'linear-gradient(to right, transparent 0%, var(--sidebar) 35%)' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`New thread in ${name}`}
                onClick={onNewThread}
                className="pointer-events-auto flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground outline-none"
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
                className="pointer-events-auto flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive outline-none"
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
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { onNewThread(); setCtxMenu(null) }}>
            <IconMessagePlus className="size-3.5" /> New Thread
          </button>
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { ipc.openUrl(cwd); setCtxMenu(null) }}>
            <IconFolderOpen className="size-3.5" /> Open in Finder
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { setEditValue(name); setEditing(true); setCtxMenu(null) }}>
            <IconPencil className="size-3.5" /> Edit Name
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { onArchiveThreads(); setCtxMenu(null) }}>
            <IconArchive className="size-3.5" /> Archive Threads
          </button>
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => { onRemoveProject(); setCtxMenu(null) }}>
            <IconTrash className="size-3.5" /> Delete
          </button>
        </div>
      )}

      {expanded && tasks.length > 0 && (
        <ul className="flex min-w-0 flex-col overflow-hidden border-l mx-1 my-0 gap-0 px-1.5 py-0" style={{ borderColor: 'var(--border)' }}>
          {tasks.map((task) => (
            <ThreadItem
              key={task.id}
              task={task}
              isActive={selectedTaskId === task.id}
              onSelect={() => onSelectTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
              onRename={(n) => onRenameTask(task.id, n)}
            />
          ))}
        </ul>
      )}
    </li>
  )
})
