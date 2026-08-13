import { memo } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface AgentHandoffLoaderProps {
  label: string
  detail?: string
  announcement?: string
  className?: string
  compact?: boolean
  isLabelVisible?: boolean
  reserveLabelWidth?: boolean
}

export const AgentHandoffLoader = memo(function AgentHandoffLoader({
  label,
  detail,
  announcement,
  className,
  compact = false,
  isLabelVisible = true,
  reserveLabelWidth = false,
}: AgentHandoffLoaderProps) {
  return (
    <div
      data-slot="agent-handoff-loader"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={announcement ?? label}
      className={cn('flex items-center justify-center select-none', className)}
    >
      <div data-slot="agent-handoff-cluster" className="flex min-w-0 items-center">
        <span
          data-slot="agent-handoff-status"
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-muted-foreground',
            compact ? 'h-7 px-1 text-[11px]' : 'h-8 px-1.5 text-[12px]',
          )}
        >
          <IconSparkles
            data-slot="agent-handoff-progress"
            className="size-3.5 shrink-0 animate-pulse text-[var(--handoff-violet)] motion-reduce:animate-none"
            strokeWidth={2}
            aria-hidden
          />
          <span
            data-slot="agent-handoff-label"
            className={cn(
              'truncate font-medium leading-none tracking-tight text-foreground/75 transition-opacity duration-200 motion-reduce:transition-none',
              reserveLabelWidth ? 'w-20' : 'max-w-56',
              isLabelVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            {label}
          </span>
          {detail ? <span data-slot="agent-handoff-detail" className="w-9 shrink-0 text-right text-[10px] leading-none tabular-nums text-muted-foreground/60">{detail}</span> : null}
        </span>
      </div>
    </div>
  )
})
