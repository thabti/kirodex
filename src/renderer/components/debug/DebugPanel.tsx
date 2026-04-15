import { memo, useCallback, useRef, useState } from 'react'
import { IconX, IconGripHorizontal } from '@tabler/icons-react'
import { useDebugStore } from '@/stores/debugStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { KiroDebugTab } from './KiroDebugTab'
import { JsDebugTab } from './JsDebugTab'

type DebugTab = 'kiro' | 'js'

const TAB_LABELS: Record<DebugTab, string> = {
  kiro: 'Kiro Debug',
  js: 'JS Debug',
} as const

const TABS: DebugTab[] = ['kiro', 'js']

export const DebugPanel = memo(function DebugPanel() {
  const setOpen = useDebugStore((s) => s.setOpen)
  const [activeTab, setActiveTab] = useState<DebugTab>('kiro')
  const [height, setHeight] = useState(320)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef(320)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartY.current = e.clientY
    dragStartH.current = height
    const onMove = (ev: MouseEvent) => {
      if (dragStartY.current === null) return
      const delta = dragStartY.current - ev.clientY
      setHeight(Math.max(150, Math.min(600, dragStartH.current + delta)))
    }
    const onUp = () => {
      dragStartY.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  return (
    <aside
      className="flex shrink-0 flex-col border-t border-border bg-card"
      style={{ height }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="flex h-2 cursor-row-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors"
      >
        <IconGripHorizontal className="size-3 text-muted-foreground" />
      </div>

      {/* Tab bar + close */}
      <div className="flex items-center border-b border-border/50 px-3">
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Debug panel tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-2.5 py-1.5 text-[11px] font-medium transition-colors rounded-t-sm',
                activeTab === tab
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
              >
                <IconX className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'kiro' ? <KiroDebugTab /> : <JsDebugTab />}
    </aside>
  )
})
