import { memo, useEffect, useMemo, lazy, Suspense } from 'react'
import { IconArrowLeft, IconChartBar } from '@tabler/icons-react'
import { useAnalyticsStore, type TimeRange } from '@/stores/analyticsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { partitionEvents } from '@/lib/analytics-aggregators'

const CodingHoursChart = lazy(() => import('./CodingHoursChart').then((m) => ({ default: m.CodingHoursChart })))
const MessagesChart = lazy(() => import('./MessagesChart').then((m) => ({ default: m.MessagesChart })))
const TokensChart = lazy(() => import('./TokensChart').then((m) => ({ default: m.TokensChart })))
const DiffStatsChart = lazy(() => import('./DiffStatsChart').then((m) => ({ default: m.DiffStatsChart })))
const ModelPopularityChart = lazy(() => import('./ModelPopularityChart').then((m) => ({ default: m.ModelPopularityChart })))
const ModeUsageChart = lazy(() => import('./ModeUsageChart').then((m) => ({ default: m.ModeUsageChart })))
const SlashCommandChart = lazy(() => import('./SlashCommandChart').then((m) => ({ default: m.SlashCommandChart })))
const ToolCallChart = lazy(() => import('./ToolCallChart').then((m) => ({ default: m.ToolCallChart })))
const ProjectStatsChart = lazy(() => import('./ProjectStatsChart').then((m) => ({ default: m.ProjectStatsChart })))

const RANGES: { label: string; value: TimeRange }[] = [
  { label: 'All Time', value: 'all' },
  { label: '30 Days', value: '30d' },
  { label: '7 Days', value: '7d' },
]

const ChartFallback = () => (
  <div className="flex h-[200px] items-center justify-center rounded-xl border border-border/40 bg-card">
    <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
  </div>
)

export const AnalyticsDashboard = memo(function AnalyticsDashboard() {
  const events = useAnalyticsStore((s) => s.events)
  const isLoaded = useAnalyticsStore((s) => s.isLoaded)
  const timeRange = useAnalyticsStore((s) => s.timeRange)
  const setTimeRange = useAnalyticsStore((s) => s.setTimeRange)
  const loadEvents = useAnalyticsStore((s) => s.loadEvents)
  const setView = useTaskStore((s) => s.setView)

  useEffect(() => { loadEvents() }, [loadEvents])

  // Single-pass partition — O(n) instead of O(n * 13)
  const p = useMemo(() => partitionEvents(events), [events])

  const handleBack = () => setView('chat')
  const isEmpty = isLoaded && events.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Back to chat"
        >
          <IconArrowLeft size={16} stroke={1.5} />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <IconChartBar size={18} stroke={1.5} className="text-primary" />
          <h1 className="text-[15px] font-semibold">Analytics</h1>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setTimeRange(r.value)}
              className={cn(
                'rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                timeRange === r.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-5">
          {!isLoaded ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading analytics...</div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <IconChartBar size={40} stroke={1} className="mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No analytics data yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Start using Kirodex and your usage stats will appear here</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Suspense fallback={<ChartFallback />}>
                <CodingHoursChart events={p.session} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <MessagesChart sent={p.message_sent} received={p.message_received} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <TokensChart events={p.token_usage} modelEvents={p.model_used} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <DiffStatsChart diffEvents={p.diff_stats} fileEvents={p.file_edited} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <ModelPopularityChart events={p.model_used} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <ModeUsageChart events={p.mode_switch} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <SlashCommandChart events={p.slash_cmd} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <ToolCallChart events={p.tool_call} />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <ProjectStatsChart threadEvents={p.thread_created} messageEvents={[...p.message_sent, ...p.message_received]} />
              </Suspense>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
})
