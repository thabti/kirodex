import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, SquarePen, Trash2, FolderOpen, Pencil, Archive } from 'lucide-react'
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
  onSelectTask: (id: string) => void
  onNewThread: () => void
  onDeleteTask: (id: string) => void
  onRenameTask: (id: string, name: string) => void
  onRemoveProject: () => void
  onArchiveThreads: () => void
  onRenameProject: (name: string) => void
}

export const ProjectItem = memo(function ProjectItem({
  name, cwd, tasks, selectedTaskId,
  onSelectTask, onNewThread, onDeleteTask, onRenameTask,
  onRemoveProject, onArchiveThreads, onRenameProject,
}: ProjectItemProps) {
  const [expanded, setExpanded] = useState(true)
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
    <li className="group/menu-item relative min-w-0 rounded-md">
      <div className="group/project-header relative">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
          className={cn(
            'peer/menu-button flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-xs text-left',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'hover:bg-accent hover:text-foreground group-hover/project-header:bg-accent group-hover/project-header:text-foreground transition-colors',
          )}
        >
          <ChevronRight
            className={cn('-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150', expanded && 'rotate-90')}
            aria-hidden
          />
          <span className="size-3.5 shrink-0 rounded-sm bg-muted-foreground/20 flex items-center justify-center text-[8px] font-bold text-muted-foreground/60 uppercase">
            {name.charAt(0)}
          </span>
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 truncate bg-transparent text-xs font-medium text-foreground outline-none"
            />
          ) : (
            <span className="flex-1 truncate text-xs font-medium text-foreground/90">{name}</span>
          )}
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`New thread in ${name}`}
              onClick={onNewThread}
              className="absolute top-1 right-7 flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100 outline-none transition-opacity"
            >
              <SquarePen className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">New thread</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={onRemoveProject}
              className="absolute top-1 right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100 outline-none transition-opacity"
            >
              <Trash2 className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Remove project</TooltipContent>
        </Tooltip>
      </div>

      {ctxMenu && (
        <div ref={ctxRef} className="fixed z-[300] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { ipc.openUrl(cwd); setCtxMenu(null) }}>
            <FolderOpen className="size-3.5" /> Open in Finder
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { setEditValue(name); setEditing(true); setCtxMenu(null) }}>
            <Pencil className="size-3.5" /> Edit Name
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { onArchiveThreads(); setCtxMenu(null) }}>
            <Archive className="size-3.5" /> Archive Threads
          </button>
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => { onRemoveProject(); setCtxMenu(null) }}>
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      )}

      {expanded && tasks.length > 0 && (
        <ul className="flex min-w-0 flex-col border-l mx-1 my-0 gap-0.5 px-1.5 py-0" style={{ borderColor: 'var(--border)' }}>
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
