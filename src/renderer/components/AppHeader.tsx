import { memo, useEffect, useState } from "react"
import { isTauriRuntime } from "@/lib/web-rpc"
import { useTaskStore } from "@/stores/taskStore"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { WindowsControls } from "@/components/unified-title-bar/WindowsControls"
import { HeaderBreadcrumb } from "@/components/header-breadcrumb"
import { HeaderToolbar } from "@/components/header-toolbar"
import { HeaderGhostToolbar } from "@/components/header-ghost-toolbar"
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
  if (!isTauriRuntime()) return
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return
  if (e.detail === 2) {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().toggleMaximize()
    }).catch(() => {})
  } else {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().startDragging()
    }).catch(() => {})
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
    if (!IS_MAC || !isTauriRuntime()) return
    let unlisten: (() => void) | undefined
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow()
      win.isFullscreen().then(setIsFullscreen).catch(() => {})
      win.onResized(() => {
        win.isFullscreen().then(setIsFullscreen).catch(() => {})
      }).then((fn) => { unlisten = fn })
    }).catch(() => {})
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
        "flex h-[44px] shrink-0 items-center gap-2 bg-background px-2 select-none [-webkit-user-select:none] sm:h-[32px] sm:gap-3 sm:p-0",
        IS_MAC
          ? (isFullscreen ? "sm:pl-2 sm:pr-0" : isSidebarCollapsed ? "sm:pl-[74px] sm:pr-0" : "sm:pl-2 sm:pr-0")
          : "sm:pl-2 sm:pr-[138px]",
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

      {/* Window controls for Windows/Linux */}
      {!IS_MAC && (
        <div className="fixed top-0 right-0 z-50 hidden sm:block">
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
      "drag-region flex h-[32px] shrink-0 items-center gap-3 border-b border-border bg-card p-0",
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
