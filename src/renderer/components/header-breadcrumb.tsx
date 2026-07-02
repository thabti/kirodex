import { useEffect, useCallback, useState, useRef, memo } from "react"
import {
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightExpand,
  IconGitBranch,
} from "@tabler/icons-react"
import { useTaskStore } from "@/stores/taskStore"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const Sep = () => <span className="text-muted-foreground select-none">/</span>

interface HeaderBreadcrumbProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarPosition: "left" | "right"
  isMac: boolean
}

export const HeaderBreadcrumb = memo(function HeaderBreadcrumb({
  isSidebarCollapsed,
  onToggleSidebar,
  sidebarPosition,
  isMac,
}: HeaderBreadcrumbProps) {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskName = useTaskStore((s) =>
    selectedTaskId ? s.tasks[selectedTaskId]?.name : null,
  )
  const taskWorkspace = useTaskStore((s) =>
    selectedTaskId ? s.tasks[selectedTaskId]?.workspace : null,
  )
  const taskOriginalWorkspace = useTaskStore((s) =>
    selectedTaskId ? s.tasks[selectedTaskId]?.originalWorkspace : null,
  )
  const isWorktree = useTaskStore((s) =>
    selectedTaskId ? !!s.tasks[selectedTaskId]?.worktreePath : false,
  )
  const pendingWorkspace = useTaskStore((s) => s.pendingWorkspace)
  const renameTask = useTaskStore((s) => s.renameTask)
  const projectNames = useTaskStore((s) => s.projectNames)

  const workspace = taskWorkspace ?? pendingWorkspace
  const projectRoot = taskOriginalWorkspace ?? workspace
  const projectName =
    (projectRoot
      ? (projectNames[projectRoot] ?? projectRoot.split("/").pop())
      : null) ?? null

  const [editingThread, setEditingThread] = useState(false)
  const [threadEditValue, setThreadEditValue] = useState("")
  const threadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingThread) threadInputRef.current?.select()
  }, [editingThread])

  const handleThreadDoubleClick = useCallback(() => {
    if (!selectedTaskId || !taskName) return
    setThreadEditValue(taskName)
    setEditingThread(true)
  }, [selectedTaskId, taskName])

  const commitThreadRename = useCallback(() => {
    const trimmed = threadEditValue.trim()
    if (selectedTaskId && trimmed && trimmed !== taskName)
      renameTask(selectedTaskId, trimmed)
    setEditingThread(false)
  }, [threadEditValue, taskName, selectedTaskId, renameTask])

  return (
    <nav
      data-testid="app-header-breadcrumb"
      data-tauri-drag-region
      className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
    >
      {/* Toggle sidebar — only shown when collapsed */}
      {isSidebarCollapsed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="toggle-sidebar-button"
              aria-label="Toggle sidebar"
              aria-pressed={!isSidebarCollapsed}
              onClick={onToggleSidebar}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {sidebarPosition === "right" ? (
                <IconLayoutSidebarRightExpand className="size-4" aria-hidden />
              ) : (
                <IconLayoutSidebarLeftExpand className="size-4" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Toggle sidebar{" "}
            <kbd className="ml-1 rounded-sm bg-background/15 px-1 text-[10px]">
              {isMac ? "⌘" : "Ctrl+"}B
            </kbd>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Project */}
      {projectName ? (
        <span
          className="min-w-0 max-w-[30vw] truncate rounded-sm px-0.5 text-[12px] text-muted-foreground sm:max-w-[160px] sm:text-[13px]"
          title={workspace ?? undefined}
        >
          {projectName}
        </span>
      ) : (
        <span
          data-tauri-drag-region
          className="h-3 w-20 rounded bg-muted-foreground/8"
        />
      )}

      {/* Thread */}
      {taskName ? (
        <>
          <Sep />
          {editingThread ? (
            <input
              ref={threadInputRef}
              data-no-drag
              value={threadEditValue}
              onChange={(e) => setThreadEditValue(e.target.value)}
              onBlur={commitThreadRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitThreadRename()
                if (e.key === "Escape") setEditingThread(false)
              }}
              className="min-w-0 max-w-[38vw] truncate rounded-sm bg-transparent px-0.5 text-[12px] font-medium text-foreground outline-none ring-1 ring-ring sm:max-w-[200px] sm:text-[13px]"
            />
          ) : (
            <span
              data-no-drag
              role="button"
              tabIndex={0}
              aria-label={`Rename thread ${taskName}`}
              onDoubleClick={handleThreadDoubleClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "F2")
                  handleThreadDoubleClick()
              }}
              className="min-w-0 max-w-[38vw] cursor-default truncate rounded-sm px-0.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent/50 sm:max-w-[200px] sm:text-[13px]"
              title={taskName}
            >
              {taskName}
            </span>
          )}
          {isWorktree && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconGitBranch
                  className="size-3.5 shrink-0 text-violet-500 dark:text-violet-400"
                  aria-label="Worktree thread"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">Worktree</TooltipContent>
            </Tooltip>
          )}
        </>
      ) : pendingWorkspace ? (
        <>
          <Sep />
          <span className="text-[12px] text-muted-foreground sm:text-[13px]">New thread</span>
        </>
      ) : !workspace ? (
        <>
          <Sep />
          <span
            data-tauri-drag-region
            className="h-3 w-28 rounded bg-muted-foreground/6"
          />
        </>
      ) : null}
    </nav>
  )
})
