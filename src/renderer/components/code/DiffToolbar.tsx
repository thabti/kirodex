import { IconColumns, IconLayoutRows, IconTextWrap, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface DiffToolbarProps {
  fileCount: number
  viewedCount: number
  totalAdditions: number
  totalDeletions: number
  stagedFileCount: number
  diffStyle: 'unified' | 'split'
  wordWrap: boolean
  isSidebarCollapsed: boolean
  isSummaryCollapsed: boolean
  onDiffStyleChange: (style: 'unified' | 'split') => void
  onWordWrapToggle: () => void
  onSidebarToggle: () => void
  onSummaryToggle: () => void
}

export const DiffToolbar = ({
  fileCount, viewedCount, totalAdditions, totalDeletions, stagedFileCount,
  diffStyle, wordWrap, isSidebarCollapsed, isSummaryCollapsed,
  onDiffStyleChange, onWordWrapToggle, onSidebarToggle, onSummaryToggle,
}: DiffToolbarProps) => (
  <div className="flex items-center gap-1.5 border-b px-2 py-1 shrink-0">
    <div className="flex items-center gap-1.5 pr-1.5 border-r border-border/60">
      <span className="text-[11px] text-muted-foreground">
        {fileCount} file{fileCount !== 1 ? 's' : ''}
      </span>
      {fileCount > 0 && (
        viewedCount === fileCount
          ? <span className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">all viewed</span>
          : <span className="text-[11px] tabular-nums text-muted-foreground">{viewedCount}/{fileCount} viewed</span>
      )}
    </div>
    <div className="flex items-center gap-1.5 pr-1.5 border-r border-border/60">
      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>
      <span className="text-[11px] text-red-600 dark:text-red-400">-{totalDeletions}</span>
    </div>
    {stagedFileCount > 0 && (
      <span className="text-[11px] text-blue-600 dark:text-blue-400">{stagedFileCount} staged</span>
    )}
    <div className="flex-1" />
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onSidebarToggle} aria-label={isSidebarCollapsed ? 'Show file list' : 'Hide file list'}
          className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors', isSidebarCollapsed ? 'text-muted-foreground/70 hover:text-foreground' : 'bg-accent text-foreground')}>
          {isSidebarCollapsed ? <IconLayoutSidebarLeftExpand className="size-3.5" /> : <IconLayoutSidebarLeftCollapse className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{isSidebarCollapsed ? 'Show file list' : 'Hide file list'}</TooltipContent>
    </Tooltip>
    <div className="flex items-center rounded-md border border-border overflow-hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onDiffStyleChange('unified')} aria-label="Unified view"
            className={cn('flex h-6 w-6 items-center justify-center transition-colors', diffStyle === 'unified' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <IconLayoutRows className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Unified view</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onDiffStyleChange('split')} aria-label="Split view"
            className={cn('flex h-6 w-6 items-center justify-center transition-colors', diffStyle === 'split' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <IconColumns className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Split view</TooltipContent>
      </Tooltip>
    </div>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onWordWrapToggle} aria-label="Toggle word wrap"
          className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors', wordWrap ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground')}>
          <IconTextWrap className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{wordWrap ? 'Disable word wrap' : 'Enable word wrap'}</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onSummaryToggle} aria-label={isSummaryCollapsed ? 'Show agent summary' : 'Hide agent summary'}
          className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-colors', isSummaryCollapsed ? 'text-muted-foreground/70 hover:text-foreground' : 'bg-accent text-foreground')}>
          {isSummaryCollapsed ? <IconLayoutSidebarRightExpand className="size-3.5" /> : <IconLayoutSidebarRightCollapse className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{isSummaryCollapsed ? 'Show agent summary' : 'Hide agent summary'}</TooltipContent>
    </Tooltip>
  </div>
)
