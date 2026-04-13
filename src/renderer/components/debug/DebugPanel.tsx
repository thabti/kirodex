import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconTrash, IconX, IconChevronRight, IconChevronDown, IconGripHorizontal, IconCopy, IconCheck } from '@tabler/icons-react'
import { useDebugStore } from '@/stores/debugStore'
import { useTaskStore } from '@/stores/taskStore'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DebugLogEntry, DebugCategory } from '@/types'

// ── Category colors ──────────────────────────────────────────────

const categoryVariant: Record<string, 'destructive' | 'warning' | 'outline' | 'secondary' | 'info'> = {
  notification: 'outline',
  request: 'secondary',
  response: 'secondary',
  error: 'destructive',
  stderr: 'warning',
  lifecycle: 'info',
}

const CATEGORIES: Array<DebugCategory | 'all'> = ['all', 'notification', 'request', 'response', 'error', 'stderr', 'lifecycle']

// ── Time formatting ──────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().slice(11, 23) // HH:MM:SS.mmm
  } catch {
    return iso
  }
}

// ── Entry row ────────────────────────────────────────────────────

function entryToText(entry: DebugLogEntry): string {
  const payload = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload, null, 2)
  return `[${entry.timestamp}] ${entry.direction.toUpperCase()} ${entry.category} ${entry.type} — ${entry.summary}\n${payload}`
}

