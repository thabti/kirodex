import { memo, useCallback, useRef, useState } from 'react'
import { IconPlus, IconArrowsUpDown, IconCheck, IconLayoutSidebarLeftCollapse, IconLayoutSidebarRightCollapse, IconFolderOpen, IconLayoutColumns, IconX, IconReplace, IconArrowsExchange, IconGitBranch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useShallow } from 'zustand/react/shallow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useSidebarTasks, type SortKey, type SidebarTask } from '@/hooks/useSidebarTasks'
import { ThreadItem } from './ThreadItem'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { useModifierKeys } from '@/hooks/useModifierKeys'
import { useMenuPosition } from '@/hooks/useMenuPosition'
import { ProjectItem } from './ProjectItem'
import { SplitThreadPicker } from '@/components/chat/SplitThreadPicker'
import { SidebarFooter } from './SidebarFooter'

const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')

const NavHistoryButtons = memo(function NavHistoryButtons({ isRight }: { isRight: boolean }) {
  const navIndex = useTaskStore((s) => s.navIndex)
  const navHistoryLen = useTaskStore((s) => s.navHistory.length)
  const navBack = useTaskStore((s) => s.navBack)
  const navForward = useTaskStore((s) => s.navForward)
  const canBack = navIndex > 0
  const canForward = navIndex >= 0 && navIndex < navHistoryLen - 1
  const modKey = IS_MAC ? '⌘' : 'Ctrl+'
  // Mac left-sidebar: traffic lights occupy ~70px on left, nav sits right after them.
  // Mac right-sidebar / non-Mac: just hug the leading edge.
  const positionClass = IS_MAC && !isRight ? 'left-[68px] top-1' : 'left-2 top-1'
  return (
    <div className={cn('absolute z-20 flex items-center gap-0.5', positionClass)} data-no-drag>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="nav-back-button"
            aria-label="Back"
            disabled={!canBack}
            onClick={navBack}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <IconChevronLeft className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Back <kbd className="ml-1 rounded-sm bg-background/15 px-1 text-[10px]">{modKey}[</kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="nav-forward-button"
            aria-label="Forward"
            disabled={!canForward}
            onClick={navForward}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <IconChevronRight className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Forward <kbd className="ml-1 rounded-sm bg-background/15 px-1 text-[10px]">{modKey}]</kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  )
})

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'custom', label: 'Custom' },
  { key: 'created', label: 'Created' },
  { key: 'recent', label: 'Recent' },
  { key: 'interaction', label: 'Last interaction' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
]

