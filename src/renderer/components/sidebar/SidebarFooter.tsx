import { memo, useState, useCallback } from 'react'
import { IconSettings, IconBug } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useUpdateStore, type UpdateStatus } from '@/stores/updateStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { KiroConfigPanel } from './KiroConfigPanel'

const hasUpdateIndicator = (status: UpdateStatus): boolean =>
  status === 'available' || status === 'downloading' || status === 'ready'

const KiroConfigFooter = memo(function KiroConfigFooter() {
  const [collapsed, setCollapsed] = useState(false)
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

  const handleUpdateClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    triggerDownload?.()
  }, [triggerDownload])

  return (
    <>
      <KiroConfigFooter />
      <div className="flex shrink-0 flex-col gap-1 px-2 pb-4 pt-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => useDebugStore.getState().toggleOpen()}
              className="flex w-full h-8 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <IconBug className="size-4" aria-hidden />
              <span className="text-[13px]">Debug</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Toggle debug panel</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => setSettingsOpen(true)}
              className="flex w-full h-8 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="relative">
                <IconSettings className="size-4" aria-hidden />
                {isIndicatorVisible && (
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
              <span className="text-[13px]">Settings</span>
              {isUpdateAvailable && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Download and install update"
                  onClick={handleUpdateClick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); triggerDownload?.() } }}
                  className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary-foreground hover:bg-primary/80 transition-colors"
                >
                  Update Now
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{isUpdateAvailable ? 'Update available — click badge to install' : 'Open settings'}</TooltipContent>
        </Tooltip>
      </div>
    </>
  )
})
