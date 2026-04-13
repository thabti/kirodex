import { memo, useCallback } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const PlanIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 7h8" /><path d="M8 12h8" /><path d="M8 17h4" />
  </svg>
)

export const PlanToggle = memo(function PlanToggle() {
  const currentModeId = useSettingsStore((s) => s.currentModeId)
  const modes = useSettingsStore((s) => s.availableModes)
  const isPlan = currentModeId === 'kiro_planner'

  const handleToggle = useCallback(() => {
    const nextMode = isPlan ? 'kiro_default' : 'kiro_planner'
    useSettingsStore.setState({ currentModeId: nextMode })
    const taskId = useTaskStore.getState().selectedTaskId
    if (taskId) ipc.setMode(taskId, nextMode)
  }, [isPlan])

  const hasPlanMode = modes.some((m) => m.id === 'kiro_planner')
  if (!hasPlanMode) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleToggle}
          data-testid="plan-toggle"
          className={cn(
            'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-colors',
            isPlan
              ? 'text-teal-400 hover:text-teal-300'
              : 'text-muted-foreground/50 hover:text-muted-foreground/70',
          )}
        >
          <PlanIcon />
          <span>{isPlan ? 'Plan' : 'Plan'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {isPlan ? 'Plan mode on \u2014 click to disable' : 'Enable plan mode'}
      </TooltipContent>
    </Tooltip>
  )
})
