import { memo, useState, useCallback, useEffect } from 'react'
import { IconSettings, IconBug, IconDownload } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useJsDebugStore } from '@/stores/jsDebugStore'
import { useUpdateStore, type UpdateStatus } from '@/stores/updateStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { useModifierKeys } from '@/hooks/useModifierKeys'
import { measureMemory, formatBytes } from '@/lib/thread-memory'
import { KiroConfigPanel } from './KiroConfigPanel'
import { HeaderUserMenu } from '@/components/header-user-menu'

const MEMORY_SPIKE_THRESHOLD = 100 * 1024 * 1024
const MEMORY_CHECK_INTERVAL_MS = 5000

const hasUpdateIndicator = (status: UpdateStatus): boolean =>
  status === 'available' || status === 'downloading' || status === 'ready'

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
  const isMetaHeld = useModifierKeys()
  const [isMemorySpike, setIsMemorySpike] = useState(false)
  const [spikeTotal, setSpikeTotal] = useState('')

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

  const handleSettingsClick = useCallback(() => {
    setSettingsOpen(true, isMemorySpike ? 'memory' : undefined)
  }, [setSettingsOpen, isMemorySpike])

  const handleUpdateClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    triggerDownload?.()
  }, [triggerDownload])

  return (
    <>
      <KiroConfigFooter />
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleSettingsClick}
              className="flex flex-1 h-8 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="relative">
                <IconSettings className={isMemorySpike ? 'size-4 text-destructive' : 'size-4'} aria-hidden />
                {isMemorySpike && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-2.5 items-center justify-center" aria-label="Memory spike">
                    <span className="absolute size-full animate-ping rounded-full bg-destructive/40" />
                    <span className="relative size-1.5 rounded-full bg-destructive" />
                  </span>
                )}
                {!isMemorySpike && isIndicatorVisible && (
                  <span
                    data-testid="update-indicator-dot"
                    className="absolute -right-0.5 -top-0.5 flex size-2.5 items-center justify-center"
                    aria-label="Update available"
                  >
                    <span className="absolute size-full animate-ping rounded-full bg-emerald-400/40" />
                    <span className="relative size-1.5 rounded-full bg-emerald-400" />
                  </span>
                )}
              </span>
              <span className={isMemorySpike ? 'text-[13px] font-medium text-destructive' : 'text-[13px]'}>
                {isMemorySpike ? 'Memory Spike' : 'Settings'}
              </span>
              {isMetaHeld && !isUpdateAvailable && (
                <kbd className="pointer-events-none ml-auto shrink-0 rounded-sm bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground select-none">⌘,</kbd>
              )}
              {isUpdateAvailable && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Download and install update"
                  onClick={handleUpdateClick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); triggerDownload?.() } }}
                  className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium leading-none text-primary-foreground hover:bg-primary/80 transition-colors"
                >
                  <IconDownload size={12} />
                  Update
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isMemorySpike
              ? `Memory spike: ${spikeTotal} held — purge old threads or clear debug buffers to free memory`
              : isUpdateAvailable
                ? 'Update available — click badge to install'
                : 'Open settings'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => useDebugStore.getState().toggleOpen()}
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Toggle debug panel">
              <IconBug className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Toggle debug panel</TooltipContent>
        </Tooltip>
        <div className="ml-auto">
          <HeaderUserMenu />
        </div>
      </div>
    </>
  )
})
