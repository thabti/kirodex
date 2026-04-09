import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { ChevronRight, Plus, Settings, ArrowUpDown, SquarePen, Check, X, FlaskConical, Bug, Trash2, FolderOpen, Pencil, Archive } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useShallow } from 'zustand/react/shallow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { KiroConfigPanel } from './KiroConfigPanel'
import type { AgentTask } from '@/types'


const KiroConfigFooter = memo(function KiroConfigFooter() {
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(200)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(200)

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY.current - ev.clientY
      setHeight(Math.max(80, Math.min(400, startH.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  return (
    <div className="flex min-h-0 flex-col border-b border-border">
      {/* Drag handle */}
      <div className="flex items-center border-t border-border">
        <div
          onMouseDown={onDragStart}
          className="flex-1 h-1.5 cursor-row-resize hover:bg-accent/40 transition-colors"
        />
      </div>
      {/* KiroConfigPanel renders the merged header (chevron + "Kiro" + search) itself */}
      {collapsed ? (
        <div className="px-1 py-1">
          <KiroConfigPanel collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </div>
      ) : (
        <ScrollArea style={{ height, maxHeight: '100%' }} className="min-h-0">
          <div className="px-1 py-1">
            <KiroConfigPanel collapsed={collapsed} onToggleCollapse={toggleCollapse} />
          </div>
        </ScrollArea>
      )}
    </div>
  )
})

type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
]

function sortTasks(tasks: AgentTask[], sort: SortKey): AgentTask[] {
  return [...tasks].sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name)
    if (sort === 'name-desc') return b.name.localeCompare(a.name)
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Sort dropdown */
function SortDropdown({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Use mousedown so it fires before click, but only close if outside
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
              open
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground',
            )}
          >
            <ArrowUpDown className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sort tasks</TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute left-0 top-6 z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onMouseDown={(e) => {
                // Prevent the outside-click handler from closing before onChange fires
                e.stopPropagation()
                onChange(opt.key)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <Check className={cn('size-3 shrink-0', sort === opt.key ? 'opacity-100' : 'opacity-0')} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Group tasks by workspace path, using last path segment as project name */
function groupByProject(tasks: AgentTask[]): Map<string, { name: string; cwd: string; tasks: AgentTask[] }> {
  const map = new Map<string, { name: string; cwd: string; tasks: AgentTask[] }>()
  for (const task of tasks) {
    const cwd = task.workspace
    if (!map.has(cwd)) {
      map.set(cwd, { name: cwd.split('/').pop() ?? cwd, cwd, tasks: [] })
    }
    map.get(cwd)!.tasks.push(task)
  }
  return map
}

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-emerald-400', label: 'Running' },
  paused: { color: 'bg-muted-foreground/40', label: 'Paused' },
  completed: { color: 'bg-muted-foreground/30', label: 'Completed' },
  error: { color: 'bg-red-400', label: 'Error' },
  cancelled: { color: 'bg-red-400/50', label: 'Cancelled' },
  pending_permission: { color: 'bg-amber-400', label: 'Needs permission' },
}

const ThreadItem = memo(function ThreadItem({
  task,
  isActive,
  onSelect,
  onDelete,
}: {
  task: AgentTask
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const dot = STATUS_DOT[task.status] ?? STATUS_DOT.paused
  const showDot = task.status !== 'paused' && task.status !== 'completed'

  return (
    <li className="group/thread relative min-w-0" data-thread-item="true">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        className={cn(
          'flex min-w-0 h-7 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 pr-6 text-xs select-none',
          'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          'transition-colors',
          isActive
            ? 'bg-accent/85 dark:bg-accent/55 text-foreground font-medium hover:bg-accent dark:hover:bg-accent/70'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        data-active={isActive}
      >
        <span className="min-w-0 flex-1 truncate text-xs">{task.name}</span>
        <span className="shrink-0 text-[10px] text-foreground/72 dark:text-foreground/82 group-hover/thread:hidden">
          {relativeTime(task.createdAt)}
        </span>
      </div>
      {/* Delete button — overlays top-right on hover */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Delete task"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className={cn(
              'absolute right-1 top-0.5 hidden group-hover/thread:flex size-5 items-center justify-center rounded-md',
              'text-muted-foreground/60 hover:bg-destructive/20 hover:text-destructive transition-colors',
            )}
          >
            <Trash2 className="size-3" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Delete thread</TooltipContent>
      </Tooltip>
    </li>
  )
})

const ProjectItem = memo(function ProjectItem({
  name,
  cwd,
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewThread,
  onDeleteTask,
  onRemoveProject,
  onArchiveThreads,
  onRenameProject,
  isCreating,
}: {
  name: string
  cwd: string
  tasks: AgentTask[]
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  onNewThread: () => void
  onDeleteTask: (id: string) => void
  onRemoveProject: () => void
  onArchiveThreads: () => void
  onRenameProject: (name: string) => void
  isCreating: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(name)
  const ctxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  // Focus input when editing starts
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== name) onRenameProject(trimmed)
    setEditing(false)
  }, [editValue, name, onRenameProject])

  return (
    <li className="group/menu-item relative min-w-0 overflow-hidden rounded-md">
      <div className="group/project-header relative">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={handleContextMenu}
          className={cn(
            'peer/menu-button flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-xs text-left',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'hover:bg-accent hover:text-foreground',
            'group-hover/project-header:bg-accent group-hover/project-header:text-foreground',
            'transition-colors',
          )}
        >
          <ChevronRight
            className={cn(
              '-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150',
              expanded && 'rotate-90',
            )}
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
          {isCreating && <span className="size-3 animate-spin rounded-full border border-border border-t-primary shrink-0" />}
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`New thread in ${name}`}
              onClick={onNewThread}
              disabled={isCreating}
              className={cn(
                'absolute top-1 right-7 flex size-5 cursor-pointer items-center justify-center rounded-md',
                'text-muted-foreground/70 hover:bg-secondary hover:text-foreground',
                'opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity disabled:pointer-events-none',
              )}
            >
              <SquarePen className="size-3.5" aria-hidden />
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
              className={cn(
                'absolute top-1 right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-md',
                'text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive',
                'opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity',
              )}
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Remove project</TooltipContent>
        </Tooltip>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-[300] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { ipc.openUrl(cwd); setCtxMenu(null) }}>
            <FolderOpen className="size-3.5" aria-hidden /> Open in Finder
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { setEditValue(name); setEditing(true); setCtxMenu(null) }}>
            <Pencil className="size-3.5" aria-hidden /> Edit Name
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => { onArchiveThreads(); setCtxMenu(null) }}>
            <Archive className="size-3.5" aria-hidden /> Archive Threads
          </button>
          <div className="my-1 border-t border-border/50" />
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => { onRemoveProject(); setCtxMenu(null) }}>
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </button>
        </div>
      )}

      {expanded && tasks.length > 0 && (
        <ul
          className="flex min-w-0 flex-col border-l mx-1 my-0 gap-0.5 overflow-hidden px-1.5 py-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {tasks.map((task) => (
            <ThreadItem
              key={task.id}
              task={task}
              isActive={selectedTaskId === task.id}
              onSelect={() => onSelectTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </ul>
      )}
    </li>
  )
})

