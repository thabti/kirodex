import { useEffect, useCallback, useState, useRef, memo } from "react"
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
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
      {/* Toggle sidebar */}
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
            {isSidebarCollapsed ? (
              sidebarPosition === "right" ? (
                <IconLayoutSidebarRightExpand className="size-4" aria-hidden />
              ) : (
                <IconLayoutSidebarLeftExpand className="size-4" aria-hidden />
              )
            ) : sidebarPosition === "right" ? (
              <IconLayoutSidebarRightCollapse className="size-4" aria-hidden />
            ) : (
              <IconLayoutSidebarLeftCollapse className="size-4" aria-hidden />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Toggle sidebar{" "}
          <kbd className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">
            {isMac ? "⌘" : "Ctrl+"}B
          </kbd>
        </TooltipContent>
      </Tooltip>

      {/* Project */}
      {projectName ? (
        <>
          <Sep />
          <span
            className="min-w-0 max-w-[160px] truncate rounded-sm text-[13px] text-muted-foreground px-0.5"
            title={workspace ?? undefined}
          >
            {projectName}
          </span>
        </>
      ) : (
        <>
          <Sep />
          <span
            data-tauri-drag-region
            className="h-3 w-20 rounded bg-muted-foreground/8"
          />
        </>
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
              className="min-w-0 max-w-[200px] truncate rounded-sm bg-transparent px-0.5 text-[13px] font-medium text-foreground outline-none ring-1 ring-ring"
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
              className="min-w-0 max-w-[200px] cursor-default truncate rounded-sm text-[13px] font-medium text-foreground hover:bg-accent/50 px-0.5 transition-colors"
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
          <span className="text-[13px] text-muted-foreground">New thread</span>
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
