import { memo, useCallback, useRef, useState } from 'react'
import { Plus, ArrowUpDown, Check } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useShallow } from 'zustand/react/shallow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useSidebarTasks, type SortKey } from '@/hooks/useSidebarTasks'
import { ProjectItem } from './ProjectItem'
import { SidebarFooter } from './SidebarFooter'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
]

const SortDropdown = memo(function SortDropdown({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => setOpen((v) => !v)}
            className={cn('inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
              open ? 'bg-accent text-foreground' : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground')}>
            <ArrowUpDown className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sort tasks</TooltipContent>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.key} type="button"
                onClick={() => { onChange(opt.key); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors">
                <Check className={cn('size-3 shrink-0', sort === opt.key ? 'opacity-100' : 'opacity-0')} />
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
}

export const TaskSidebar = memo(function TaskSidebar({ width, onResize }: TaskSidebarProps) {
  const [sort, setSort] = useState<SortKey>('recent')
  const projectList = useSidebarTasks(sort)
  const isDragging = useRef(false)

  const { selectedTaskId, setSelectedTask, setView, setNewProjectOpen, removeTask, removeProject, archiveThreads, renameProject, renameTask } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      setSelectedTask: s.setSelectedTask,
      setView: s.setView,
      setNewProjectOpen: s.setNewProjectOpen,
      removeTask: s.removeTask,
      removeProject: s.removeProject,
      archiveThreads: s.archiveThreads,
      renameProject: s.renameProject,
      renameTask: s.renameTask,
    }))
  )

  const handleSelectTask = useCallback((id: string) => { setSelectedTask(id); setView('chat') }, [setSelectedTask, setView])
  const handleDeleteTask = useCallback((id: string) => { void ipc.cancelTask(id).catch(() => {}); removeTask(id); void ipc.deleteTask(id) }, [removeTask])
  const handleNewThread = useCallback((workspace: string) => { useTaskStore.getState().setPendingWorkspace(workspace) }, [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startWidth = width
    const handleMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(startWidth + (ev.clientX - startX), window.innerWidth * 0.2))
      onResize(newWidth)
    }
    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, onResize])

  return (
    <div className="relative flex h-full min-h-0 shrink-0 flex-col border-r bg-card pl-1 text-foreground" style={{ width }}>
      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2">
          <div className="relative flex w-full min-w-0 flex-col">
            <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Projects</span>
              <div className="flex items-center gap-1">
                <SortDropdown sort={sort} onChange={setSort} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Add project" onClick={() => setNewProjectOpen(true)}
                      className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
                      <Plus className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Import project folder</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <ul className="flex w-full min-w-0 flex-col gap-1">
              {projectList.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No projects yet — click + to import a folder</p>
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
                  onRenameTask={renameTask}
                  onRemoveProject={() => removeProject(project.cwd)}
                  onArchiveThreads={() => archiveThreads(project.cwd)}
                  onRenameProject={(n) => renameProject(project.cwd, n)}
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
