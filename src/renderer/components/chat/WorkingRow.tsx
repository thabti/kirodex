import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { usePanelResolvedTaskId } from './PanelContext'
import type { WorkingRow as WorkingRowData } from '@/lib/timeline'
import { ipc } from '@/lib/ipc'
import { AgentHandoffLoader } from './AgentHandoffLoader'

const LOADING_WORDS = [
  'Thinking',
  'Reasoning',
  'Analyzing',
  'Planning',
  'Processing',
  'Reflecting',
  'Considering',
  'Evaluating',
  'Synthesizing',
  'Crafting',
]

/** How long (ms) before we show the "Looks stuck?" warning affordance */
const STUCK_WARN_MS = 5 * 60 * 1000  // 5 minutes

/** Format elapsed seconds into a human-readable label */
function formatElapsed(startMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const min = Math.floor(diffSec / 60)
  const sec = diffSec % 60
  return sec > 0 ? `${min}m ${String(sec).padStart(2, '0')}s` : `${min}m`
}

export const WorkingRow = memo(function WorkingRow({ row }: { row: WorkingRowData }) {
  const resolvedTaskId = usePanelResolvedTaskId()
  const globalModeId = useSettingsStore((s) => s.currentModeId)
  const taskModeId = useTaskStore((s) => resolvedTaskId ? s.taskModes[resolvedTaskId] ?? null : null)
  const isPlan = (taskModeId ?? globalModeId) === 'kiro_planner'
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * LOADING_WORDS.length),
  )
  const [visible, setVisible] = useState(true)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Capture the time this row first mounted to compute elapsed and detect stuck state
  const startMsRef = useRef(row.startedAt ?? Date.now())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isStuck, setIsStuck] = useState(false)

  // Tick every second for the elapsed display and stuck detection
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      if (!isStuck && now - startMsRef.current >= STUCK_WARN_MS) {
        setIsStuck(true)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [isStuck])

  useEffect(() => {
    if (row.hasStreamingContent) return
    const cycle = () => {
      setVisible(false)
      fadeRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % LOADING_WORDS.length)
        setVisible(true)
      }, 300)
    }
    const t = setInterval(cycle, 2200)
    return () => {
      clearInterval(t)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [row.hasStreamingContent])

  const handleCancel = useCallback(() => {
    if (resolvedTaskId) {
      ipc.cancelTask(resolvedTaskId).catch(() => {})
    }
  }, [resolvedTaskId])

  // ── Stuck state: show a warning affordance instead of the normal spinner ──
  if (isStuck) {
    return (
      <div className="py-2 select-none" data-timeline-row-kind="working">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-[3px]">
            <span className="h-1 w-1 rounded-full bg-amber-500/60" />
            <span className="h-1 w-1 rounded-full bg-amber-500/60 [animation-delay:200ms]" />
            <span className="h-1 w-1 rounded-full bg-amber-500/60 [animation-delay:400ms]" />
          </span>
          <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-amber-600 dark:text-amber-400">
            Looks stuck&hellip;
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground/30" aria-hidden="true">·</span>
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/50">
            {formatElapsed(startMsRef.current, nowMs)}
          </span>
          {resolvedTaskId && (
            <button
              type="button"
              onClick={handleCancel}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/40 hover:bg-amber-500/10 dark:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Cancel stuck task"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Streaming dot: subtle indicator when text is already visible ──
  if (row.hasStreamingContent) {
    return (
      <div className="py-0.5 select-none" data-timeline-row-kind="working">
        <AgentHandoffLoader
          compact
          label={isPlan ? 'Kiro is refining the plan…' : 'Kiro is responding…'}
          detail={formatElapsed(startMsRef.current, nowMs)}
          announcement="Kiro is working"
          className="justify-start"
        />
      </div>
    )
  }

  // ── Normal cycling spinner ──
  return (
    <div className="py-0.5 select-none" data-timeline-row-kind="working">
      <AgentHandoffLoader
        compact
        label={`${isPlan ? 'Planning' : LOADING_WORDS[idx]}…`}
        detail={formatElapsed(startMsRef.current, nowMs)}
        announcement="Kiro is working"
        className="justify-start"
        isLabelVisible={visible}
        reserveLabelWidth
      />
    </div>
  )
})
