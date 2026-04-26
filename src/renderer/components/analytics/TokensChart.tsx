import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { AnalyticsEvent } from '@/types/analytics'
import { computeTokensByDay, computeTotalTokens, computeEstimatedCost } from '@/lib/analytics-aggregators'
import { ChartCard, StatRow, EmptyChart } from './ChartCard'

const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const fmtCost = (n: number): string => {
  if (n < 0.01) return '<$0.01'
  if (n < 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(2)}`
}

interface TokensChartProps {
  readonly events: AnalyticsEvent[]
  readonly modelEvents?: AnalyticsEvent[]
}

export const TokensChart = ({ events, modelEvents = [] }: TokensChartProps) => {
  const data = useMemo(() => computeTokensByDay(events), [events])
  const total = useMemo(() => computeTotalTokens(events), [events])
  const estimatedCost = useMemo(
    () => computeEstimatedCost(events, modelEvents),
    [events, modelEvents],
  )

  return (
    <ChartCard title="Token usage">
      <div className="flex flex-col gap-1 mb-2">
        <StatRow label="Total tokens" value={fmtTokens(total)} />
        {estimatedCost > 0 && (
          <StatRow label="Est. cost" value={`~${fmtCost(estimatedCost)}`} color="text-amber-400" />
        )}
      </div>
      {data.length === 0 ? (
        <EmptyChart message="No token data yet" />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTokens} />
            <Tooltip contentStyle={{ fontSize: 11, background: 'var(--color-card)', border: '1px solid var(--color-border)' }} formatter={(v: number) => fmtTokens(v)} />
            <Bar dataKey="value" name="Tokens" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      {estimatedCost > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground/50">
          Cost estimate based on most-used model pricing. Assumes ~75% input, ~25% output tokens.
        </p>
      )}
    </ChartCard>
  )
}
