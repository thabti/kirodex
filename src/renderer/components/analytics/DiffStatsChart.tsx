import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AnalyticsEvent } from '@/types/analytics'
import { computeDiffStatsByDay, computeTotalDiffAdditions, computeTotalDiffDeletions, computeTotalFilesEdited } from '@/lib/analytics-aggregators'
import { ChartCard, StatRow, EmptyChart } from './ChartCard'

export const DiffStatsChart = ({ diffEvents, fileEvents }: { diffEvents: AnalyticsEvent[]; fileEvents: AnalyticsEvent[] }) => {
  const data = useMemo(() => computeDiffStatsByDay(diffEvents), [diffEvents])
  const additions = useMemo(() => computeTotalDiffAdditions(diffEvents), [diffEvents])
  const deletions = useMemo(() => computeTotalDiffDeletions(diffEvents), [diffEvents])
  const filesEdited = useMemo(() => computeTotalFilesEdited(fileEvents), [fileEvents])

  return (
    <ChartCard title="Code changes">
      <div className="mb-2 grid grid-cols-3 gap-2">
        <StatRow label="Additions" value={`+${additions}`} color="text-emerald-600 dark:text-emerald-500" />
        <StatRow label="Deletions" value={`-${deletions}`} color="text-red-600 dark:text-red-400" />
        <StatRow label="Files edited" value={filesEdited} />
      </div>
      {data.length === 0 ? (
        <EmptyChart message="No diff data yet" />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, background: 'var(--color-card)', border: '1px solid var(--color-border)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="value" name="Additions" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="value2" name="Deletions" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}
