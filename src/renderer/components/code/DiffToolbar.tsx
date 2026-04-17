import { IconColumns, IconLayoutRows, IconTextWrap, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface DiffToolbarProps {
  fileCount: number
  totalAdditions: number
  totalDeletions: number
  stagedFileCount: number
  diffStyle: 'unified' | 'split'
  wordWrap: boolean
  isSidebarCollapsed: boolean
  onDiffStyleChange: (style: 'unified' | 'split') => void
  onWordWrapToggle: () => void
  onSidebarToggle: () => void
}

export const DiffToolbar = ({
  fileCount, totalAdditions, totalDeletions, stagedFileCount,
  diffStyle, wordWrap, isSidebarCollapsed,
  onDiffStyleChange, onWordWrapToggle, onSidebarToggle,
}: DiffToolbarProps) => (
  <div className="flex items-center gap-1.5 border-b px-2 py-1 shrink-0">
    <span className="text-[10px] text-muted-foreground">
      {fileCount} file{fileCount !== 1 ? 's' : ''}
    </span>
    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>
    <span className="text-[10px] text-red-600 dark:text-red-400">-{totalDeletions}</span>
    {stagedFileCount > 0 && (
      <span className="text-[10px] text-blue-600 dark:text-blue-400">{stagedFileCount} staged</span>
    )}
    <div className="flex-1" />
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onSidebarToggle} aria-label={isSidebarCollapsed ? 'Show file list' : 'Hide file list'}
          className={cn('flex size-5 items-center justify-center rounded transition-colors', isSidebarCollapsed ? 'text-muted-foreground/70 hover:text-foreground' : 'bg-accent text-foreground')}>
          {isSidebarCollapsed ? <IconLayoutSidebarLeftExpand className="size-3" /> : <IconLayoutSidebarLeftCollapse className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{isSidebarCollapsed ? 'Show file list' : 'Hide file list'}</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => onDiffStyleChange('unified')} aria-label="Unified view"
          className={cn('flex size-5 items-center justify-center rounded transition-colors', diffStyle === 'unified' ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground')}>
          <IconLayoutRows className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Unified view</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => onDiffStyleChange('split')} aria-label="Split view"
          className={cn('flex size-5 items-center justify-center rounded transition-colors', diffStyle === 'split' ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground')}>
          <IconColumns className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Split view</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onWordWrapToggle} aria-label="Toggle word wrap"
          className={cn('flex size-5 items-center justify-center rounded transition-colors', wordWrap ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground')}>
          <IconTextWrap className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{wordWrap ? 'Disable word wrap' : 'Enable word wrap'}</TooltipContent>
    </Tooltip>
  </div>
)