const SortDropdown = memo(function SortDropdown({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useMenuPosition(dropRef, open ? { x: pos.left, y: pos.top } : null)

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
          <div ref={dropRef} className="fixed z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
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

const AddProjectDropdown = memo(function AddProjectDropdown({ onCloneFromGitHub }: { onCloneFromGitHub?: () => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const setNewProjectOpen = useTaskStore((s) => s.setNewProjectOpen)
  useMenuPosition(dropRef, open ? { x: pos.left, y: pos.top } : null)

  const handleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left })
      }
      return !v
    })
  }, [])

  const handleImportFolder = useCallback(() => {
    setNewProjectOpen(true)
    setOpen(false)
  }, [setNewProjectOpen])

  const handleCloneFromGitHub = useCallback(() => {
    onCloneFromGitHub?.()
    setOpen(false)
  }, [onCloneFromGitHub])

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={btnRef}
            type="button"
            aria-label="Add project"
            data-testid="add-project-button"
            onClick={handleOpen}
            className={cn(
              'inline-flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors',
              open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <IconPlus className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Add project</TooltipContent>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
          <div ref={dropRef} className="fixed z-[200] min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
            <button
              type="button"
              onClick={handleImportFolder}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <IconFolderOpen className="size-3.5" aria-hidden /> Import folder
            </button>
            <button
              type="button"
              onClick={handleCloneFromGitHub}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <IconGitBranch className="size-3.5" aria-hidden /> Clone from GitHub
            </button>
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
  onCollapse?: () => void
  onNavigate?: () => void
  onCloneFromGitHub?: () => void
  isMobileOverlay?: boolean
}

/** Sidebar section showing saved split view pairings */
const SplitViewsList = memo(function SplitViewsList() {
  const splitViews = useTaskStore((s) => s.splitViews)
  const activeSplitId = useTaskStore((s) => s.activeSplitId)
  const tasks = useTaskStore((s) => s.tasks)
  const setActiveSplit = useTaskStore((s) => s.setActiveSplit)
  const removeSplitView = useTaskStore((s) => s.removeSplitView)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; splitId: string } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  useMenuPosition(ctxRef, ctxMenu)

  if (splitViews.length === 0) return null

  const handleContextMenu = (e: React.MouseEvent, splitId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, splitId })
  }

  const handleRemove = () => {
    if (ctxMenu) removeSplitView(ctxMenu.splitId)
    setCtxMenu(null)
  }

  const handleReplace = (side: 'left' | 'right') => {
    if (ctxMenu) useTaskStore.setState({ pendingSplitReplace: { splitId: ctxMenu.splitId, side } })
    setCtxMenu(null)
  }

  const handleSwap = () => {
    if (!ctxMenu) return
    const sv = splitViews.find((s) => s.id === ctxMenu.splitId)
    if (sv) {
      useTaskStore.setState((state) => ({
        splitViews: state.splitViews.map((v) =>
          v.id === sv.id ? { ...v, left: sv.right, right: sv.left } : v,
        ),
      }))
    }
    setCtxMenu(null)
  }

  return (
    <div className="px-2 pb-1">
      <div className="px-2 pb-1 pt-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Side-by-side</span>
      </div>
      <div className="rounded-lg bg-muted/30 p-1">
      <ul className="flex flex-col gap-px">
        {splitViews.map((sv) => {
          const leftName = tasks[sv.left]?.name ?? 'Thread'
          const rightName = tasks[sv.right]?.name ?? 'Thread'
          const isActive = sv.id === activeSplitId
          return (
            <li key={sv.id} className="group/sv relative">
              <button
                type="button"
                onClick={() => setActiveSplit(sv.id)}
                onContextMenu={(e) => handleContextMenu(e, sv.id)}
                className={cn(
                  'flex min-w-0 h-7 w-full items-center gap-2 rounded-lg px-2 text-[12px] select-none transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <IconLayoutColumns className={cn('size-3.5 shrink-0', isActive && 'text-primary/70')} />
                <span className="min-w-0 truncate">{leftName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/30">⇄</span>
                <span className="min-w-0 truncate">{rightName}</span>
              </button>
              <button
                type="button"
                aria-label="Remove side-by-side"
                onClick={(e) => { e.stopPropagation(); removeSplitView(sv.id) }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden size-5 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground group-hover/sv:flex"
              >
                <IconX className="size-3" />
              </button>
            </li>
          )
        })}
      </ul>
      </div>
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[299]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div
            ref={ctxRef}
            className="fixed z-[300] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
              onClick={handleRemove}
            >
              <IconX className="size-3.5" /> Remove
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
              onClick={handleSwap}
            >
              <IconArrowsExchange className="size-3.5" /> Swap sides
            </button>
            <div className="my-1 border-t border-border/50" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
              onClick={() => handleReplace('left')}
            >
              <IconReplace className="size-3.5" /> Replace left
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
              onClick={() => handleReplace('right')}
            >
              <IconReplace className="size-3.5" /> Replace right
            </button>
          </div>
        </>
      )}
    </div>
  )
})

/** Hint banner shown when user needs to click a thread to replace a split side */
const PendingReplaceHint = memo(function PendingReplaceHint() {
  const pending = useTaskStore((s) => s.pendingSplitReplace)
  if (!pending) return null
  return (
    <div className="mx-2 mb-1 flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
      <span>Click a thread to replace {pending.side} panel</span>
      <button
        type="button"
        aria-label="Cancel replace"
        onClick={() => useTaskStore.setState({ pendingSplitReplace: null })}
        className="ml-1 rounded p-0.5 hover:bg-primary/20"
      >
        <IconX className="size-3" />
      </button>
    </div>
  )
})

