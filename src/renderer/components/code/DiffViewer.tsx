import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs'
import { FileDiff, Virtualizer } from '@pierre/diffs/react'
import { IconColumns, IconLayoutRows, IconTextWrap, IconFileCode, IconChevronDown, IconChevronRight, IconPlus, IconArrowBackUp, IconExternalLink, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useDiffStore } from '@/stores/diffStore'
import { useResizeHandle } from '@/hooks/useResizeHandle'
import { getPreferredEditor } from '@/components/OpenInEditorGroup'

// ── Theme CSS overrides to integrate @pierre/diffs with our design system ──

const UNSAFE_CSS = `
[data-diffs-header], [data-diff], [data-file] {
  --diffs-bg: var(--card) !important;
  --diffs-bg-addition: color-mix(in srgb, var(--background) 92%, #0dbe4e) !important;
  --diffs-bg-deletion: color-mix(in srgb, var(--background) 92%, #ff2e3f) !important;
  --diffs-bg-addition-emphasis: color-mix(in srgb, var(--background) 82%, #0dbe4e) !important;
  --diffs-bg-deletion-emphasis: color-mix(in srgb, var(--background) 82%, #ff2e3f) !important;
  --diffs-bg-addition-number: color-mix(in srgb, var(--background) 88%, #0dbe4e) !important;
  --diffs-bg-deletion-number: color-mix(in srgb, var(--background) 88%, #ff2e3f) !important;
  --diffs-bg-addition-hover: color-mix(in srgb, var(--background) 86%, #0dbe4e) !important;
  --diffs-bg-deletion-hover: color-mix(in srgb, var(--background) 86%, #ff2e3f) !important;
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

// ── File stats ──

interface FileStats {
  name: string
  additions: number
  deletions: number
}

function getFileStats(files: FileDiffMetadata[]): FileStats[] {
  return files.map((f) => {
    let additions = 0
    let deletions = 0
    for (const hunk of f.hunks) {
      additions += hunk.additionLines
      deletions += hunk.deletionLines
    }
    return {
      name: f.name.replace(/^[ab]\//, ''),
      additions,
      deletions,
    }
  })
}

// ── Per-file action bar ──

function FileActionBar({
  name,
  additions,
  deletions,
  collapsed,
  onToggleCollapse,
  onStage,
  onRevert,
  onOpenInEditor,
  revertPending,
  onConfirmRevert,
  onCancelRevert,
}: {
  name: string
  additions: number
  deletions: number
  collapsed: boolean
  onToggleCollapse: () => void
  onStage: () => void
  onRevert: () => void
  onOpenInEditor: () => void
  revertPending: boolean
  onConfirmRevert: () => void
  onCancelRevert: () => void
}) {
  const shortName = name.split('/').pop() ?? name

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="flex items-center gap-1 px-2 py-1">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          {collapsed ? <IconChevronRight className="size-3" /> : <IconChevronDown className="size-3" />}
        </button>

        {/* File name + stats */}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={name}>
          {shortName}
        </span>
        {additions > 0 && <span className="text-[10px] font-semibold text-emerald-400">+{additions}</span>}
        {deletions > 0 && <span className="text-[10px] font-semibold text-red-400">-{deletions}</span>}

        {/* Actions */}
        <div className="ml-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onRevert}
            title="Revert changes"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <IconArrowBackUp className="size-3" />
          </button>
          <button
            type="button"
            onClick={onStage}
            title="Stage file"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
          >
            <IconPlus className="size-3" />
          </button>
          <button
            type="button"
            onClick={onOpenInEditor}
            title="Open in editor"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconExternalLink className="size-3" />
          </button>
        </div>
      </div>

      {/* Revert confirmation */}
      {revertPending && (
        <div className="flex items-center gap-2 border-t border-border bg-destructive/5 px-2 py-1">
          <span className="flex-1 text-[10px] text-destructive">Discard changes to {shortName}?</span>
          <button
            type="button"
            onClick={onCancelRevert}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmRevert}
            className="rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white hover:bg-destructive/90"
          >
            Revert
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ──

interface DiffViewerProps {
  diff: string
  taskId?: string
  workspace?: string
  onRefreshDiff?: () => void
}

export function DiffViewer({ diff, taskId, workspace, onRefreshDiff }: DiffViewerProps) {
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>('unified')
  const [wordWrap, setWordWrap] = useState(true)
  const [selectedFileIdx, setSelectedFileIdx] = useState<number | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set())
  const [revertIdx, setRevertIdx] = useState<number | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(176)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  const MIN_SIDEBAR = 100

  const handleSidebarDragStart = useResizeHandle({
    axis: 'horizontal', size: sidebarWidth, onResize: (w) => {
      if (w < 60) { setIsSidebarCollapsed(true) } else { setIsSidebarCollapsed(false); setSidebarWidth(w) }
    }, min: 0, max: 320,
  })

  // Parse the unified diff into FileDiffMetadata[]
  const parsedFiles = useMemo(() => {
    if (!diff.trim()) return []
    try {
      const patches = parsePatchFiles(diff)
      return patches.flatMap((p) => p.files)
    } catch {
      return []
    }
  }, [diff])

  const fileStats = useMemo(() => getFileStats(parsedFiles), [parsedFiles])
  const totalAdditions = useMemo(() => fileStats.reduce((s, f) => s + f.additions, 0), [fileStats])
  const totalDeletions = useMemo(() => fileStats.reduce((s, f) => s + f.deletions, 0), [fileStats])

  // Focus a specific file when requested via diffStore.openToFile()
  const focusFile = useDiffStore((s) => s.focusFile)
  useEffect(() => {
    if (!focusFile || parsedFiles.length === 0) return
    const idx = parsedFiles.findIndex((f) =>
      f.name.replace(/^[ab]\//, '').includes(focusFile)
    )
    if (idx >= 0) setSelectedFileIdx(idx)
    useDiffStore.setState({ focusFile: null })
  }, [focusFile, parsedFiles])

  // Determine which file indices to show
  const visibleIndices = useMemo(() => {
    if (selectedFileIdx !== null && parsedFiles[selectedFileIdx]) return [selectedFileIdx]
    return parsedFiles.map((_, i) => i)
  }, [parsedFiles, selectedFileIdx])

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const clearSelection = useCallback(() => setSelectedFileIdx(null), [])

  const toggleCollapse = useCallback((idx: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleStage = useCallback(async (filePath: string) => {
    if (!taskId) return
    try {
      await ipc.gitStage(taskId, filePath)
      onRefreshDiff?.()
    } catch (e) {
      console.error('Stage failed:', e)
    }
  }, [taskId, onRefreshDiff])

  const handleRevert = useCallback(async (filePath: string) => {
    if (!taskId) return
    try {
      await ipc.gitRevert(taskId, filePath)
      setRevertIdx(null)
      onRefreshDiff?.()
    } catch (e) {
      console.error('Revert failed:', e)
    }
  }, [taskId, onRefreshDiff])

  const handleOpenInEditor = useCallback((filePath: string) => {
    if (!workspace) return
    ipc.openInEditor(`${workspace}/${filePath}`, getPreferredEditor()).catch(() => {})
  }, [workspace])

  if (!diff.trim() || parsedFiles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No changes yet
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b px-2 py-1 shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-emerald-400">+{totalAdditions}</span>
        <span className="text-[10px] text-red-400">-{totalDeletions}</span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((v) => !v)}
          title={isSidebarCollapsed ? 'Show file list' : 'Hide file list'}
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors',
            isSidebarCollapsed ? 'text-muted-foreground/50 hover:text-foreground' : 'bg-accent text-foreground',
          )}
        >
          {isSidebarCollapsed ? <IconLayoutSidebarLeftExpand className="size-3" /> : <IconLayoutSidebarLeftCollapse className="size-3" />}
        </button>
        <button
          type="button"
          onClick={() => setDiffStyle('unified')}
          title="Unified view"
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors',
            diffStyle === 'unified' ? 'bg-accent text-foreground' : 'text-muted-foreground/50 hover:text-foreground',
          )}
        >
          <IconLayoutRows className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setDiffStyle('split')}
          title="Split view"
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors',
            diffStyle === 'split' ? 'bg-accent text-foreground' : 'text-muted-foreground/50 hover:text-foreground',
          )}
        >
          <IconColumns className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setWordWrap((v) => !v)}
          title="Toggle word wrap"
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors',
            wordWrap ? 'bg-accent text-foreground' : 'text-muted-foreground/50 hover:text-foreground',
          )}
        >
          <IconTextWrap className="size-3" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File list sidebar */}
        {!isSidebarCollapsed && (
          <div className="shrink-0 flex min-h-0" style={{ width: sidebarWidth }}>
            <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
              <button
                type="button"
                onClick={clearSelection}
                className={cn(
                  'flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-medium border-b transition-colors',
                  selectedFileIdx === null ? 'bg-accent/30 text-foreground' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                All files ({parsedFiles.length})
              </button>
              {fileStats.map((file, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedFileIdx(i)}
                  className={cn(
                    'flex items-center gap-1 w-full px-2 py-1 text-[10px] hover:bg-accent/10 truncate transition-colors',
                    selectedFileIdx === i && 'bg-accent/30 text-foreground',
                  )}
                >
                  <IconFileCode className="size-3 shrink-0 text-muted-foreground/50" />
                  <span className="min-w-0 flex-1 truncate">{file.name.split('/').pop()}</span>
                  <span className="shrink-0 flex gap-1">
                    {file.additions > 0 && <span className="text-emerald-400">+{file.additions}</span>}
                    {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
                  </span>
                </button>
              ))}
            </div>
            {/* Drag handle */}
            <div
              onMouseDown={handleSidebarDragStart}
              className="w-1 shrink-0 cursor-col-resize border-r hover:bg-primary/20 active:bg-primary/30 transition-colors"
            />
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 min-w-0 overflow-auto">
          <Virtualizer config={{ overscrollSize: 400, intersectionObserverMargin: 800 }}>
            {visibleIndices.map((fileIdx) => {
              const fileDiff = parsedFiles[fileIdx]
              const stats = fileStats[fileIdx]
              if (!fileDiff || !stats) return null
              const isCollapsed = collapsedFiles.has(fileIdx)

              return (
                <div key={`${fileDiff.name}-${fileIdx}`}>
                  <FileActionBar
                    name={stats.name}
                    additions={stats.additions}
                    deletions={stats.deletions}
                    collapsed={isCollapsed}
                    onToggleCollapse={() => toggleCollapse(fileIdx)}
                    onStage={() => void handleStage(stats.name)}
                    onRevert={() => setRevertIdx(fileIdx)}
                    onOpenInEditor={() => handleOpenInEditor(stats.name)}
                    revertPending={revertIdx === fileIdx}
                    onConfirmRevert={() => void handleRevert(stats.name)}
                    onCancelRevert={() => setRevertIdx(null)}
                  />
                  {!isCollapsed && (
                    <FileDiff
                      fileDiff={fileDiff}
                      options={{
                        diffStyle,
                        lineDiffType: 'word',
                        overflow: wordWrap ? 'wrap' : 'scroll',
                        theme: isDark ? 'pierre-dark' : 'pierre-light',
                        themeType: isDark ? 'dark' : 'light',
                        unsafeCSS: UNSAFE_CSS,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </Virtualizer>
        </div>
      </div>
    </div>
  )
}