export const TaskSidebar = memo(function TaskSidebar() {
  const { projects, selectedTaskId, projectNames } = useTaskStore(
    useShallow((s) => ({ projects: s.projects, selectedTaskId: s.selectedTaskId, projectNames: s.projectNames }))
  )
  const { setSelectedTask, setView, setNewProjectOpen, setSettingsOpen, removeTask, removeProject, archiveThreads, renameProject } = useTaskStore(
    useShallow((s) => ({ setSelectedTask: s.setSelectedTask, setView: s.setView, setNewProjectOpen: s.setNewProjectOpen, setSettingsOpen: s.setSettingsOpen, removeTask: s.removeTask, removeProject: s.removeProject, archiveThreads: s.archiveThreads, renameProject: s.renameProject }))
  )

  // Subscribe to tasks object — stable reference, derive list in useMemo
  const tasks = useTaskStore((s) => s.tasks)
  const taskList = useMemo(
    () => Object.values(tasks).map((t) => ({ id: t.id, name: t.name, workspace: t.workspace, createdAt: t.createdAt, status: t.status })),
    [tasks]
  )

  const [sort, setSort] = useState<SortKey>('recent')

  const sorted = useMemo(
    () => sortTasks(taskList as AgentTask[], sort),
    [taskList, sort],
  )

  // Group sorted tasks by workspace; also include projects with no tasks yet
  const projectList = useMemo(() => {
    const map = groupByProject(sorted as AgentTask[])
    // Add projects that have no tasks yet
    for (const ws of projects) {
      if (!map.has(ws)) {
        map.set(ws, { name: projectNames[ws] ?? ws.split('/').pop() ?? ws, cwd: ws, tasks: [] })
      }
    }
    // Apply custom names to all projects
    for (const [ws, project] of map) {
      if (projectNames[ws]) project.name = projectNames[ws]
    }
    return Array.from(map.values())
  }, [sorted, projects, projectNames])

  const handleSelectTask = useCallback(
    (id: string) => { setSelectedTask(id); setView('chat') },
    [setSelectedTask, setView],
  )

  const handleDeleteTask = useCallback(
    (id: string) => { void ipc.cancelTask(id).catch(() => {}); removeTask(id); void ipc.deleteTask(id) },
    [removeTask],
  )

  /** Show empty chat input without creating a sidebar entry yet */
  const handleNewThread = useCallback((workspace: string) => {
    useTaskStore.getState().setPendingWorkspace(workspace)
  }, [])

  const openNewProject = useCallback(() => setNewProjectOpen(true), [setNewProjectOpen])
  const openSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen])

  return (
    <div className="flex h-full min-h-0 w-60 shrink-0 flex-col border-r bg-card text-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {/* Projects section */}
          <div className="relative flex w-full min-w-0 flex-col">
            {/* Group header */}
            <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Projects
              </span>
              <div className="flex items-center gap-1">
                <SortDropdown sort={sort} onChange={setSort} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Add project"
                      onClick={openNewProject}
                      className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Add project folder</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <ul className="flex w-full min-w-0 flex-col gap-1">
              {projectList.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  No projects yet — click + to add a folder
                </p>
              )}
              {projectList.map((project) => (
                <ProjectItem
                  key={project.cwd}
                  name={project.name}
                  cwd={project.cwd}
                  tasks={project.tasks}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={handleSelectTask}
                  onNewThread={() => handleNewThread(project.cwd)}
                  onDeleteTask={handleDeleteTask}
                  onRemoveProject={() => removeProject(project.cwd)}
                  onArchiveThreads={() => archiveThreads(project.cwd)}
                  onRenameProject={(n) => renameProject(project.cwd, n)}
                  isCreating={false}
                />
              ))}
            </ul>
          </div>

          {/* Kiro Config removed — moved to footer */}
        </div>
      </ScrollArea>

      {/* Kiro Config (agents, skills, steering, MCP) — collapsible, resizable */}
      <KiroConfigFooter />

      <div className="flex shrink-0 flex-col gap-2 p-2">
        <ul className="flex w-full min-w-0 flex-col gap-1">
          <li>
            <button
              type="button"
              onClick={() => setView('playground')}
              className="flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FlaskConical className="size-3.5" aria-hidden />
              <span className="text-xs">Playground</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => useDebugStore.getState().toggleOpen()}
              className="flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bug className="size-3.5" aria-hidden />
              <span className="text-xs">Debug</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={openSettings}
              className="flex w-full h-7 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="size-3.5" aria-hidden />
              <span className="text-xs">Settings</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
})