/** Global pinned threads list shown at the top of the sidebar, above the Projects section */
interface PinnedThreadsListProps {
  readonly tasks: readonly SidebarTask[]
  readonly selectedTaskId: string | null
  readonly onSelectTask: (id: string) => void
  readonly onDeleteTask: (id: string) => void
  readonly onRenameTask: (id: string, name: string) => void
}

const PinnedThreadsList = memo(function PinnedThreadsList({ tasks, selectedTaskId, onSelectTask, onDeleteTask, onRenameTask }: PinnedThreadsListProps) {
  if (tasks.length === 0) return null
  return (
    <div className="flex flex-col px-2 pb-1">
      <div className="px-2 pb-1 pt-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Pinned</span>
      </div>
      <div className="rounded-lg bg-muted/30 p-1">
        <ul className="flex min-w-0 flex-col gap-px">
          {tasks.map((task) => (
            <ThreadItem
              key={task.id}
              task={task}
              isActive={selectedTaskId === task.id}
              jumpLabel={null}
              canMoveUp={false}
              canMoveDown={false}
              onSelect={() => onSelectTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
              onRename={(n) => onRenameTask(task.id, n)}
            />
          ))}
        </ul>
      </div>
    </div>
  )
})

/** Thin separator shown when split views exist above the project list */
const SidebarDivider = memo(function SidebarDivider() {
  const hasSplits = useTaskStore((s) => s.splitViews.length > 0)
  if (!hasSplits) return null
  return <div className="h-px mx-4 bg-border/20" />
})

const SORT_STORAGE_KEY = 'kirodex-sidebar-sort'

const loadSortPreference = (): SortKey => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY)
    if (stored && SORT_OPTIONS.some((o) => o.key === stored)) return stored as SortKey
  } catch { /* private browsing / quota exceeded */ }
  return 'created'
}

const saveSortPreference = (sort: SortKey): void => {
  try { localStorage.setItem(SORT_STORAGE_KEY, sort) } catch { /* best-effort */ }
}

