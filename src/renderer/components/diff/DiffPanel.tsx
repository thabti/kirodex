import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs'
import { FileDiff, Virtualizer } from '@pierre/diffs/react'
import { IconX, IconGripHorizontal, IconColumns, IconLayoutRows, IconTextWrap, IconFileCode, IconRefresh, IconPlus, IconCheck, IconArrowBackUp } from '@tabler/icons-react'
import { useDiffStore } from '@/stores/diffStore'
import { useTaskStore } from '@/stores/taskStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// ── Theme CSS overrides ──────────────────────────────────────────

const UNSAFE_CSS = `
[data-diffs-header], [data-diff], [data-file] {
  --diffs-bg: var(--card) !important;
  --diffs-bg-addition: color-mix(in srgb, var(--background) 97%, #0dbe4e) !important;
  --diffs-bg-deletion: color-mix(in srgb, var(--background) 97%, #ff2e3f) !important;
  --diffs-bg-addition-emphasis: color-mix(in srgb, var(--background) 92%, #0dbe4e) !important;
  --diffs-bg-deletion-emphasis: color-mix(in srgb, var(--background) 92%, #ff2e3f) !important;
  --diffs-bg-addition-number: color-mix(in srgb, var(--background) 95%, #0dbe4e) !important;
  --diffs-bg-deletion-number: color-mix(in srgb, var(--background) 95%, #ff2e3f) !important;
  --diffs-bg-addition-hover: color-mix(in srgb, var(--background) 93%, #0dbe4e) !important;
  --diffs-bg-deletion-hover: color-mix(in srgb, var(--background) 93%, #ff2e3f) !important;
  --diffs-bg-buffer-override: var(--background) !important;
  --diffs-bg-hover-override: var(--accent) !important;
  --diffs-bg-context-override: var(--card) !important;
  --diffs-bg-separator-override: var(--muted) !important;
  --diffs-fg-number-override: color-mix(in srgb, var(--muted-foreground) 50%, transparent) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}
[data-diffs-header] {
  background: var(--card) !important;
  border-bottom: 1px solid var(--border) !important;
}
`

// ── File stats helper ────────────────────────────────────────────