const DebugRow = memo(function DebugRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: DebugLogEntry
  expanded: boolean
  onToggle: () => void
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(entryToText(entry)).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [entry])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div
      className={cn(
        'group/row border-b border-border/30 transition-colors hover:bg-accent/5',
        entry.isError && 'bg-destructive/5 border-l-2 border-l-destructive',
      )}
    >
      <div className="flex w-full items-center gap-2 px-3 py-1 text-[11px]">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded
            ? <IconChevronDown className="size-3 shrink-0 text-muted-foreground/40" />
            : <IconChevronRight className="size-3 shrink-0 text-muted-foreground/40" />}

          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50 w-[78px]">
            {formatTime(entry.timestamp)}
          </span>

          <Badge
            variant={entry.direction === 'in' ? 'info' : 'success'}
            size="sm"
            className="shrink-0 h-4 min-w-[26px] px-1 text-[8px] font-bold uppercase"
          >
            {entry.direction === 'in' ? 'IN' : 'OUT'}
          </Badge>

          <Badge
            variant={categoryVariant[entry.category] ?? 'outline'}
            size="sm"
            className="shrink-0 h-4 px-1 text-[8px]"
          >
            {entry.category}
          </Badge>

          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/40 w-[56px] truncate">
            {entry.taskId ? entry.taskId.slice(0, 8) : 'global'}
          </span>

          <span className="shrink-0 font-mono text-[10px] text-primary/70 max-w-[160px] truncate">
            {entry.type}
          </span>

          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/60">
            {entry.summary}
          </span>
        </button>

        {/* Copy row */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy entry"
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover/row:text-muted-foreground/40 hover:!text-foreground"
            >
              {copied ? <IconCheck className="size-2.5" /> : <IconCopy className="size-2.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{copied ? 'Copied!' : 'Copy entry'}</TooltipContent>
        </Tooltip>
      </div>

      {expanded && (
        <div className="border-t border-border/20 bg-background/50 px-3 py-2">
          <pre className="max-h-64 overflow-auto rounded-md bg-card p-2 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
            {typeof entry.payload === 'string'
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
})

// ── Copy all button ─────────────────────────────────────────────

function CopyAllButton({ entries }: { entries: DebugLogEntry[] }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopyAll = useCallback(() => {
    const text = entries.map(entryToText).join('\n\n')
    void navigator.clipboard.writeText(text).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [entries])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopyAll}
          className="flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-colors"
        >
          {copied ? <IconCheck className="size-3 text-emerald-400" /> : <IconCopy className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{copied ? 'Copied!' : 'Copy all entries'}</TooltipContent>
    </Tooltip>
  )
}

// ── Main panel ───────────────────────────────────────────────────

export const DebugPanel = memo(function DebugPanel() {
  const entries = useDebugStore((s) => s.entries)
  const filter = useDebugStore((s) => s.filter)
  const setFilter = useDebugStore((s) => s.setFilter)
  const clear = useDebugStore((s) => s.clear)
  const setOpen = useDebugStore((s) => s.setOpen)
  const tasks = useTaskStore((s) => s.tasks)

  const [height, setHeight] = useState(320)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef(320)

  // Derive unique thread names and project names from entries
  const { threadNames, projectNames } = useMemo(() => {
    const threads = new Set<string>()
    const projects = new Set<string>()
    for (const e of entries) {
      if (!e.taskId) continue
      const task = tasks[e.taskId]
      if (!task) continue
      if (task.name) threads.add(task.name)
      if (task.workspace) projects.add(task.workspace)
    }
    return {
      threadNames: [...threads].sort(),
      projectNames: [...projects].sort(),
    }
  }, [entries, tasks])

  // Filter entries
  const filtered = useMemo(() => {
    const lowerSearch = filter.search.toLowerCase()
    return entries.filter((e) => {
      if (filter.category !== 'all' && e.category !== filter.category) return false
      if (filter.errorsOnly && !e.isError) return false
      if (filter.threadName) {
        const task = e.taskId ? tasks[e.taskId] : null
        if (!task || task.name !== filter.threadName) return false
      }
      if (filter.projectName) {
        const task = e.taskId ? tasks[e.taskId] : null
        if (!task || task.workspace !== filter.projectName) return false
      }
      if (lowerSearch) {
        const haystack = `${e.type} ${e.summary} ${e.taskId ?? ''}`.toLowerCase()
        if (!haystack.includes(lowerSearch)) {
          try {
            const payloadStr = typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)
            if (!payloadStr.toLowerCase().includes(lowerSearch)) return false
          } catch {
            return false
          }
        }
      }
      return true
    })
  }, [entries, filter, tasks])

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => expandedIds.has(filtered[i]?.id ?? -1) ? 200 : 28,
    overscan: 10,
  })

  // Auto-scroll
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      isNearBottomRef.current = dist < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (isNearBottomRef.current && parentRef.current) {
      requestAnimationFrame(() => {
        if (parentRef.current) parentRef.current.scrollTop = parentRef.current.scrollHeight
      })
    }
  }, [filtered.length])

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Resize drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
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
        onMouseDown={onDragStart}
        className="flex h-2 cursor-row-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors"
      >
        <IconGripHorizontal className="size-3 text-muted-foreground/30" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1">
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          placeholder="Filter..."
          className="h-5 w-32 rounded border border-border/50 bg-background px-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring/50"
        />

        <select
          value={filter.category}
          onChange={(e) => setFilter({ category: e.target.value as DebugCategory | 'all' })}
          className="h-5 rounded border border-border/50 bg-background px-1 text-[10px] text-foreground outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All types' : c}</option>
          ))}
        </select>

        {threadNames.length > 0 && (
          <select
            value={filter.threadName}
            onChange={(e) => setFilter({ threadName: e.target.value })}
            className="h-5 max-w-[120px] rounded border border-border/50 bg-background px-1 text-[10px] text-foreground outline-none truncate"
            aria-label="Filter by thread"
          >
            <option value="">All threads</option>
            {threadNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}

        {projectNames.length > 0 && (
          <select
            value={filter.projectName}
            onChange={(e) => setFilter({ projectName: e.target.value })}
            className="h-5 max-w-[120px] rounded border border-border/50 bg-background px-1 text-[10px] text-foreground outline-none truncate"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projectNames.map((p) => (
              <option key={p} value={p}>{p.split('/').pop()}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1 text-[10px] text-muted-foreground/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filter.errorsOnly}
            onChange={(e) => setFilter({ errorsOnly: e.target.checked })}
            className="size-3 rounded"
          />
          Errors
        </label>

        <span className="ml-auto text-[9px] tabular-nums text-muted-foreground/40">
          {filtered.length}/{entries.length}
        </span>

        <CopyAllButton entries={filtered} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={clear}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-colors"
            >
              <IconTrash className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear log</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-colors"
            >
              <IconX className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </div>

      {/* Virtualized log */}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/40">
            {entries.length === 0 ? 'No debug entries yet' : 'No matches'}
          </div>
        ) : (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const entry = filtered[vRow.index]
              if (!entry) return null
              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${vRow.start}px)` }}
                >
                  <DebugRow
                    entry={entry}
                    expanded={expandedIds.has(entry.id)}
                    onToggle={() => toggleExpanded(entry.id)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
})
