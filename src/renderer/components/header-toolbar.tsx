import { useCallback, useEffect, useState, memo, useRef } from "react"
import {
  IconGitCompare,
  IconTerminal2,
  IconGitBranch,
  IconLayoutColumns,
  IconFolderOpen,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { useTaskStore } from "@/stores/taskStore"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { OpenInEditorGroup } from "@/components/OpenInEditorGroup"
import { GitActionsGroup } from "@/components/GitActionsGroup"
import { SplitThreadPicker } from "@/components/chat/SplitThreadPicker"
import { ipc } from "@/lib/ipc"
import { cn } from "@/lib/utils"
import { withGitToast } from "@/lib/git-toast"
import { useFileTreeStore } from "@/stores/fileTreeStore"
import type { TaskStatus } from "@/types"

/** Toggle button for split-screen mode. Opens a thread picker or closes split. */
const SplitToggleButton = memo(function SplitToggleButton() {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const activeSplitId = useTaskStore((s) => s.activeSplitId)
  const isSplit = activeSplitId !== null
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleClick = useCallback(() => {
    if (isSplit) {
      useTaskStore.getState().closeSplit()
      return
    }
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPickerPos({ x: rect.right - 280, y: rect.bottom + 6 })
  }, [isSplit])

  if (!selectedTaskId) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={btnRef}
            type="button"
            data-testid="toggle-split-button"
            aria-label="Toggle side-by-side"
            aria-pressed={isSplit}
            onClick={handleClick}
            className={cn(
              "inline-flex size-7 items-center justify-center text-xs transition-colors",
              isSplit
                ? "bg-violet-500/20 text-violet-300"
                : "text-violet-400/70 hover:bg-violet-500/10 hover:text-violet-300",
            )}
          >
            <IconLayoutColumns className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isSplit ? "Close side-by-side" : "Side-by-side · two threads at once"}
        </TooltipContent>
      </Tooltip>
      {pickerPos && selectedTaskId && (
        <SplitThreadPicker
          anchorTaskId={selectedTaskId}
          position={pickerPos}
          onClose={() => setPickerPos(null)}
        />
      )}
    </>
  )
})

/** Toggle button for file tree panel. */
const FileTreeToggleButton = memo(function FileTreeToggleButton() {
  const isOpen = useFileTreeStore((s) => s.isOpen)
  const toggle = useFileTreeStore((s) => s.toggle)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="toggle-file-tree-button"
          aria-label="Toggle file tree"
          aria-pressed={isOpen}
          onClick={toggle}
          className={cn(
            "inline-flex size-7 items-center justify-center text-xs transition-colors",
            isOpen
              ? "bg-white/[0.08] text-foreground"
              : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
          )}
        >
          <IconFolderOpen className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">File tree</TooltipContent>
    </Tooltip>
  )
})

interface HeaderToolbarProps {
  workspace: string
  sidePanelOpen: boolean
  onToggleSidePanel: () => void
}

