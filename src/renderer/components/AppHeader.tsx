import { memo, useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useTaskStore } from "@/stores/taskStore"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { WindowsControls } from "@/components/unified-title-bar/WindowsControls"
import { HeaderBreadcrumb } from "@/components/header-breadcrumb"
import { HeaderToolbar } from "@/components/header-toolbar"
import { HeaderGhostToolbar } from "@/components/header-ghost-toolbar"
import { HeaderUserMenu } from "@/components/header-user-menu"
import { cn } from "@/lib/utils"

// ── Platform detection ───────────────────────────────────────
type AppPlatform = "macos" | "windows" | "linux"

const detectPlatform = (): AppPlatform => {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) return "macos"
  if (ua.includes("win")) return "windows"
  return "linux"
}

const PLATFORM = detectPlatform()
const IS_MAC = PLATFORM === "macos"

// ── Window drag handler ──────────────────────────────────────
const INTERACTIVE =
  'button, a, input, textarea, select, [role="button"], [data-no-drag]'

const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return
  if (e.detail === 2) {
    getCurrentWindow().toggleMaximize()
  } else {
    getCurrentWindow().startDragging()
  }
}

// ── AppHeader ─────────────────────────────────────────────────────────
interface AppHeaderProps {
  sidePanelOpen: boolean
  onToggleSidePanel: () => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarPosition?: "left" | "right"
}

const AppHeaderInner = memo(function AppHeaderInner({
  sidePanelOpen,
  onToggleSidePanel,
  isSidebarCollapsed,
  onToggleSidebar,
  sidebarPosition = "left",
}: AppHeaderProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!IS_MAC) return
    getCurrentWindow().isFullscreen().then(setIsFullscreen).catch(() => {})
    let unlisten: (() => void) | undefined
    getCurrentWindow().onResized(() => {
      getCurrentWindow().isFullscreen().then(setIsFullscreen).catch(() => {})
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  const taskWorkspace = useTaskStore((s) => {
    const id = s.selectedTaskId
    return id ? s.tasks[id]?.workspace : null
  })
  const pendingWorkspace = useTaskStore((s) => s.pendingWorkspace)
  const workspace = taskWorkspace ?? pendingWorkspace

  return (
    <header
      data-testid="app-header"
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      className={cn(
        "flex h-[38px] shrink-0 items-center gap-3 border-b border-border bg-background p-0 pt-1 select-none [-webkit-user-select:none]",
        IS_MAC ? (isFullscreen ? "pl-2 pr-2" : "pl-[74px] pr-2") : "pl-2 pr-[138px]",
      )}
    >
      {/* Breadcrumb left */}
      <HeaderBreadcrumb
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        sidebarPosition={sidebarPosition}
        isMac={IS_MAC}
      />

      {/* Actions right */}
      {!workspace && <HeaderGhostToolbar />}
      {workspace && (
        <HeaderToolbar
          workspace={workspace}
          sidePanelOpen={sidePanelOpen}
          onToggleSidePanel={onToggleSidePanel}
        />
      )}

      {/* User menu */}
      <HeaderUserMenu />

      {/* Window controls for Windows/Linux */}
      {!IS_MAC && (
        <div className="fixed top-0 right-0 z-50">
          <WindowsControls />
        </div>
      )}
    </header>
  )
})

const HeaderFallback = () => (
  <header
    data-tauri-drag-region
    className={cn(
      "drag-region flex h-[38px] shrink-0 items-center gap-3 border-b border-border bg-card p-0 pt-1",
      IS_MAC ? "ml-[74px]" : "ml-2 mr-[138px]",
    )}
  />
)

export function AppHeader(props: AppHeaderProps) {
  return (
    <ErrorBoundary fallback={<HeaderFallback />}>
      <AppHeaderInner {...props} />
    </ErrorBoundary>
  )
}
