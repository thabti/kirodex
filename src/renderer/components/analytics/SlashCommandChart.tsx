import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AnalyticsEvent } from '@/types/analytics'
import { computeSlashCommandUsage } from '@/lib/analytics-aggregators'
import { ChartCard, EmptyChart } from './ChartCard'

export const SlashCommandChart = ({ events }: { events: AnalyticsEvent[] }) => {
  const { byMode } = useMemo(() => computeSlashCommandUsage(events), [events])

  const sorted = useMemo(() => {
    return Object.entries(byMode)
      .map(([name, counts]) => ({
        name,
        command: counts.command,
        plan: counts.plan,
        total: counts.command + counts.plan,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [byMode])

  if (sorted.length === 0) {
    return (
      <ChartCard title="Slash commands by mode">
        <EmptyChart message="No slash command data yet" />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Slash commands by mode">
      <ResponsiveContainer width="100%" height={Math.max(100, sorted.length * 28 + 40)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            iconSize={8}
          />
          <Bar dataKey="command" name="Command" stackId="mode" fill="#f97316" radius={[0, 0, 0, 0]} />
          <Bar dataKey="plan" name="Plan" stackId="mode" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