export const TaskSidebar = memo(function TaskSidebar({ width, onResize, position = 'left', onCollapse, onNavigate, onCloneFromGitHub, isMobileOverlay = false }: TaskSidebarProps) {
  const isRight = position === 'right'
  const [sort, setSort] = useState<SortKey>(loadSortPreference)
  const handleSortChange = useCallback((s: SortKey) => {
    setSort(s)
    saveSortPreference(s)
  }, [])
  const { projects: projectList, globalPinned } = useSidebarTasks(sort)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const sidebarCtxRef = useRef<HTMLDivElement>(null)
  useMenuPosition(sidebarCtxRef, ctxMenu)
  const isMetaHeld = useModifierKeys()

  const { selectedTaskId, pendingWorkspace, lastAddedProject, setSelectedTask, setView, setNewProjectOpen, removeTask, removeProject, archiveThreads, renameTask, reorderProject, reorderThread, clearLastAddedProject } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      pendingWorkspace: s.pendingWorkspace,
      lastAddedProject: s.lastAddedProject,
      setSelectedTask: s.setSelectedTask,
      setView: s.setView,
      setNewProjectOpen: s.setNewProjectOpen,
      removeTask: s.removeTask,
      removeProject: s.removeProject,
      archiveThreads: s.archiveThreads,
      renameTask: s.renameTask,
      reorderProject: s.reorderProject,
      reorderThread: s.reorderThread,
      clearLastAddedProject: s.clearLastAddedProject,
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

  /** Move a project up or down, auto-switching to custom sort */
  const handleMoveProject = useCallback((fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
    if (toIdx < 0 || toIdx >= projectList.length) return
    if (sort !== 'custom') handleSortChange('custom')
    reorderProject(fromIdx, toIdx)
  }, [sort, projectList.length, reorderProject, handleSortChange])

  /** Move a thread up or down within a project, auto-switching to custom sort and initializing order */
  const handleMoveThread = useCallback((workspace: string, tasks: readonly SidebarTask[], from: number, to: number) => {
    if (sort !== 'custom') handleSortChange('custom')
    // Initialize threadOrders for this workspace if not yet set
    const state = useTaskStore.getState()
    if (!state.threadOrders[workspace]?.length) {
      const order = tasks.filter((t) => !t.isDraft).map((t) => t.id)
      useTaskStore.setState((s) => ({ threadOrders: { ...s.threadOrders, [workspace]: order } }))
    }
    reorderThread(workspace, from, to)
  }, [sort, handleSortChange, reorderThread])

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

  const handleSelectTask = useCallback((id: string) => {
    if (id.startsWith('draft:')) {
      useTaskStore.getState().setPendingWorkspace(id.slice(6))
    } else {
      // If this thread is part of a split view, activate that split instead
      const state = useTaskStore.getState()
      const sv = state.splitViews.find((v) => v.left === id || v.right === id)
      if (sv) {
        state.setActiveSplit(sv.id)
        const panel = sv.left === id ? 'left' : 'right'
        state.setFocusedPanel(panel)
        useTaskStore.setState({ selectedTaskId: id })
        setView('chat')
      } else {
        setSelectedTask(id); setView('chat')
      }
    }
    onNavigate?.()
  }, [setSelectedTask, setView, onNavigate])
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
  const handleNewThread = useCallback((workspace: string) => {
    useTaskStore.getState().setPendingWorkspace(workspace)
    onNavigate?.()
  }, [onNavigate])

  // Sidebar edge resize
  const handleResizeStart = useResizeHandle({
    axis: 'horizontal', size: width, onResize, min: 180, max: Math.round(window.innerWidth * 0.2), reverse: isRight,
  })

  return (
    <div
      data-testid="task-sidebar"
      onContextMenu={handleContextMenu}
      className={cn(
        'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-foreground shadow-2xl shadow-black/20 sm:rounded-xl sm:shadow-none',
        isMobileOverlay ? 'rounded-2xl pt-10 ring-1 ring-border/60' : 'rounded-xl pt-9',
        isRight && 'order-last',
      )}
      style={{ width }}
    >
      {/* NavHistoryButtons disabled for now */}
      {/* Collapse button in traffic lights zone */}
      {onCollapse && (
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
          className="absolute right-2 top-1 z-20 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {isRight ? <IconLayoutSidebarRightCollapse className="size-4" aria-hidden /> : <IconLayoutSidebarLeftCollapse className="size-4" aria-hidden />}
        </button>
      )}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div ref={sidebarCtxRef} className="fixed z-[200] min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
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
        className={cn('absolute top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors', isRight ? 'left-0' : 'right-0', isMobileOverlay && 'hidden')}
      />
      <SplitViewsList />
      <PendingReplaceHint />
      <PinnedThreadsList
        tasks={globalPinned}
        selectedTaskId={selectedTaskId ?? (pendingWorkspace ? `draft:${pendingWorkspace}` : null)}
        onSelectTask={handleSelectTask}
        onDeleteTask={handleDeleteTask}
        onRenameTask={renameTask}
      />
      <div className="flex items-center justify-between px-4 pb-1.5 pt-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Projects</span>
        <div className="flex shrink-0 items-center gap-1">
          <SortDropdown sort={sort} onChange={handleSortChange} />
          <AddProjectDropdown onCloneFromGitHub={onCloneFromGitHub} />
        </div>
      </div>
      <SidebarDivider />
      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-2">
        <div className="min-w-0 pb-2">
          <div className="relative flex min-w-0 flex-col">
            <ul className="flex min-w-0 flex-col gap-px rounded-lg bg-muted/30 p-1">
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
                  canMoveUp={idx > 0}
                  canMoveDown={idx < projectList.length - 1}
                  autoFocus={project.cwd === lastAddedProject}
                  jumpLabel={isMetaHeld && idx < 9 ? `⌘${idx + 1}` : null}
                  isMetaHeld={isMetaHeld}
                  isCustomSort={sort === 'custom'}
                  onSelectTask={handleSelectTask}
                  onNewThread={() => handleNewThread(project.cwd)}
                  onDeleteTask={handleDeleteTask}
                  onRenameTask={renameTask}
                  onRemoveProject={() => removeProject(project.cwd)}
                  onArchiveThreads={() => archiveThreads(project.cwd)}
                  onMoveUp={() => handleMoveProject(idx, 'up')}
                  onMoveDown={() => handleMoveProject(idx, 'down')}
                  onMoveThread={(from, to) => handleMoveThread(project.cwd, project.tasks, from, to)}
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
