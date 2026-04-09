import { useEffect, useCallback } from 'react'
import { Pause, Play, XCircle, GitCompareArrows, TerminalSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTaskStore } from '@/stores/taskStore'
import { useDiffStore } from '@/stores/diffStore'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OpenInEditorGroup } from '@/components/OpenInEditorGroup'
import { GitActionsGroup } from '@/components/GitActionsGroup'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

// ── Window drag handler ──────────────────────────────────────
// Belt-and-suspenders: data-tauri-drag-region (+ CSS app-region: drag)
// handles native drag when focused; startDragging() JS API covers edge
// cases where the attribute alone fails (known Tauri issue #4316).
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [data-no-drag]'

const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return
  if (e.detail === 2) {
    getCurrentWindow().toggleMaximize()
  } else {
    getCurrentWindow().startDragging()
  }
}

// ── Breadcrumb separator ──────────────────────────────────────────────
const Sep = () => <span className="text-muted-foreground/25 select-none">/</span>

// ── AppHeader ─────────────────────────────────────────────────────────
interface AppHeaderProps {
  sidePanelOpen: boolean
  onToggleSidePanel: () => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
}

function AppHeaderInner({ sidePanelOpen, onToggleSidePanel, isSidebarCollapsed, onToggleSidebar }: AppHeaderProps) {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const task = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId] : null)
  const pendingWorkspace = useTaskStore((s) => s.pendingWorkspace)
  const taskStatus = task?.status
  const terminalOpen = useTaskStore((s) => s.terminalOpen)
  const toggleTerminal = useTaskStore((s) => s.toggleTerminal)
  const diffStats = useDiffStore((s) => s.stats)
  const fetchDiff = useDiffStore((s) => s.fetchDiff)

  // Auto-refresh diff stats when task or status changes
  useEffect(() => {
    if (selectedTaskId) void fetchDiff(selectedTaskId)
  }, [selectedTaskId, taskStatus, fetchDiff])

  const handlePause = useCallback(() => { if (task) ipc.pauseTask(task.id) }, [task?.id])
  const handleResume = useCallback(() => { if (task) ipc.resumeTask(task.id) }, [task?.id])
  const handleCancel = useCallback(() => { if (task) ipc.cancelTask(task.id) }, [task?.id])

  // Show workspace from task or from pendingWorkspace (before first message)
  const workspace = task?.workspace ?? pendingWorkspace
  const projectName = workspace?.split('/').pop() ?? null
  const canPause = task?.status === 'running'
  const canResume = task?.status === 'paused' && !!task.userPaused
  const canCancel = task?.status === 'running' || (task?.status === 'paused' && !!task?.userPaused)
  const hasStats = diffStats.additions > 0 || diffStats.deletions > 0

  return (
    <header data-testid="app-header" data-tauri-drag-region onMouseDown={handleHeaderMouseDown} className="flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pl-[90px] select-none [-webkit-user-select:none]">
      {/* Breadcrumb left */}
      <nav data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {/* Logo / app name */}
        <span data-tauri-drag-region className="shrink-0 text-sm font-medium tracking-tight text-muted-foreground">
          Kirodex
        </span>
        <span data-tauri-drag-region className="shrink-0 rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/50">
          Beta
        </span>

        {/* Toggle sidebar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Toggle sidebar"
              aria-pressed={!isSidebarCollapsed}
              onClick={onToggleSidebar}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle sidebar <kbd className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">⌘B</kbd></TooltipContent>
        </Tooltip>

        {/* Project */}
        {projectName && (
          <>
            <Sep />
            <span data-tauri-drag-region className="min-w-0 max-w-[160px] truncate text-[13px] text-muted-foreground" title={workspace ?? undefined}>
              {projectName}
            </span>
          </>
        )}

        {/* Thread */}
        {task ? (
          <>
            <Sep />
            <span data-tauri-drag-region className="min-w-0 max-w-[200px] truncate text-[13px] font-medium text-foreground" title={task.name}>
              {task.name}
            </span>
          </>
        ) : pendingWorkspace ? (
          <>
            <Sep />
            <span className="text-[13px] text-muted-foreground/60">New thread</span>
          </>
        ) : null}

        {/* Status dot in header */}
        {task && task.status === 'running' && (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
        )}
        {task && task.status === 'pending_permission' && (
          <span className="size-2 shrink-0 rounded-full bg-amber-400" />
        )}
      </nav>

      {/* Actions (right) — show editor when any workspace is active, task actions when task exists */}
      {workspace && (
        <div className="flex shrink-0 items-center gap-2">
          <ErrorBoundary fallback={null}>
            <OpenInEditorGroup workspace={workspace} />
          </ErrorBoundary>
          {task && (
            <ErrorBoundary fallback={null}>
              <GitActionsGroup taskId={task.id} workspace={task.workspace} />
            </ErrorBoundary>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle diff panel"
                aria-pressed={sidePanelOpen}
                onClick={onToggleSidePanel}
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-md border border-input px-1.5 text-xs shadow-xs/5 transition-colors',
                  sidePanelOpen ? 'bg-input/64 dark:bg-input text-foreground' : 'bg-popover hover:bg-accent/50 dark:bg-input/32 text-muted-foreground',
                )}
              >
                <GitCompareArrows className="size-3" aria-hidden />
                {hasStats && (
                  <span className={cn('flex items-center gap-1 tabular-nums', canPause && 'animate-pulse')}>
                    {diffStats.fileCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">{diffStats.fileCount}</span>
                    )}
                    <span className="text-[10px] font-semibold text-emerald-500">+{diffStats.additions.toLocaleString()}</span>
                    <span className="text-[10px] font-semibold text-red-500">-{diffStats.deletions.toLocaleString()}</span>
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Files changed</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle terminal"
                aria-pressed={terminalOpen}
                onClick={toggleTerminal}
                className={cn(
                  'inline-flex h-6 items-center rounded-md border border-input px-1.5 text-xs shadow-xs/5 transition-colors',
                  terminalOpen ? 'bg-input/64 dark:bg-input text-foreground' : 'bg-popover hover:bg-accent/50 dark:bg-input/32 text-muted-foreground',
                )}
              >
                <TerminalSquare className="size-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Terminal</TooltipContent>
          </Tooltip>

          {canPause && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={handlePause}><Pause className="size-3.5" /></Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pause</TooltipContent>
            </Tooltip>
          )}
          {canResume && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={handleResume}><Play className="size-3.5" /></Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Resume</TooltipContent>
            </Tooltip>
          )}
          {canCancel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={handleCancel}><XCircle className="size-3.5" /></Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cancel</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </header>
  )
}

const HeaderFallback = () => (
  <header data-tauri-drag-region className="drag-region flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pl-[76px]">
    <span className="text-sm font-medium tracking-tight text-muted-foreground">Kirodex</span>
  </header>
)

export function AppHeader(props: AppHeaderProps) {
  return (
    <ErrorBoundary fallback={<HeaderFallback />}>
      <AppHeaderInner {...props} />
    </ErrorBoundary>
  )
}
