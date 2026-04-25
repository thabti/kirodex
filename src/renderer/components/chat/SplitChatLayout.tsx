import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { ChatPanel } from './ChatPanel'
import { SplitPanelHeader } from './SplitPanelHeader'
import { SplitDivider } from './SplitDivider'

const MIN_PANEL_PX = 400

export const SplitChatLayout = memo(function SplitChatLayout() {
  const activeSplit = useTaskStore((s) => {
    if (!s.activeSplitId) return null
    return s.splitViews.find((sv) => sv.id === s.activeSplitId) ?? null
  })
  const focusedPanel = useTaskStore((s) => s.focusedPanel)
  const setSplitRatio = useTaskStore((s) => s.setSplitRatio)
  const setFocusedPanel = useTaskStore((s) => s.setFocusedPanel)
  const closeSplit = useTaskStore((s) => s.closeSplit)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setContainerWidth(width)
      if (width > 0 && width < MIN_PANEL_PX * 2) closeSplit()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [closeSplit])

  const handleReset = useCallback(() => setSplitRatio(0.5), [setSplitRatio])
  const handleFocusLeft = useCallback(() => {
    const state = useTaskStore.getState()
    if (state.focusedPanel !== 'left') {
      setFocusedPanel('left')
      const sv = state.splitViews.find((v) => v.id === state.activeSplitId)
      if (sv && state.selectedTaskId !== sv.left) {
        useTaskStore.setState({ selectedTaskId: sv.left })
      }
    }
  }, [setFocusedPanel])
  const handleFocusRight = useCallback(() => {
    const state = useTaskStore.getState()
    if (state.focusedPanel !== 'right') {
      setFocusedPanel('right')
      const sv = state.splitViews.find((v) => v.id === state.activeSplitId)
      if (sv && state.selectedTaskId !== sv.right) {
        useTaskStore.setState({ selectedTaskId: sv.right })
      }
    }
  }, [setFocusedPanel])

  if (!activeSplit) return null

  const { left, right, ratio } = activeSplit
  const leftWidth = `${ratio * 100}%`
  const rightWidth = `${(1 - ratio) * 100}%`

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={{ flexBasis: leftWidth, maxWidth: leftWidth }}
        onMouseDown={handleFocusLeft}
        role="region"
        aria-label="Left chat panel"
      >
        <SplitPanelHeader taskId={left} isFocused={focusedPanel === 'left'} side="left" onClose={closeSplit} onFocus={handleFocusLeft} />
        <ChatPanel taskId={left} />
      </div>

      <SplitDivider containerWidth={containerWidth} ratio={ratio} onRatioChange={setSplitRatio} onReset={handleReset} />

      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={{ flexBasis: rightWidth, maxWidth: rightWidth }}
        onMouseDown={handleFocusRight}
        role="region"
        aria-label="Right chat panel"
      >
        <SplitPanelHeader taskId={right} isFocused={focusedPanel === 'right'} side="right" onClose={closeSplit} onFocus={handleFocusRight} />
        <ChatPanel taskId={right} />
      </div>
    </div>
  )
})
