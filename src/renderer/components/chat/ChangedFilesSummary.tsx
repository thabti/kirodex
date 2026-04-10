import { memo, useMemo, useState, useCallback } from 'react'
import { IconFile, IconFolder, IconChevronDown, IconChevronRight, IconEye, IconFileDiff } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useDiffStore } from '@/stores/diffStore'
import type { ToolCall } from '@/types'
import type { ChangedFilesRow } from '@/lib/timeline'

// ── Types ────────────────────────────────────────────────────────

interface FileStats {
  readonly path: string
  readonly name: string
  readonly additions: number
  readonly deletions: number
}

interface DirGroup {
  readonly dir: string
  readonly files: readonly FileStats[]
  readonly additions: number
  readonly deletions: number
}

const MAX_VISIBLE_FILES = 30

// ── Pure helpers (no side effects, safe for useMemo) ─────────────

/** Count lines in a string without allocating an array */
function countLines(text: string): number {
  if (!text) return 0
  let n = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++
  }
  // count last line if no trailing newline
  return text.endsWith('\n') ? n : n + 1
}

/** Cheap line-count diff: compare old/new line counts */
function computeLineDelta(oldText: string | null | undefined, newText: string | null | undefined): { additions: number; deletions: number } {
  const oldLines = countLines(oldText ?? '')
  const newLines = countLines(newText ?? '')
  const delta = newLines - oldLines
  return delta >= 0
    ? { additions: delta || (newLines > 0 ? 1 : 0), deletions: 0 }
    : { additions: 0, deletions: -delta }
}

/** Extract file paths that actually appear in the git diff (cheap scan, no full parse) */
function extractDiffFilePaths(rawDiff: string): Set<string> {
  const paths = new Set<string>()
  if (!rawDiff) return paths
  // Match "diff --git a/path b/path" or "+++ b/path" lines
  const lines = rawDiff.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      paths.add(line.slice(6))
    } else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
      // Some diffs omit the b/ prefix
      paths.add(line.slice(4))
    }
  }
  return paths
}

/** Extract per-file stats from completed edit/delete/move tool calls, validated against actual diff */
function extractFileStats(toolCalls: readonly ToolCall[], rawDiff: string): FileStats[] {
  const diffPaths = extractDiffFilePaths(rawDiff)
  const statsMap = new Map<string, { additions: number; deletions: number }>()

  for (const tc of toolCalls) {
    if (tc.status !== 'completed') continue
    if (tc.kind !== 'edit' && tc.kind !== 'delete' && tc.kind !== 'move') continue

    const filePath = tc.locations?.[0]?.path
    if (!filePath) continue

    // Skip files that don't appear in the actual diff (e.g. reverted edits)
    // Only validate if we have diff data; if diff is empty, trust tool calls
    if (diffPaths.size > 0 && !diffPaths.has(filePath)) continue

    let additions = 0
    let deletions = 0

    const diffContent = tc.content?.find((c) => c.type === 'diff')
    if (diffContent && (diffContent.oldText != null || diffContent.newText != null)) {
      const delta = computeLineDelta(diffContent.oldText, diffContent.newText)
      additions = delta.additions
      deletions = delta.deletions
    } else if (tc.kind === 'delete') {
      deletions = 1
    } else {
      additions = 1
    }

    const existing = statsMap.get(filePath)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
    } else {
      statsMap.set(filePath, { additions, deletions })
    }
  }

  const result: FileStats[] = []
  for (const [path, stats] of statsMap) {
    result.push({ path, name: path.slice(path.lastIndexOf('/') + 1), ...stats })
  }
  return result
}

/** Group files by parent directory, sorted alphabetically */
function groupByDirectory(files: readonly FileStats[]): DirGroup[] {
  const groups = new Map<string, FileStats[]>()

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf('/')
    const dir = lastSlash > 0 ? file.path.slice(0, lastSlash) : ''
    let arr = groups.get(dir)
    if (!arr) { arr = []; groups.set(dir, arr) }
    arr.push(file)
  }

  const result: DirGroup[] = []
  for (const [dir, dirFiles] of groups) {
    dirFiles.sort((a, b) => a.name.localeCompare(b.name))
    let additions = 0, deletions = 0
    for (const f of dirFiles) { additions += f.additions; deletions += f.deletions }
    result.push({ dir, files: dirFiles, additions, deletions })
  }
  result.sort((a, b) => a.dir.localeCompare(b.dir))
  return result
}

// ── Memoized sub-components ──────────────────────────────────────

const StatBadge = memo(function StatBadge({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions === 0 && deletions === 0) return null
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      {additions > 0 && <span className="text-emerald-400">+{additions}</span>}
      {deletions > 0 && <span className="text-red-400/80">-{deletions}</span>}
    </span>
  )
})

