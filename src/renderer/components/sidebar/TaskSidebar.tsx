import { memo, useCallback, useRef, useState } from 'react'
import { IconPlus, IconArrowsUpDown, IconCheck, IconLayoutSidebarLeftCollapse, IconLayoutSidebarRightCollapse, IconFolderOpen } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useShallow } from 'zustand/react/shallow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useSidebarTasks, type SortKey } from '@/hooks/useSidebarTasks'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { ProjectItem } from './ProjectItem'
import { SidebarFooter } from './SidebarFooter'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'recent', label: 'Recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
]

const SortDropdown = memo(function SortDropdown({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const handleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left })
      }
      return !v
    })
  }, [])

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button ref={btnRef} type="button" onClick={handleOpen}
            className={cn('inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
              open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
            <IconArrowsUpDown className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Sort tasks</TooltipContent>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
          <div className="fixed z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.key} type="button"
                onClick={() => { onChange(opt.key); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-accent transition-colors">
                <IconCheck className={cn('size-3 shrink-0', sort === opt.key ? 'opacity-100' : 'opacity-0')} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
})

interface TaskSidebarProps {
  width: number
  onResize: (width: number) => void
  position?: 'left' | 'right'
}

export const TaskSidebar = memo(function TaskSidebar({ width, onResize, position = 'left' }: TaskSidebarProps) {
  const isRight = position === 'right'
  const [sort, setSort] = useState<SortKey>('created')
  const projectList = useSidebarTasks(sort)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcIdx = useRef<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleSwitchSide = useCallback(() => {
    setCtxMenu(null)
    const store = useSettingsStore.getState()
    const next = position === 'left' ? 'right' : 'left'
    store.saveSettings({ ...store.settings, sidebarPosition: next })
  }, [position])

  const { selectedTaskId, pendingWorkspace, setSelectedTask, setView, setNewProjectOpen, removeTask, removeProject, archiveThreads, renameTask, reorderProject } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      pendingWorkspace: s.pendingWorkspace,
      setSelectedTask: s.setSelectedTask,
      setView: s.setView,
      setNewProjectOpen: s.setNewProjectOpen,
      removeTask: s.removeTask,
      removeProject: s.removeProject,
      archiveThreads: s.archiveThreads,
      renameTask: s.renameTask,
      reorderProject: s.reorderProject,
    }))
  )

  // Derive the active project workspace from the selected task or pending workspace
  const activeProjectCwd = useTaskStore((s) => {
    if (s.selectedTaskId) {
      const task = s.tasks[s.selectedTaskId]
      if (!task) return null
      return task.originalWorkspace ?? task.workspace
    }
    return s.pendingWorkspace
  })

  const handleSelectTask = useCallback((id: string) => {
    if (id.startsWith('draft:')) {
      useTaskStore.getState().setPendingWorkspace(id.slice(6))
    } else {
      setSelectedTask(id); setView('chat')
    }
  }, [setSelectedTask, setView])
  const handleDeleteTask = useCallback((id: string) => {
    if (id.startsWith('draft:')) {
      const ws = id.slice(6)
      const store = useTaskStore.getState()
      // Clear pendingWorkspace first so PendingChat unmounts before removeDraft,
      // preventing the unmount flush from resurrecting the draft
      if (store.pendingWorkspace === ws) {
        store.setPendingWorkspace(null)
      }
      store.removeDraft(ws)
    } else {
      void ipc.cancelTask(id).catch(() => {}); removeTask(id); void ipc.deleteTask(id)
    }
  }, [removeTask])
  const handleNewThread = useCallback((workspace: string) => { useTaskStore.getState().setPendingWorkspace(workspace) }, [])

  // Project drag-to-reorder handlers
  const handleProjectDragStart = useCallback((idx: number) => { dragSrcIdx.current = idx }, [])
  const handleProjectDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])
  const handleProjectDrop = useCallback((idx: number) => {
    const from = dragSrcIdx.current
    if (from !== null && from !== idx) reorderProject(from, idx)
    dragSrcIdx.current = null
    setDragOverIdx(null)
  }, [reorderProject])
  const handleProjectDragEnd = useCallback(() => { dragSrcIdx.current = null; setDragOverIdx(null) }, [])

  // Sidebar edge resize
  const handleResizeStart = useResizeHandle({
    axis: 'horizontal', size: width, onResize, min: 180, max: Math.round(window.innerWidth * 0.2), reverse: isRight,
  })

  return (
    <div data-testid="task-sidebar" onContextMenu={handleContextMenu} className={cn('relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-foreground', isRight ? 'border-l pr-1 order-last' : 'border-r pl-1')} style={{ width }}>
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div className="fixed z-[200] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
            <button type="button" onClick={handleSwitchSide} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-accent transition-colors">
              {isRight ? <IconLayoutSidebarLeftCollapse className="size-3.5" /> : <IconLayoutSidebarRightCollapse className="size-3.5" />}
              Move sidebar to {isRight ? 'left' : 'right'}
            </button>
          </div>
        </>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onMouseDown={handleResizeStart}
        className={cn('absolute top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors', isRight ? 'left-0' : 'right-0')}
      />
      <div className="flex items-center justify-between px-4 py-2 pr-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projects</span>
        <div className="flex shrink-0 items-center gap-1">
          <SortDropdown sort={sort} onChange={setSort} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Add project" data-testid="add-project-button" onClick={() => setNewProjectOpen(true)}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <IconPlus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Import project folder</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-2">
        <div className="min-w-0 pb-2">
          <div className="relative flex min-w-0 flex-col">
            <ul className="flex min-w-0 flex-col gap-0.5">
              {projectList.length === 0 && (
                <li className="flex flex-col items-center gap-3 px-3 py-8 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted/30">
                    <IconFolderOpen size={20} stroke={1.5} className="text-muted-foreground/70" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground">No projects yet</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Import a folder to start working with Kiro</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewProjectOpen(true)}
                    aria-label="Import project folder"
                    tabIndex={0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <IconPlus size={12} /> Import Project
                  </button>
                </li>
              )}
              {projectList.map((project, idx) => (
                <ProjectItem
                  key={project.cwd}
                  name={project.name}
                  cwd={project.cwd}
                  tasks={project.tasks}
                  selectedTaskId={selectedTaskId ?? (pendingWorkspace ? `draft:${pendingWorkspace}` : null)}
                  isActiveProject={project.cwd === activeProjectCwd}
                  isDragOver={dragOverIdx === idx && dragSrcIdx.current !== idx}
                  onSelectTask={handleSelectTask}
                  onNewThread={() => handleNewThread(project.cwd)}
                  onDeleteTask={handleDeleteTask}
                  onRenameTask={renameTask}
                  onRemoveProject={() => removeProject(project.cwd)}
                  onArchiveThreads={() => archiveThreads(project.cwd)}
                  onDragStart={() => handleProjectDragStart(idx)}
                  onDragOver={(e) => handleProjectDragOver(e, idx)}
                  onDrop={() => handleProjectDrop(idx)}
                  onDragEnd={handleProjectDragEnd}
                />
              ))}
            </ul>
          </div>
        </div>
      </ScrollArea>
      <SidebarFooter />
    </div>
  )
})
