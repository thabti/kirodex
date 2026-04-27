import { useEffect, useMemo, useState, useCallback } from 'react'
import { IconRefresh, IconTrash, IconAlertTriangle, IconTerminal2 } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useDebugStore } from '@/stores/debugStore'
import { useJsDebugStore } from '@/stores/jsDebugStore'
import { measureMemory, formatBytes, type MemoryReport, type ThreadMemoryBreakdown } from '@/lib/thread-memory'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'
import { Switch } from '@/components/ui/switch'
import { SectionHeader, SettingsCard, SettingsGrid, SettingRow, Divider, ConfirmDialog } from './settings-shared'

const REFRESH_INTERVAL_MS = 2000

/** Threshold above which a single thread is flagged as hot. */
const HOT_THREAD_BYTES = 5 * 1024 * 1024
/** Threshold above which the whole renderer is flagged as hot. */
const HOT_TOTAL_BYTES = 100 * 1024 * 1024

/** Cell-byte estimate for one ghostty-web scrollback line. ~80 cols × 16 B/cell. */
const BYTES_PER_SCROLLBACK_LINE = 80 * 16

const DEFAULT_SCROLLBACK = 2000
const MIN_SCROLLBACK = 200
const MAX_SCROLLBACK = 20000
const DEFAULT_IDLE_MINS = 30

const StatusDot = ({ status }: { status: string }) => {
  const color =
    status === 'running' ? 'bg-emerald-500' :
    status === 'paused' ? 'bg-amber-500' :
    status === 'error' ? 'bg-destructive' :
    status === 'pending_permission' ? 'bg-sky-500' :
    'bg-muted-foreground/40'
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', color)} aria-hidden />
}

const Bar = ({ value, total }: { value: number; total: number }) => {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="h-1 w-24 overflow-hidden rounded-full bg-muted/50">
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          value >= HOT_THREAD_BYTES ? 'bg-amber-500' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

const ThreadRow = ({ thread, total }: { thread: ThreadMemoryBreakdown; total: number }) => {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen)

  const handleOpen = useCallback(() => {
    setSettingsOpen(false)
    setSelectedTask(thread.taskId)
  }, [setSelectedTask, setSettingsOpen, thread.taskId])

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
    >
      <StatusDot status={thread.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">{thread.name || 'Untitled thread'}</p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {thread.messageCount} msg
          {thread.toolCalls > 0 && ` · tools ${formatBytes(thread.toolCalls)}`}
          {thread.liveTurn > 0 && ` · live ${formatBytes(thread.liveTurn)}`}
          {thread.queued > 0 && ` · queued ${formatBytes(thread.queued)}`}
          {thread.isArchived && ' · archived'}
        </p>
      </div>
      <Bar value={thread.total} total={total} />
      <span className="w-16 shrink-0 text-right tabular-nums text-[11.5px] font-medium text-foreground/90">
        {formatBytes(thread.total)}
      </span>
    </button>
  )
}

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex flex-col gap-0.5">
    <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-mono text-[14px] font-semibold text-foreground tabular-nums">{value}</p>
    {hint && <p className="text-[10.5px] text-muted-foreground/70">{hint}</p>}
  </div>
)

interface CategoryBarProps {
  readonly label: string
  readonly bytes: number
  readonly total: number
  readonly accent: string
}

