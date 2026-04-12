import { memo, useMemo } from 'react'
import { IconCheck, IconAlertTriangle, IconBan, IconFile, IconPlus, IconMinus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface KirodexReport {
  status: 'done' | 'partial' | 'blocked'
  summary: string
  filesChanged?: string[]
  linesAdded?: number
  linesRemoved?: number
}

const REPORT_REGEX = /```kirodex-report\s*\n([\s\S]*?)\n```/

/** Extract a kirodex-report JSON block from message text. Returns null if absent or invalid. */
export const parseReport = (text: string): KirodexReport | null => {
  const match = REPORT_REGEX.exec(text)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as KirodexReport
    if (!parsed.status || !parsed.summary) return null
    return parsed
  } catch {
    return null
  }
}

/** Strip the kirodex-report fence from message text so ChatMarkdown doesn't render it. */
export const stripReport = (text: string): string =>
  text.replace(REPORT_REGEX, '').trimEnd()

const STATUS_CONFIG = {
  done: { icon: IconCheck, label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  partial: { icon: IconAlertTriangle, label: 'Partial', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  blocked: { icon: IconBan, label: 'Blocked', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
} as const

export const TaskCompletionCard = memo(function TaskCompletionCard({ report }: { report: KirodexReport }) {
  const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.done
  const Icon = cfg.icon
  const hasStats = (report.linesAdded ?? 0) > 0 || (report.linesRemoved ?? 0) > 0
  const files = useMemo(() => report.filesChanged?.slice(0, 10) ?? [], [report.filesChanged])

  return (
    <div
      className={cn('mt-4 rounded-lg border p-4', cfg.border, cfg.bg)}
      data-testid="task-completion-card"
      role="status"
      aria-label={`Task ${cfg.label}: ${report.summary}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('size-4 shrink-0', cfg.color)} aria-hidden />
        <span className={cn('text-[13px] font-medium', cfg.color)}>{cfg.label}</span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground/80">{report.summary}</p>

      {hasStats && (
        <div className="mt-2.5 flex items-center gap-3 text-[12px] text-muted-foreground/60">
          {(report.linesAdded ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-400/70">
              <IconPlus className="size-3" aria-hidden />
              {report.linesAdded}
            </span>
          )}
          {(report.linesRemoved ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-red-400/70">
              <IconMinus className="size-3" aria-hidden />
              {report.linesRemoved}
            </span>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2.5 space-y-0.5">
          {files.map((f) => (
            <div key={f} className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50">
              <IconFile className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