const FileEntry = memo(function FileEntry({ file, indented, onClick }: { file: FileStats; indented: boolean; onClick: (path: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(file.path)}
      className={cn(
        'flex w-full items-center gap-1.5 py-1.5 text-left transition-colors hover:bg-muted/10',
        indented ? 'pl-9 pr-3.5' : 'px-3.5',
      )}
    >
      <IconFile className="size-3.5 shrink-0 text-muted-foreground/25" />
      <span className="flex-1 truncate text-[12px] text-foreground/70">{file.name}</span>
      <StatBadge additions={file.additions} deletions={file.deletions} />
    </button>
  )
})

// ── Main component ───────────────────────────────────────────────

export const ChangedFilesSummary = memo(function ChangedFilesSummary({ row }: { row: ChangedFilesRow }) {
  const [expanded, setExpanded] = useState(false)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const rawDiff = useDiffStore((s) => s.diff)

  const fileStats = useMemo(() => extractFileStats(row.toolCalls, rawDiff), [row.toolCalls, rawDiff])
  const dirGroups = useMemo(() => groupByDirectory(fileStats), [fileStats])

  const totals = useMemo(() => {
    let additions = 0, deletions = 0
    for (const f of fileStats) { additions += f.additions; deletions += f.deletions }
    return { additions, deletions }
  }, [fileStats])

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      next.has(dir) ? next.delete(dir) : next.add(dir)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsedDirs((prev) =>
      prev.size === dirGroups.length
        ? new Set()
        : new Set(dirGroups.map((g) => g.dir)),
    )
  }, [dirGroups])

  const handleFileClick = useCallback((path: string) => {
    useDiffStore.getState().openToFile(path)
  }, [])

  const handleViewDiff = useCallback(() => {
    useDiffStore.getState().setOpen(true)
  }, [])

  if (fileStats.length === 0) return null

  // Cap visible files for performance
  const totalFiles = fileStats.length
  const isCapped = !showAll && totalFiles > MAX_VISIBLE_FILES

  return (
    <div className="my-2 rounded-xl border border-border/20 bg-muted/[0.06] shadow-sm" data-timeline-row-kind="changed-files">
      {/* ── Header ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/10"
      >
        {expanded
          ? <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground/50" />
          : <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
        <IconFileDiff className="size-3.5 shrink-0 text-muted-foreground/40" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Changed files
        </span>
        <span className="text-[11px] text-muted-foreground/30">({totalFiles})</span>
        <span className="mx-1 text-muted-foreground/15">&middot;</span>
        <StatBadge additions={totals.additions} deletions={totals.deletions} />
        <div className="flex-1" />
        {expanded && dirGroups.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); collapseAll() }}
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground/40 transition-colors hover:bg-muted/20 hover:text-muted-foreground/70"
          >
            {collapsedDirs.size === dirGroups.length ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleViewDiff() }}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground/40 transition-colors hover:bg-muted/20 hover:text-muted-foreground/70"
        >
          <IconEye className="size-3" />
          View diff
        </button>
      </button>

      {/* ── File list ── */}
      {expanded && (
        <div className="border-t border-border/10 py-1">
          {dirGroups.map((group) => {
            const isDirCollapsed = collapsedDirs.has(group.dir)
            // Respect the cap: skip groups that are entirely past the limit
            const visibleFiles = isCapped
              ? group.files.slice(0, Math.max(0, MAX_VISIBLE_FILES - dirGroups.indexOf(group) * 5))
              : group.files
            if (isCapped && visibleFiles.length === 0) return null

            return (
              <div key={group.dir || '__root'}>
                {group.dir && (
                  <button
                    type="button"
                    onClick={() => toggleDir(group.dir)}
                    className="flex w-full items-center gap-1.5 px-3.5 py-1.5 text-left transition-colors hover:bg-muted/10"
                  >
                    {isDirCollapsed
                      ? <IconChevronRight className="size-3 shrink-0 text-muted-foreground/30" />
                      : <IconChevronDown className="size-3 shrink-0 text-muted-foreground/30" />}
                    <IconFolder className="size-3.5 shrink-0 text-muted-foreground/30" />
                    <span className="flex-1 truncate text-[12px] text-muted-foreground/50">{group.dir}</span>
                    <StatBadge additions={group.additions} deletions={group.deletions} />
                  </button>
                )}
                {!isDirCollapsed && (isCapped ? visibleFiles : group.files).map((file) => (
                  <FileEntry key={file.path} file={file} indented={!!group.dir} onClick={handleFileClick} />
                ))}
              </div>
            )
          })}

          {isCapped && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex w-full justify-center py-2 text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
            >
              Show {totalFiles - MAX_VISIBLE_FILES} more files
            </button>
          )}
        </div>
      )}
    </div>
  )
})
