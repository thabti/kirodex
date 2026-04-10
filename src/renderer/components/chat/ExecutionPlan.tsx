import { memo, useState } from 'react'
import { IconCheck, IconCircle, IconLoader2, IconChevronDown, IconChevronRight, IconListCheck } from '@tabler/icons-react'
import type { PlanStep } from '@/types'
import { cn } from '@/lib/utils'

interface ExecutionPlanProps {
  steps: PlanStep[]
}

const stepIcons = {
  pending: <IconCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />,
  in_progress: <IconLoader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />,
  completed: <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />,
} as const

const priorityDot: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-muted-foreground/30',
}

export const ExecutionPlan = memo(function ExecutionPlan({ steps }: ExecutionPlanProps) {
  const [expanded, setExpanded] = useState(true)
  const completed = steps.filter((s) => s.status === 'completed').length
  const progress = steps.length > 0 ? (completed / steps.length) * 100 : 0
  const isAllDone = completed === steps.length && steps.length > 0

  return (
    <div className={cn(
      'my-2 overflow-hidden rounded-lg border bg-card/40 transition-colors',
      isAllDone
        ? 'border-emerald-500/30'
        : 'border-primary/25',
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Execution plan, ${completed} of ${steps.length} steps completed`}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/10"
      >
        <IconListCheck className={cn(
          'size-4',
          isAllDone ? 'text-emerald-400' : 'text-primary/70',
        )} />
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          Plan
          <span className="ml-1.5 tabular-nums">
            {completed}/{steps.length}
          </span>
        </span>
        {expanded
          ? <IconChevronDown className="size-3 text-muted-foreground" />
          : <IconChevronRight className="size-3 text-muted-foreground" />}
      </button>

      {/* progress bar */}
      <div className="h-0.5 w-full bg-border/30">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            isAllDone ? 'bg-emerald-400' : 'bg-primary/60',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {expanded && (
        <ol className="px-3 py-2 space-y-1" role="list">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {stepIcons[step.status] ?? stepIcons.pending}
              <span className={cn(
                'flex-1 leading-relaxed',
                step.status === 'completed' && 'text-muted-foreground line-through',
                step.status === 'in_progress' && 'text-foreground',
                step.status === 'pending' && 'text-muted-foreground/70',
              )}>
                {step.content}
              </span>
              <span className={cn(
                'mt-1.5 size-1.5 shrink-0 rounded-full',
                priorityDot[step.priority] ?? priorityDot.low,
              )} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
})
