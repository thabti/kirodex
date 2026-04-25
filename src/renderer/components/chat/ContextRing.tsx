import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CompactionStatus } from '@/types'

export const ContextRing = memo(function ContextRing({ used, size, compactionStatus }: { used: number; size: number; compactionStatus?: CompactionStatus }) {
  const isPercentage = size === 100 && used <= 100
  const pct = isPercentage ? Math.round(used) : size > 0 ? Math.round((used / size) * 100) : 0
  const r = 9.75
  const circ = 2 * Math.PI * r
  const offset = circ - (circ * Math.min(pct, 100)) / 100
  const isCompacting = compactionStatus === 'compacting'

  const strokeColor =
    isCompacting ? 'var(--color-blue-500, #3b82f6)' :
    pct < 50 ? 'var(--color-muted-foreground)' :
    pct < 80 ? 'var(--color-amber-500, #f59e0b)' :
    'var(--color-red-500, #ef4444)'

  const textColor =
    isCompacting ? 'text-blue-500' :
    pct < 50 ? 'text-muted-foreground' :
    pct < 80 ? 'text-amber-500' :
    'text-red-500'

  const tooltipText = isCompacting
    ? 'Compacting context...'
    : isPercentage
      ? `Context window ${pct}% used`
      : `Context: ${pct}% (${Math.round(used / 1000)}k / ${Math.round(size / 1000)}k tokens)`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="context-ring" className={cn('relative flex h-7 w-7 cursor-default items-center justify-center rounded-full bg-card', isCompacting && 'animate-pulse')}>
          <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="12" cy="12" r={r} fill="none" stroke="color-mix(in oklab, var(--color-muted) 70%, transparent)" strokeWidth="2.5" />
            <circle
              cx="12" cy="12" r={r} fill="none"
              stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </svg>
          <span className={cn('relative text-[8px] font-semibold tabular-nums', textColor)}>
            {isCompacting ? '...' : pct}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">{tooltipText}</TooltipContent>
    </Tooltip>
  )
})
