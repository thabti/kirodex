import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { IconSettings, IconBug, IconDownload, IconDots } from '@tabler/icons-react'
import { getVersion } from '@tauri-apps/api/app'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useJsDebugStore } from '@/stores/jsDebugStore'
import { useUpdateStore, type UpdateStatus } from '@/stores/updateStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { useMenuPosition } from '@/hooks/useMenuPosition'
import { measureMemory, formatBytes } from '@/lib/thread-memory'
import { deriveConnectionUiState, type ConnectionUiState } from '@/lib/connection-state'
import { cn } from '@/lib/utils'
import { KiroConfigPanel } from './KiroConfigPanel'
import { HeaderUserMenu } from '@/components/header-user-menu'

const MEMORY_SPIKE_THRESHOLD = 100 * 1024 * 1024
const MEMORY_CHECK_INTERVAL_MS = 5000

const hasUpdateIndicator = (status: UpdateStatus): boolean =>
  status === 'available' || status === 'downloading' || status === 'ready'

const CONNECTION_DOT: Record<ConnectionUiState, { color: string; label: string; pulse: boolean }> = {
  connected: { color: '#34d399', label: 'Connected', pulse: false },
  connecting: { color: '#fbbf24', label: 'Connecting…', pulse: true },
  reconnecting: { color: '#fbbf24', label: 'Reconnecting…', pulse: true },
  error: { color: '#f87171', label: 'Connection error', pulse: false },
  offline: { color: '#9a9a9a', label: 'Offline', pulse: false },
}

const KiroConfigFooter = memo(function KiroConfigFooter() {
  const [collapsed, setCollapsed] = useState(true)
  const [height, setHeight] = useState(160)

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  const handleDragStart = useResizeHandle({
    axis: 'vertical', size: height, onResize: setHeight, min: 80, max: 400, reverse: true,
  })

  return (
    <div className="flex min-h-0 flex-col border-b border-border">
      <div className="flex items-center border-t border-border">
        <div onMouseDown={handleDragStart} className="flex-1 h-1.5 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 transition-colors" />
      </div>
      {collapsed ? (
        <div className="px-1 py-1">
          <KiroConfigPanel collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </div>
      ) : (
        <ScrollArea style={{ height, maxHeight: '100%' }} className="min-h-0">
          <div className="px-1 py-1">
            <KiroConfigPanel collapsed={collapsed} onToggleCollapse={toggleCollapse} />
          </div>
        </ScrollArea>
      )}
    </div>
  )
})

export const SidebarFooter = memo(function SidebarFooter() {
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen)
  const updateStatus = useUpdateStore((s) => s.status)
  const isUpdateAvailable = updateStatus === 'available'
  const triggerDownload = useUpdateStore((s) => s.triggerDownload)
  const isIndicatorVisible = hasUpdateIndicator(updateStatus)
  const connectionStatus = useTaskStore((s) => s.connectionStatus)
  const connectionUi = deriveConnectionUiState(connectionStatus)
  const connectionDot = CONNECTION_DOT[connectionUi]
  const [isMemorySpike, setIsMemorySpike] = useState(false)
  const [spikeTotal, setSpikeTotal] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  useMenuPosition(menuRef, menuOpen ? { x: menuPos.left, y: menuPos.top } : null)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => {
      const report = measureMemory(
        useTaskStore.getState(),
        useDebugStore.getState(),
        useJsDebugStore.getState(),
      )
      const isHot = report.grandTotal >= MEMORY_SPIKE_THRESHOLD
      setIsMemorySpike(isHot)
      if (isHot) setSpikeTotal(formatBytes(report.grandTotal))
    }
    check()
    const id = window.setInterval(check, MEMORY_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const handleOpenMenu = useCallback(() => {
    setMenuOpen((v) => {
      if (!v && menuBtnRef.current) {
        const r = menuBtnRef.current.getBoundingClientRect()
        setMenuPos({ top: r.top - 8, left: r.left })
      }
      return !v
    })
  }, [])

  const handleSettingsClick = useCallback(() => {
    setMenuOpen(false)
    setSettingsOpen(true, isMemorySpike ? 'memory' : undefined)
  }, [setSettingsOpen, isMemorySpike])

  const handleDebugClick = useCallback(() => {
    setMenuOpen(false)
    useDebugStore.getState().toggleOpen()
  }, [])

  const handleUpdateClick = useCallback(() => {
    setMenuOpen(false)
    triggerDownload?.()
  }, [triggerDownload])

  return (
    <>
      <KiroConfigFooter />
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-1.5">
        {connectionUi !== 'connected' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                aria-label={connectionDot.label}
                className="relative flex size-5 shrink-0 items-center justify-center"
              >
                {connectionDot.pulse && (
                  <span
                    className="absolute size-2 animate-ping rounded-full"
                    style={{ background: `${connectionDot.color}55` }}
                  />
                )}
                <span className="relative size-1.5 rounded-full" style={{ background: connectionDot.color }} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{connectionDot.label}</TooltipContent>
          </Tooltip>
        )}
        {isMemorySpike && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSettingsClick}
                aria-label={`Memory spike: ${spikeTotal}`}
                className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive hover:bg-destructive/25 transition-colors"
              >
                <span className="size-1.5 rounded-full bg-destructive" /> Memory
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Memory spike: {spikeTotal}</TooltipContent>
          </Tooltip>
        )}
        {!isMemorySpike && isUpdateAvailable && (
          <button
            type="button"
            aria-label="Download and install update"
            onClick={handleUpdateClick}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium leading-none text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <IconDownload size={10} />
            Update
          </button>
        )}
        {!isMemorySpike && !isUpdateAvailable && isIndicatorVisible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid="update-indicator-dot"
                className="relative flex size-5 shrink-0 items-center justify-center"
                aria-label="Update in progress"
              >
                <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/40" />
                <span className="relative size-1.5 rounded-full bg-emerald-400" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Update in progress</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={menuBtnRef}
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={handleOpenMenu}
              className={cn(
                'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                menuOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <IconDots className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">More</TooltipContent>
        </Tooltip>
        <div className="ml-auto">
          <HeaderUserMenu />
        </div>
      </div>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[200] min-w-[180px] -translate-y-full rounded-lg border border-border bg-popover py-1 shadow-lg"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleSettingsClick}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <IconSettings className={cn('size-3.5', isMemorySpike && 'text-destructive')} aria-hidden />
              <span className={cn(isMemorySpike && 'font-medium text-destructive')}>
                {isMemorySpike ? 'Memory Spike' : 'Settings'}
              </span>
              {isMemorySpike && (
                <span className="ml-auto text-[10px] text-destructive">{spikeTotal}</span>
              )}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDebugClick}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <IconBug className="size-3.5" aria-hidden />
              Debug panel
            </button>
            {isUpdateAvailable && (
              <>
                <div className="my-1 border-t border-border/50" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleUpdateClick}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
                >
                  <IconDownload className="size-3.5" aria-hidden />
                  Install update
                </button>
              </>
            )}
            {appVersion && (
              <>
                <div className="my-1 border-t border-border/50" />
                <div className="px-3 py-1 text-[10px] tabular-nums text-muted-foreground/70">v{appVersion}</div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
})