export const HeaderToolbar = memo(function HeaderToolbar({
  workspace,
  sidePanelOpen,
  onToggleSidePanel,
}: HeaderToolbarProps) {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskStatus = useTaskStore((s) =>
    selectedTaskId ? s.tasks[selectedTaskId]?.status : null,
  ) as TaskStatus | null
  const terminalOpen = useTaskStore((s) =>
    selectedTaskId ? s.terminalOpenTasks.has(selectedTaskId) : false,
  )
  const toggleTerminal = useTaskStore((s) => s.toggleTerminal)

  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [diffStats, setDiffStats] = useState({
    additions: 0,
    deletions: 0,
    fileCount: 0,
  })

  // Detect whether workspace is a git repo
  useEffect(() => {
    let stale = false
    ipc.gitDetect(workspace).then((detected) => {
      if (!stale) setIsGitRepo(detected)
    }).catch(() => {
      if (!stale) setIsGitRepo(false)
    })
    return () => { stale = true }
  }, [workspace])

  // Poll diff stats only when it's a git repo
  useEffect(() => {
    if (!isGitRepo) return
    let stale = false
    const fetch = () => {
      ipc
        .gitDiffStats(workspace)
        .then((s) => {
          if (!stale) setDiffStats(s)
        })
        .catch(() => {})
    }
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => {
      stale = true
      clearInterval(interval)
    }
  }, [workspace, taskStatus, isGitRepo])

  const handleInitGit = useCallback(async () => {
    setIsInitializing(true)
    try {
      await ipc.gitInit(workspace)
      setIsGitRepo(true)
    } catch {
      // Error is non-critical; user can retry
    } finally {
      setIsInitializing(false)
    }
  }, [workspace])

  const canPause = taskStatus === "running"
  const hasStats = diffStats.additions > 0 || diffStats.deletions > 0
  const [stashing, setStashing] = useState(false)

  const handleCommit = useCallback(() => {
    if (!sidePanelOpen) onToggleSidePanel()
  }, [sidePanelOpen, onToggleSidePanel])

  const handleStash = useCallback(async () => {
    if (stashing) return
    setStashing(true)
    try {
      await withGitToast('Stash', () => ipc.gitStashSave(workspace))
      // Refresh diff stats
      const s = await ipc.gitDiffStats(workspace).catch(() => null)
      if (s) setDiffStats(s)
    } catch { /* toast handled */ }
    finally { setStashing(false) }
  }, [stashing, workspace])

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex items-center rounded-lg bg-muted/40" data-no-drag>
        <ErrorBoundary fallback={null}>
          <OpenInEditorGroup workspace={workspace} />
        </ErrorBoundary>

        {selectedTaskId && (
          <>
            <div className="h-5 w-px self-center bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid="toggle-terminal-button"
                  aria-label="Toggle terminal"
                  aria-pressed={terminalOpen}
                  onClick={() => toggleTerminal(selectedTaskId)}
                  className={cn(
                    "inline-flex size-7 items-center justify-center text-xs transition-colors",
                    terminalOpen
                      ? "bg-white/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                  )}
                >
                  <IconTerminal2 className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Terminal</TooltipContent>
            </Tooltip>
          </>
        )}

        <div className="h-5 w-px self-center bg-border" />
        <FileTreeToggleButton />

        <div className="h-5 w-px self-center bg-border" />
        <SplitToggleButton />
      </div>

      {/* Git section — far right with accent */}
      {isGitRepo === false && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="git-init-button"
              aria-label="Initialize Git repository"
              disabled={isInitializing}
              onClick={handleInitGit}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                "bg-emerald-500/[0.06] hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                isInitializing && "opacity-50 cursor-not-allowed",
              )}
            >
              <IconGitBranch className="size-3" aria-hidden />
              {isInitializing ? "Initializing…" : "Initialize Git"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Initialize a git repository</TooltipContent>
        </Tooltip>
      )}

      {isGitRepo && (
        <div className="flex items-center rounded-lg bg-emerald-500/[0.06]">
          {hasStats && (
            <div className="group/dirty flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-testid="worktree-dirty-indicator"
                    aria-label={`${diffStats.fileCount} uncommitted change${diffStats.fileCount === 1 ? '' : 's'}`}
                    onClick={() => { if (!sidePanelOpen) onToggleSidePanel() }}
                    className="inline-flex h-7 w-6 items-center justify-center rounded-l-lg text-amber-600 transition-colors hover:bg-amber-500/15 dark:text-amber-400"
                  >
                    <IconAlertTriangle className="size-3" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {diffStats.fileCount} uncommitted change{diffStats.fileCount === 1 ? '' : 's'}
                </TooltipContent>
              </Tooltip>
              <div className="flex max-w-0 items-center overflow-hidden transition-[max-width] duration-150 ease-out group-hover/dirty:max-w-[180px] focus-within:max-w-[180px]">
                <button
                  type="button"
                  data-testid="worktree-dirty-commit"
                  onClick={handleCommit}
                  className="h-7 px-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/15 focus-visible:bg-amber-500/15 dark:text-amber-300"
                >
                  Commit
                </button>
                <button
                  type="button"
                  data-testid="worktree-dirty-stash"
                  onClick={handleStash}
                  disabled={stashing}
                  className="h-7 px-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/15 focus-visible:bg-amber-500/15 disabled:opacity-50 dark:text-amber-300"
                >
                  {stashing ? 'Stashing…' : 'Stash'}
                </button>
                <div className="mr-1 h-4 w-px bg-amber-500/30" />
              </div>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="toggle-diff-button"
                aria-label="Toggle diff panel"
                aria-pressed={sidePanelOpen}
                onClick={onToggleSidePanel}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 px-2 text-xs transition-colors",
                  hasStats ? "rounded-none" : "rounded-l-lg",
                  sidePanelOpen
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10",
                )}
              >
                <IconGitCompare className="size-3" aria-hidden />
                {hasStats && (
                  <span
                    className={cn(
                      "flex items-center gap-1 tabular-nums",
                      canPause && "animate-pulse",
                    )}
                  >
                    {diffStats.fileCount > 0 && (
                      <span className="text-[10px] text-emerald-700/70 dark:text-emerald-400/60">
                        {diffStats.fileCount}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      +{diffStats.additions.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                      -{diffStats.deletions.toLocaleString()}
                    </span>
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Files changed</TooltipContent>
          </Tooltip>
          <ErrorBoundary fallback={null}>
            <GitActionsGroup workspace={workspace} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
})
