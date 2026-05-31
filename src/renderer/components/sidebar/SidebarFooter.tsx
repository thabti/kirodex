import { memo, useState, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { KiroConfigPanel } from './KiroConfigPanel'

export const SidebarFooter = memo(function SidebarFooter() {
  const [collapsed, setCollapsed] = useState(true)
  const [height, setHeight] = useState(160)

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  const handleDragStart = useResizeHandle({
    axis: 'vertical', size: height, onResize: setHeight, min: 80, max: 400, reverse: true,
  })

  return (
    <div className="flex min-h-0 flex-col border-b border-border/40">
      <div className="flex items-center">
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
