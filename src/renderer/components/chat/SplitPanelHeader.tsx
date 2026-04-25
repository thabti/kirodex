import { memo, useCallback } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useProjectIcon } from '@/hooks/useProjectIcon'
import { ProjectIcon } from '@/components/sidebar/ProjectIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SplitPanelHeaderProps {
  readonly taskId: string
  readonly isFocused: boolean
  readonly side: 'left' | 'right'
  readonly onClose: () => void
  readonly onFocus: () => void
}

export const SplitPanelHeader = memo(function SplitPanelHeader({
  taskId,
  isFocused,
  side,
  onClose,
  onFocus,
}: SplitPanelHeaderProps) {
  const taskName = useTaskStore((s) => s.tasks[taskId]?.name ?? 'Thread')
  const workspace = useTaskStore((s) => {
    const t = s.tasks[taskId]
    return t ? (t.originalWorkspace ?? t.workspace) : null
  })
  const projectName = useTaskStore((s) => {
    const t = s.tasks[taskId]
    const ws = t ? (t.originalWorkspace ?? t.workspace) : null
    if (!ws) return ''
    return s.projectNames[ws] ?? ws.split('/').pop() ?? ''
  })
  const icon = useProjectIcon(workspace ?? '')

  const handleClick = useCallback(() => onFocus(), [onFocus])
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }, [onClose])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Focus ${taskName} panel`}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick() }}
      className={cn(
        'group/header relative flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3 select-none cursor-pointer transition-colors',
        isFocused ? 'bg-background' : 'bg-card/50 hover:bg-card',
      )}
    >
      <ProjectIcon icon={icon} />
      <span className="min-w-0 max-w-[120px] truncate text-[12px] text-muted-foreground/70">
        {projectName}
      </span>
      <span className="text-[11px] text-muted-foreground/30">/</span>
      <span className={cn(
        'min-w-0 flex-1 truncate text-[12px] pr-6 transition-colors group-hover/header:pr-8',
        isFocused ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}>
        {taskName}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Close split panel"
            onClick={handleClose}
            className={cn(
              'absolute right-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-all',
              side === 'right'
                ? 'text-muted-foreground/60 hover:text-destructive hover:bg-accent'
                : 'text-muted-foreground/50 opacity-0 group-hover/header:opacity-100 hover:!text-destructive',
              isFocused ? 'bg-background hover:bg-accent' : 'bg-card/50 hover:bg-accent group-hover/header:bg-card',
            )}
          >
            {side === 'right' ? <IconX className="size-3.5" /> : <IconTrash className="size-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close split</TooltipContent>
      </Tooltip>
      {/* Focused accent bar */}
      {isFocused && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
      )}
    </div>
  )
})
