import { useState, useCallback, useRef } from 'react'
import { IconChevronDown, IconChevronRight, IconPlus, IconCheck, IconArrowBackUp, IconExternalLink } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface DiffFileActionBarProps {
  name: string
  additions: number
  deletions: number
  collapsed: boolean
  onToggleCollapse: () => void
  onStage: () => Promise<void> | void
  onRevert: () => void
  onOpenInEditor: () => void
  revertPending: boolean
  onConfirmRevert: () => void
  onCancelRevert: () => void
}

export const DiffFileActionBar = ({
  name, additions, deletions, collapsed,
  onToggleCollapse, onStage, onRevert, onOpenInEditor,
  revertPending, onConfirmRevert, onCancelRevert,
}: DiffFileActionBarProps) => {
  const shortName = name.split('/').pop() ?? name
  const [isStaged, setIsStaged] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleStageClick = useCallback(async () => {
    try {
      await onStage()
      setIsStaged(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsStaged(false), 1500)
    } catch { /* stage failed, keep + icon */ }
  }, [onStage])

  return (
    <div className="border-b border-border bg-muted/50">
      <div className="flex items-center gap-1 px-2 py-1">
        <button type="button" onClick={onToggleCollapse}
          className="flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
          {collapsed ? <IconChevronRight className="size-3" /> : <IconChevronDown className="size-3" />}
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={name}>{shortName}</span>
        {additions > 0 && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">+{additions}</span>}
        {deletions > 0 && <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">-{deletions}</span>}
        <div className="ml-1 flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onRevert} aria-label="Revert changes"
                className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                <IconArrowBackUp className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Revert changes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleStageClick} aria-label={isStaged ? 'File staged' : 'Stage file'}
                className={isStaged
                  ? 'flex size-5 items-center justify-center rounded text-emerald-500 transition-colors'
                  : 'flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-500'
                }>
                {isStaged ? <IconCheck className="size-3" /> : <IconPlus className="size-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{isStaged ? 'Staged' : 'Stage file'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onOpenInEditor} aria-label="Open in editor"
                className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
                <IconExternalLink className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Open in editor</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {revertPending && (
        <div className="flex items-center gap-2 border-t border-border bg-destructive/5 px-2 py-1">
          <span className="flex-1 text-[10px] text-destructive">Discard changes to {shortName}?</span>
          <button type="button" onClick={onCancelRevert} className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent">Cancel</button>
          <button type="button" onClick={onConfirmRevert} className="rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white hover:bg-destructive/90">Revert</button>
        </div>
      )}
    </div>
  )
}
