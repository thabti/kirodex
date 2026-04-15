import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconTrash, IconChevronRight, IconChevronDown, IconCopy, IconCheck } from '@tabler/icons-react'
import { useJsDebugStore } from '@/stores/jsDebugStore'
import { useTaskStore } from '@/stores/taskStore'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { JsDebugEntry, JsDebugCategory } from '@/types'

// ── Category styling ─────────────────────────────────────────────

const CATEGORY_VARIANT: Record<JsDebugCategory, 'outline' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
  log: 'outline',
  warn: 'warning',
  error: 'destructive',
  exception: 'destructive',
  network: 'info',
  rust: 'secondary',
}

const JS_CATEGORIES: Array<JsDebugCategory | 'all'> = ['all', 'log', 'warn', 'error', 'exception', 'network', 'rust']

// ── Helpers ──────────────────────────────────────────────────────

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toISOString().slice(11, 23)
  } catch {
    return iso
  }
}

const entryToText = (entry: JsDebugEntry): string =>
  `[${entry.timestamp}] ${entry.category.toUpperCase()} ${entry.message}\n${entry.detail}`

const formatStatus = (status: number | undefined): string => {
  if (status === undefined) return ''
  return String(status)
}

// ── Entry row ────────────────────────────────────────────────────

const JsDebugRow = memo(function JsDebugRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: JsDebugEntry
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

  const isNetwork = entry.category === 'network'

  return (
    <div
      className={cn(
        'group/row border-b border-border/60 transition-colors hover:bg-accent/5',
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
            ? <IconChevronDown className="size-3 shrink-0 text-muted-foreground/70" />
            : <IconChevronRight className="size-3 shrink-0 text-muted-foreground/70" />}

          <span className="shrink-0 font-mono text-[10px] text-muted-foreground w-[78px]">
            {formatTime(entry.timestamp)}
          </span>

          <Badge
            variant={CATEGORY_VARIANT[entry.category]}
            size="sm"
            className="shrink-0 h-4 px-1 text-[8px] uppercase"
          >
            {entry.category}
          </Badge>

          {isNetwork && entry.method && (
            <Badge
              variant="secondary"
              size="sm"
              className="shrink-0 h-4 px-1 text-[8px] font-bold"
            >
              {entry.method}
            </Badge>
          )}

          {isNetwork && entry.status !== undefined && (
            <span className={cn(
              'shrink-0 font-mono text-[10px] font-bold',
              entry.status >= 400 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
            )}>
              {formatStatus(entry.status)}
            </span>
          )}

          {isNetwork && entry.duration !== undefined && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {entry.duration}ms
            </span>
          )}

          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {entry.message}
          </span>
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy entry"
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover/row:text-muted-foreground/70 hover:!text-foreground"
            >
              {copied ? <IconCheck className="size-2.5" /> : <IconCopy className="size-2.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{copied ? 'Copied!' : 'Copy entry'}</TooltipContent>
        </Tooltip>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-background/50 px-3 py-2">
          <pre className="max-h-64 overflow-auto rounded-md bg-card p-2 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
            {entry.detail}
          </pre>
        </div>
      )}
    </div>
  )
})

// ── Copy all button ─────────────────────────────────────────────

const CopyAllButton = memo(function CopyAllButton({ entries }: { entries: JsDebugEntry[] }) {
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
          className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
        >
          {copied ? <IconCheck className="size-3 text-emerald-600 dark:text-emerald-400" /> : <IconCopy className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{copied ? 'Copied!' : 'Copy all entries'}</TooltipContent>
    </Tooltip>
  )
})

// ── Main tab ─────────────────────────────────────────────────────

export const JsDebugTab = memo(function JsDebugTab() {
  const entries = useJsDebugStore((s) => s.entries)
  const filter = useJsDebugStore((s) => s.filter)
  const setFilter = useJsDebugStore((s) => s.setFilter)
  const clear = useJsDebugStore((s) => s.clear)
  const tasks = useTaskStore((s) => s.tasks)

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

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
        const haystack = `${e.message} ${e.detail} ${e.url ?? ''}`.toLowerCase()
        if (!haystack.includes(lowerSearch)) return false
      }
      return true
    })
  }, [entries, filter, tasks])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => expandedIds.has(filtered[i]?.id ?? -1) ? 200 : 28,
    overscan: 10,
  })

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1">
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          placeholder="Filter..."
          className="h-5 w-32 rounded border border-border/50 bg-background px-1.5 text-[10px] text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/50"
        />

        <select
          value={filter.category}
          onChange={(e) => setFilter({ category: e.target.value as JsDebugCategory | 'all' })}
          className="h-5 rounded border border-border/50 bg-background px-1 text-[10px] text-foreground outline-none"
        >
          {JS_CATEGORIES.map((c) => (
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

        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filter.errorsOnly}
            onChange={(e) => setFilter({ errorsOnly: e.target.checked })}
            className="size-3 rounded"
          />
          Errors
        </label>

        <span className="ml-auto text-[9px] tabular-nums text-muted-foreground">
          {filtered.length}/{entries.length}
        </span>

        <CopyAllButton entries={filtered} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={clear}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
            >
              <IconTrash className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear log</TooltipContent>
        </Tooltip>
      </div>

      {/* Virtualized log */}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            {entries.length === 0 ? 'No JS debug entries yet' : 'No matches'}
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
                  <JsDebugRow
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
    </div>
  )
})