function getFileStats(files: FileDiffMetadata[]) {
  return files.map((f) => {
    let additions = 0
    let deletions = 0
    for (const hunk of f.hunks) {
      additions += hunk.additionLines
      deletions += hunk.deletionLines
    }
    return { name: f.name.replace(/^[ab]\//, ''), additions, deletions }
  })
}

// ── Main panel ───────────────────────────────────────────────────

export const DiffPanel = memo(function DiffPanel() {
  const diff = useDiffStore((s) => s.diff)
  const stats = useDiffStore((s) => s.stats)
  const loading = useDiffStore((s) => s.loading)
  const fetchDiff = useDiffStore((s) => s.fetchDiff)
  const setOpen = useDiffStore((s) => s.setOpen)
  const selectedFiles = useDiffStore((s) => s.selectedFiles)
  const toggleFileSelection = useDiffStore((s) => s.toggleFileSelection)
  const stageSelected = useDiffStore((s) => s.stageSelected)
  const revertSelected = useDiffStore((s) => s.revertSelected)
  const focusFile = useDiffStore((s) => s.focusFile)

  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskWorkspace = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.workspace : undefined)

  const [height, setHeight] = useState(400)
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>('unified')
  const [wordWrap, setWordWrap] = useState(true)
  const [selectedFileIdx, setSelectedFileIdx] = useState<number | null>(null)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef(400)

  // Fetch diff when panel opens or task changes
  useEffect(() => {
    if (selectedTaskId) {
      void fetchDiff(selectedTaskId)
    }
  }, [selectedTaskId, fetchDiff])

  // Parse
  const parsedFiles = useMemo(() => {
    if (!diff.trim()) return []
    try {
      return parsePatchFiles(diff).flatMap((p) => p.files)
    } catch {
      return []
    }
  }, [diff])

  const fileStats = useMemo(() => getFileStats(parsedFiles), [parsedFiles])

  // Focus a specific file when requested via store
  useEffect(() => {
    if (!focusFile || parsedFiles.length === 0) return
    const idx = parsedFiles.findIndex((f) =>
      f.name.replace(/^[ab]\//, '').includes(focusFile)
    )
    if (idx >= 0) {
      setSelectedFileIdx(idx)
      useDiffStore.setState({ focusFile: null })
    }
  }, [focusFile, parsedFiles])

  const visibleFiles = useMemo(() => {
    if (selectedFileIdx !== null && parsedFiles[selectedFileIdx]) {
      return [parsedFiles[selectedFileIdx]]
    }
    return parsedFiles
  }, [parsedFiles, selectedFileIdx])

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const hasSelection = selectedFiles.size > 0
  const [isStaged, setIsStaged] = useState(false)
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRefresh = useCallback(() => {
    if (selectedTaskId) void fetchDiff(selectedTaskId)
  }, [selectedTaskId, fetchDiff])

  const handleStageSelected = useCallback(async () => {
    if (!selectedTaskId) return
    try {
      await stageSelected(selectedTaskId)
      setIsStaged(true)
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current)
      stageTimerRef.current = setTimeout(() => setIsStaged(false), 1500)
    } catch { /* stage failed */ }
  }, [selectedTaskId, stageSelected])

  const handleRevertSelected = useCallback(() => {
    if (selectedTaskId) void revertSelected(selectedTaskId)
  }, [selectedTaskId, revertSelected])

  // Resize drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartY.current = e.clientY
    dragStartH.current = height
    const onMove = (ev: MouseEvent) => {
      if (dragStartY.current === null) return
      const delta = dragStartY.current - ev.clientY
      setHeight(Math.max(200, Math.min(700, dragStartH.current + delta)))
    }
    const onUp = () => {
      dragStartY.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  return (
    <aside data-testid="diff-panel" className="flex shrink-0 flex-col border-t border-border bg-card" style={{ height }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="flex h-2 cursor-row-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors"
      >
        <IconGripHorizontal className="size-3 text-muted-foreground" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1 shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">Files Changed</span>
        <span className="text-[10px] text-muted-foreground">
          {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''}
        </span>

        {stats.additions > 0 && (
          <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{stats.additions.toLocaleString()}</span>
        )}
        {stats.deletions > 0 && (
          <span className="text-[11px] font-semibold tabular-nums text-red-600 dark:text-red-400">-{stats.deletions.toLocaleString()}</span>
        )}

        {!taskWorkspace && (
          <span className="text-[10px] text-muted-foreground italic">no workspace</span>
        )}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleRefresh}
              data-testid="diff-refresh-button"
              className={cn(
                'flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground transition-colors',
                loading && 'animate-spin',
              )}
            >
              <IconRefresh className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Refresh diff</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setDiffStyle('unified')}
              className={cn(
                'flex size-5 items-center justify-center rounded transition-colors',
                diffStyle === 'unified' ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              <IconLayoutRows className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Unified view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setDiffStyle('split')}
              className={cn(
                'flex size-5 items-center justify-center rounded transition-colors',
                diffStyle === 'split' ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              <IconColumns className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Split view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setWordWrap((v) => !v)}
              className={cn(
                'flex size-5 items-center justify-center rounded transition-colors',
                wordWrap ? 'bg-accent text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              <IconTextWrap className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle word wrap</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="diff-close-button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
            >
              <IconX className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File sidebar */}
        <div className="w-48 shrink-0 border-r overflow-y-auto min-h-0 flex flex-col">
          <button
            type="button"
            onClick={() => setSelectedFileIdx(null)}
            className={cn(
              'flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-medium border-b transition-colors',
              selectedFileIdx === null ? 'bg-accent/30 text-foreground' : 'text-muted-foreground hover:bg-accent/10',
            )}
          >
            All files ({parsedFiles.length})
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {fileStats.map((file, i) => {
              const isChecked = selectedFiles.has(file.name)
              return (
                <div
                  key={file.name}
                  className={cn(
                    'group flex items-center gap-1 w-full px-1 py-1 text-[10px] hover:bg-accent/10 transition-colors',
                    selectedFileIdx === i && 'bg-accent/30 text-foreground',
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleFileSelection(file.name)}
                    className={cn(
                      'size-3 shrink-0 transition-opacity',
                      isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    aria-label={`Select ${file.name}`}
                    tabIndex={0}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedFileIdx(i)}
                    className="flex items-center gap-1 min-w-0 flex-1 truncate"
                  >
                    <IconFileCode className="size-3 shrink-0 text-muted-foreground/70" />
                    <span className="min-w-0 flex-1 truncate text-left">{file.name.split('/').pop()}</span>
                    <span className="shrink-0 flex gap-1">
                      {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>}
                      {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          {hasSelection && (
            <div className="flex items-center gap-1 border-t px-2 py-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleStageSelected}
                    data-testid="diff-stage-button"
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                      isStaged
                        ? 'text-emerald-500'
                        : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-400/10',
                    )}
                    aria-label={isStaged ? 'Files staged' : 'Stage selected files'}
                  >
                    {isStaged ? <IconCheck className="size-3" /> : <IconPlus className="size-3" />}
                    {isStaged ? 'Staged' : `Stage (${selectedFiles.size})`}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{isStaged ? 'Staged' : 'Stage selected files'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleRevertSelected}
                    data-testid="diff-revert-button"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-400/10 transition-colors"
                    aria-label="Revert selected files"
                  >
                    <IconArrowBackUp className="size-3" />
                    Revert
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Revert selected files</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Diff viewer */}
        <div className="flex-1 min-w-0 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <IconRefresh className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : parsedFiles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {diff.trim() ? 'Could not parse diff' : 'No changes yet'}
            </div>
          ) : (
            <Virtualizer config={{ overscrollSize: 400, intersectionObserverMargin: 800 }}>
              {visibleFiles.map((fileDiff, i) => (
                <FileDiff
                  key={`${fileDiff.name}-${i}`}
                  fileDiff={fileDiff}
                  options={{
                    diffStyle,
                    lineDiffType: 'word',
                    overflow: wordWrap ? 'wrap' : 'scroll',
                    theme: isDark ? 'pierre-dark' : 'pierre-light',
                    themeType: isDark ? 'dark' : 'light',
                    unsafeCSS: UNSAFE_CSS,
                    disableFileHeader: true,
                  }}
                />
              ))}
            </Virtualizer>
          )}
        </div>
      </div>
    </aside>
  )
})
