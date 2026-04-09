import { memo, useState, useRef, useCallback } from 'react'
import { Settings, FlaskConical, Bug } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { KiroConfigPanel } from './KiroConfigPanel'

const KiroConfigFooter = memo(function KiroConfigFooter() {
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(160)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(160)

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY.current - ev.clientY
      setHeight(Math.max(80, Math.min(400, startH.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  return (
    <div className="flex min-h-0 flex-col border-b border-border">
      <div className="flex items-center border-t border-border">
        <div onMouseDown={onDragStart} className="flex-1 h-1.5 cursor-row-resize hover:bg-accent/40 transition-colors" />
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
  const setView = useTaskStore((s) => s.setView)
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen)

  return (
    <>
      <KiroConfigFooter />
      <div className="flex shrink-0 flex-col gap-1 px-2 pb-4 pt-1.5">
        <button type="button" onClick={() => setView('playground')}
          className="flex w-full h-6 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FlaskConical className="size-3.5" aria-hidden />
          <span className="text-xs">Playground</span>
        </button>
        <button type="button" onClick={() => useDebugStore.getState().toggleOpen()}
          className="flex w-full h-6 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Bug className="size-3.5" aria-hidden />
          <span className="text-xs">Debug</span>
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)}
          className="flex w-full h-6 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Settings className="size-3.5" aria-hidden />
          <span className="text-xs">Settings</span>
        </button>
      </div>
    </>
  )
})
