import { useState, useRef, useEffect, useCallback } from 'react'
import { Pause, Play, XCircle, GitCompareArrows, GitCommitHorizontal, ChevronDown, TerminalSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTaskStore } from '@/stores/taskStore'
import { useDiffStore } from '@/stores/diffStore'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

// ── Window drag handler ──────────────────────────────────────
// data-tauri-drag-region only works on the element itself, not children.
// We use startDragging() on mousedown for reliable dragging across the
// entire header, excluding interactive elements (buttons, inputs, links).
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [data-no-drag]'

const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
  // Only primary button
  if (e.button !== 0) return
  // Skip interactive elements
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return
  if (e.detail === 2) {
    // Double-click: toggle maximize
    getCurrentWindow().toggleMaximize()
  } else {
    getCurrentWindow().startDragging()
  }
}

// ── Zed SVG icon ──────────────────────────────────────────────────────
const ZedIcon = () => (
  <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 96 96">
    <g clipPath="url(#zed-a)">
      <path fill="currentColor" fillRule="evenodd" d="M9 6a3 3 0 0 0-3 3v66H0V9a9 9 0 0 1 9-9h80.379c4.009 0 6.016 4.847 3.182 7.682L43.055 57.187H57V51h6v7.688a4.5 4.5 0 0 1-4.5 4.5H37.055L26.743 73.5H73.5V36h6v37.5a6 6 0 0 1-6 6H20.743L10.243 90H87a3 3 0 0 0 3-3V21h6v66a9 9 0 0 1-9 9H6.621c-4.009 0-6.016-4.847-3.182-7.682L52.757 39H39v6h-6v-7.5a4.5 4.5 0 0 1 4.5-4.5h21.257l10.5-10.5H22.5V60h-6V22.5a6 6 0 0 1 6-6h52.757L85.757 6H9Z" clipRule="evenodd" />
    </g>
    <defs><clipPath id="zed-a"><path fill="#fff" d="M0 0h96v96H0z" /></clipPath></defs>
  </svg>
)

const GitHubIcon = () => (
  <svg aria-hidden className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

// ── OpenInEditor button group ─────────────────────────────────────────
function OpenInEditorGroup({ workspace }: { workspace: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const open = (editor: string) => { void ipc.openInEditor(workspace, editor); setMenuOpen(false) }

  return (
    <div ref={ref} className="relative flex w-fit">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => open('zed')}
            className="inline-flex h-6 items-center gap-1 rounded-l-md border border-input bg-popover px-1.5 text-xs text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
            <ZedIcon />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open in Zed</TooltipContent>
      </Tooltip>
      <div className="pointer-events-none relative z-[2] w-px bg-input dark:bg-input/32" />
      <button type="button" aria-label="Open options" onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-r-md border border-input bg-popover text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-7 z-[200] min-w-[130px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          {(['zed', 'vscode', 'cursor'] as const).map((e) => (
            <button key={e} type="button" onClick={() => open(e)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors capitalize">
              {e === 'zed' ? <ZedIcon /> : e === 'vscode' ? <span className="size-3.5 text-[10px]">VS</span> : <span className="size-3.5 text-[10px]">Cur</span>}
              {e === 'vscode' ? 'VS Code' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── GitActions button group ───────────────────────────────────────────
function GitActionsGroup({ taskId, workspace }: { taskId: string; workspace: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setBusy(true)
    try { await ipc.gitCommit(taskId, commitMsg.trim()); setCommitMsg(''); setShowCommitInput(false) }
    catch (e) { alert(e instanceof Error ? e.message : 'Commit failed') }
    finally { setBusy(false) }
  }

  const handlePush = async () => {
    setBusy(true)
    try { await ipc.gitPush(taskId) }
    catch (e) { alert(e instanceof Error ? e.message : 'Push failed') }
    finally { setBusy(false); setMenuOpen(false) }
  }

  return (
    <div ref={ref} className="relative flex w-fit">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => setShowCommitInput((v) => !v)} disabled={busy}
            className="inline-flex h-6 items-center gap-1 rounded-l-md border border-input bg-popover px-1.5 text-xs text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32 disabled:opacity-50">
            <GitCommitHorizontal className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Git commit</TooltipContent>
      </Tooltip>
      <div className="pointer-events-none relative z-[2] w-px bg-input dark:bg-input/32" />
      <button type="button" aria-label="Git options" onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-r-md border border-input bg-popover text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>

      {showCommitInput && (
        <div className="absolute right-0 top-7 z-[200] w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Commit message</p>
          <input autoFocus value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCommit() }}
            placeholder="feat: ..."
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring" />
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setShowCommitInput(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">Cancel</button>
            <button type="button" onClick={() => void handleCommit()} disabled={!commitMsg.trim() || busy}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Committing...' : 'Commit'}
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="absolute right-0 top-7 z-[200] min-w-[140px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          <button type="button" onClick={() => void handlePush()} disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors disabled:opacity-50">
            <GitCommitHorizontal className="size-3.5" /> Push
          </button>
          <button type="button" onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors">
            <GitHubIcon /> Open on GitHub
          </button>
        </div>
      )}
    </div>
  )
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
    <header data-tauri-drag-region onMouseDown={handleHeaderMouseDown} className="flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pl-[90px] select-none [-webkit-user-select:none]">
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
  <header data-tauri-drag-region className="drag-region flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pl-[90px]">
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