const CategoryBar = ({ label, bytes, total, accent }: CategoryBarProps) => {
  const pct = total > 0 ? (bytes / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-32 shrink-0">
        <p className="text-[11.5px] text-foreground">{label}</p>
      </div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div className={cn('h-full rounded-full transition-[width]', accent)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums text-[11.5px] text-muted-foreground">
        {formatBytes(bytes)}
      </span>
    </div>
  )
}

/** Snapshot the JS heap if the runtime exposes performance.memory. */
const readHeap = (): { used: number; total: number } | null => {
  // performance.memory is non-standard and only available in Chromium-based webviews.
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
  if (!perf.memory) return null
  return { used: perf.memory.usedJSHeapSize, total: perf.memory.totalJSHeapSize }
}

const clampScrollback = (n: number): number =>
  Math.max(MIN_SCROLLBACK, Math.min(MAX_SCROLLBACK, Math.floor(n)))

interface MemorySectionProps {
  readonly draft: AppSettings
  readonly updateDraft: (patch: Partial<AppSettings>) => void
}

export const MemorySection = ({ draft, updateDraft }: MemorySectionProps) => {
  const [report, setReport] = useState<MemoryReport | null>(null)
  const [heap, setHeap] = useState<{ used: number; total: number } | null>(null)
  const [ptyCount, setPtyCount] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isPurgeOpen, setIsPurgeOpen] = useState(false)

  const purgeAllSoftDeletes = useTaskStore((s) => s.purgeAllSoftDeletes)
  const clearDebugLog = useDebugStore((s) => s.clear)
  const clearJsDebugLog = useJsDebugStore((s) => s.clear)

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => setTick((n) => n + 1), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh])

  useEffect(() => {
    const next = measureMemory(
      useTaskStore.getState(),
      useDebugStore.getState(),
      useJsDebugStore.getState(),
    )
    setReport(next)
    setHeap(readHeap())
    let cancelled = false
    ipc.ptyCount()
      .then((n) => { if (!cancelled) setPtyCount(n) })
      .catch(() => { if (!cancelled) setPtyCount(null) })
    return () => { cancelled = true }
  }, [tick])

  const handleManualRefresh = useCallback(() => setTick((n) => n + 1), [])

  const handlePurgeSoft = useCallback(() => {
    purgeAllSoftDeletes()
    setTick((n) => n + 1)
  }, [purgeAllSoftDeletes])

  const handleClearDebug = useCallback(() => {
    clearDebugLog()
    clearJsDebugLog()
    setTick((n) => n + 1)
  }, [clearDebugLog, clearJsDebugLog])

  const top = useMemo(() => report?.threads.slice(0, 25) ?? [], [report])
  const remaining = (report?.threads.length ?? 0) - top.length

  const isHot = report ? report.grandTotal >= HOT_TOTAL_BYTES : false
  const debugLogTotal = report ? report.debugLog + report.jsDebugLog : 0

  const scrollback = clampScrollback(draft.terminalScrollback ?? DEFAULT_SCROLLBACK)
  const idleMins = draft.terminalAutoCloseIdleMins ?? null
  const idleEnabled = idleMins !== null
  const ptyScrollbackEstimate = ptyCount !== null
    ? ptyCount * scrollback * BYTES_PER_SCROLLBACK_LINE
    : 0

  return (
    <>
      <SectionHeader section="memory" />

      <SettingsGrid label="Overview" description="Live snapshot of renderer-side memory">
        <SettingsCard>
          <div className="flex items-start justify-between gap-4 py-1">
            <div className="grid grid-cols-3 gap-6 sm:grid-cols-4">
              <Stat
                label="Tracked total"
                value={report ? formatBytes(report.grandTotal) : '—'}
                hint="threads + drafts + buffers"
              />
              <Stat
                label="Live threads"
                value={report ? `${report.threads.length}` : '—'}
                hint={report ? `${formatBytes(report.threadsTotal)} held` : undefined}
              />
              <Stat
                label="Archived"
                value={report ? `${report.archivedMetaCount}` : '—'}
                hint={report
                  ? report.archivedMetaCount > 0
                    ? `${formatBytes(report.archivedMeta)} metadata only`
                    : 'none'
                  : undefined}
              />
              <Stat
                label="Soft-deleted"
                value={report ? `${report.softDeletedCount}` : '—'}
                hint={report ? `${formatBytes(report.softDeleted)} pending purge` : undefined}
              />
              <Stat
                label="Open PTYs"
                value={ptyCount === null ? '—' : `${ptyCount}`}
                hint={ptyCount !== null && ptyCount > 0
                  ? `~${formatBytes(ptyScrollbackEstimate)} scrollback budget`
                  : 'this window'}
              />
              {heap && (
                <Stat
                  label="JS heap"
                  value={formatBytes(heap.used)}
                  hint={`of ${formatBytes(heap.total)} allocated`}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="size-3 cursor-pointer accent-primary"
                />
                Auto-refresh
              </label>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Refresh memory report"
              >
                <IconRefresh className="size-3" />
                Refresh
              </button>
            </div>
          </div>
          {isHot && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Renderer is holding {report ? formatBytes(report.grandTotal) : ''} across threads, drafts and debug buffers.
                Consider purging soft-deleted threads or clearing debug log buffers below.
              </p>
            </div>
          )}
        </SettingsCard>
      </SettingsGrid>

      {report && report.grandTotal > 0 && (
        <SettingsGrid label="Breakdown" description="Where memory goes">
          <SettingsCard>
            <div className="py-1">
              <CategoryBar label="Messages" bytes={report.threads.reduce((s, t) => s + t.messages, 0)} total={report.grandTotal} accent="bg-primary" />
              <CategoryBar label="Tool calls" bytes={report.threads.reduce((s, t) => s + t.toolCalls, 0)} total={report.grandTotal} accent="bg-violet-500" />
              <CategoryBar label="Live turn" bytes={report.threads.reduce((s, t) => s + t.liveTurn, 0)} total={report.grandTotal} accent="bg-emerald-500" />
              <CategoryBar label="Queued" bytes={report.threads.reduce((s, t) => s + t.queued, 0)} total={report.grandTotal} accent="bg-sky-500" />
              <CategoryBar label="Soft-deleted" bytes={report.softDeleted} total={report.grandTotal} accent="bg-amber-500" />
              <CategoryBar label="Drafts" bytes={report.drafts} total={report.grandTotal} accent="bg-pink-500" />
              <CategoryBar label="Debug buffers" bytes={debugLogTotal} total={report.grandTotal} accent="bg-orange-500" />
            </div>
          </SettingsCard>
        </SettingsGrid>
      )}

      <SettingsGrid label="Per-thread" description="Click a row to open">
        <SettingsCard>
          {!report || report.threads.length === 0 ? (
            <p className="px-2 py-3 text-[11.5px] text-muted-foreground">No live threads.</p>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {top.map((t) => (
                <ThreadRow key={t.taskId} thread={t} total={report.threadsTotal || 1} />
              ))}
              {remaining > 0 && (
                <p className="px-2 pt-1 text-[10.5px] text-muted-foreground/70">
                  + {remaining} more thread{remaining === 1 ? '' : 's'} below 1% each
                </p>
              )}
            </div>
          )}
        </SettingsCard>
      </SettingsGrid>

      <SettingsGrid label="Terminal" description="Tune memory held by terminal tabs">
        <SettingsCard>
          <SettingRow
            label="Scrollback lines"
            description={
              ptyCount !== null && ptyCount > 0
                ? `${ptyCount} terminal${ptyCount === 1 ? '' : 's'} open · roughly ${formatBytes(ptyScrollbackEstimate)} held in scrollback at this setting.`
                : 'Lines retained per terminal. Lower values save memory; higher values keep more history.'
            }
          >
            <input
              type="number"
              min={MIN_SCROLLBACK}
              max={MAX_SCROLLBACK}
              step={500}
              value={scrollback}
              onChange={(e) => updateDraft({ terminalScrollback: clampScrollback(Number(e.target.value) || DEFAULT_SCROLLBACK) })}
              className="w-24 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              aria-label="Terminal scrollback lines"
            />
          </SettingRow>
          <Divider />
          <SettingRow
            label="Auto-close idle background tabs"
            description={
              idleEnabled
                ? `Closes background terminal tabs after ${idleMins} minute${idleMins === 1 ? '' : 's'} of no PTY activity. The active tab is never closed.`
                : 'When enabled, frees memory from terminal tabs you have stopped using. Running processes in those tabs are terminated.'
            }
          >
            <Switch
              checked={idleEnabled}
              onCheckedChange={(checked) =>
                updateDraft({ terminalAutoCloseIdleMins: checked ? DEFAULT_IDLE_MINS : null })
              }
              aria-label="Toggle idle terminal auto-close"
            />
          </SettingRow>
          {idleEnabled && (
            <>
              <Divider />
              <SettingRow
                label="Idle threshold"
                description="Minutes of no terminal output before a background tab is auto-closed."
              >
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={5}
                  value={idleMins ?? DEFAULT_IDLE_MINS}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(1440, Number(e.target.value) || DEFAULT_IDLE_MINS))
                    updateDraft({ terminalAutoCloseIdleMins: n })
                  }}
                  className="w-20 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                  aria-label="Idle threshold in minutes"
                />
              </SettingRow>
            </>
          )}
        </SettingsCard>
      </SettingsGrid>

      <SettingsGrid label="Reclaim" description="Free held memory">
        <SettingsCard>
          <SettingRow
            label="Purge soft-deleted threads"
            description={
              report && report.softDeletedCount > 0
                ? `${report.softDeletedCount} thread${report.softDeletedCount === 1 ? '' : 's'} (${formatBytes(report.softDeleted)}) waiting up to 48 hours.`
                : 'Soft-deleted threads stay in RAM for 48 hours before automatic removal.'
            }
          >
            <button
              type="button"
              disabled={!report || report.softDeletedCount === 0}
              onClick={() => setIsPurgeOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Purge all soft-deleted threads now"
            >
              <IconTrash className="size-3" />
              Purge now
            </button>
          </SettingRow>
          <Divider />
          <SettingRow
            label="Clear debug log buffers"
            description={
              report
                ? `${report.debugLogCount + report.jsDebugLogCount} captured entries (${formatBytes(debugLogTotal)}).`
                : 'Drops the in-memory ACP and JS console capture buffers.'
            }
          >
            <button
              type="button"
              disabled={!report || (report.debugLogCount === 0 && report.jsDebugLogCount === 0)}
              onClick={handleClearDebug}
              className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Clear debug log buffers"
            >
              <IconTrash className="size-3" />
              Clear
            </button>
          </SettingRow>
        </SettingsCard>
      </SettingsGrid>

      <p className="flex items-start gap-1.5 px-1 pt-1 text-[10.5px] leading-relaxed text-muted-foreground/70">
        <IconTerminal2 className="mt-0.5 size-3 shrink-0" aria-hidden />
        Scrollback estimates assume ~80 cols × 16 B per cell × the line cap. Real WASM heap usage varies.
      </p>

      <ConfirmDialog
        open={isPurgeOpen}
        onOpenChange={setIsPurgeOpen}
        title="Purge soft-deleted threads?"
        description="Permanently removes every soft-deleted thread immediately. Restoration from the Archives section will no longer be possible."
        confirmLabel="Purge now"
        onConfirm={handlePurgeSoft}
      />
    </>
  )
}
