import { memo, useMemo, useState, useCallback } from 'react'
import { IconChevronRight, IconFolder, IconFolderOpen } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useDiffStore } from '@/stores/diffStore'
import { isFileMutation } from './tool-call-utils'
import type { ToolCall } from '@/types'
import type { ChangedFilesRow } from '@/lib/timeline'

// ── Types ────────────────────────────────────────────────────────

interface FileStats {
  readonly path: string
  readonly name: string
  readonly ext: string
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

// ── VS Code file icon CDN ────────────────────────────────────────

const VSCODE_ICON_BASE = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@v12.17.0/icons'

const EXT_ICON_MAP: Record<string, string> = {
  ts: 'file_type_typescript',
  tsx: 'file_type_reactts',
  js: 'file_type_js',
  jsx: 'file_type_reactjs',
  json: 'file_type_json',
  md: 'file_type_markdown',
  css: 'file_type_css',
  html: 'file_type_html',
  rs: 'file_type_rust',
  toml: 'file_type_toml',
  yaml: 'file_type_yaml',
  yml: 'file_type_yaml',
  py: 'file_type_python',
  go: 'file_type_go',
  sh: 'file_type_shell',
  svg: 'file_type_svg',
  png: 'file_type_image',
  jpg: 'file_type_image',
  lock: 'file_type_lock',
}

function getFileIconUrl(ext: string): string {
  const icon = EXT_ICON_MAP[ext] ?? 'default_file'
  return `${VSCODE_ICON_BASE}/${icon}.svg`
}

// ── Pure helpers ─────────────────────────────────────────────────

function countLines(text: string): number {
  if (!text) return 0
  let n = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++
  }
  return text.endsWith('\n') ? n : n + 1
}

function computeLineDelta(oldText: string | null | undefined, newText: string | null | undefined): { additions: number; deletions: number } {
  const oldLines = countLines(oldText ?? '')
  const newLines = countLines(newText ?? '')
  const delta = newLines - oldLines
  return delta >= 0
    ? { additions: delta || (newLines > 0 ? 1 : 0), deletions: 0 }
    : { additions: 0, deletions: -delta }
}

function extractDiffFilePaths(rawDiff: string): Set<string> {
  const paths = new Set<string>()
  if (!rawDiff) return paths
  const lines = rawDiff.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++ b/')) paths.add(line.slice(6))
    else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) paths.add(line.slice(4))
  }
  return paths
}

function extractFileStats(toolCalls: readonly ToolCall[], rawDiff: string): FileStats[] {
  const diffPaths = extractDiffFilePaths(rawDiff)
  const statsMap = new Map<string, { additions: number; deletions: number }>()

  for (const tc of toolCalls) {
    if (tc.status !== 'completed') continue
    if (!isFileMutation(tc.kind, tc.title)) continue

    const filePath = tc.locations?.[0]?.path
    if (!filePath) continue
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
    const lastSlash = path.lastIndexOf('/')
    const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
    const dotIdx = name.lastIndexOf('.')
    const ext = dotIdx > 0 ? name.slice(dotIdx + 1) : ''
    result.push({ path, name, ext, ...stats })
  }
  return result
}

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

// ── Sub-components ───────────────────────────────────────────────

const Stats = memo(function Stats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
      <span className="text-emerald-400">+{additions}</span>
      <span className="mx-0.5 text-foreground/30">/</span>
      <span className="text-red-400/80">-{deletions}</span>
    </span>
  )
})

const FileRow = memo(function FileRow({ file, depth, onClick }: { file: FileStats; depth: number; onClick: (path: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(file.path)}
      className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
      style={{ paddingLeft: depth * 14 + 8 }}
    >
      <span aria-hidden className="size-3.5 shrink-0" />
      <img
        alt=""
        aria-hidden
        className="shrink-0 size-3.5 text-foreground/30"
        loading="lazy"
        src={getFileIconUrl(file.ext)}
      />
      <span className="truncate font-mono text-[11px] text-foreground/60 group-hover:text-foreground/90">
        {file.name}
      </span>
      <Stats additions={file.additions} deletions={file.deletions} />
    </button>
  )
})

// ── Main component ───────────────────────────────────────────────

export const ChangedFilesSummary = memo(function ChangedFilesSummary({ row }: { row: ChangedFilesRow }) {
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

  const allCollapsed = collapsedDirs.size === dirGroups.length && dirGroups.length > 0

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      next.has(dir) ? next.delete(dir) : next.add(dir)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
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

  const totalFiles = fileStats.length
  const isCapped = !showAll && totalFiles > MAX_VISIBLE_FILES
  let visibleCount = 0

  return (
    <div className="mt-2 rounded-lg border border-border/80 bg-card/45 p-2.5" data-timeline-row-kind="changed-files">
      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-foreground/40">
          <span>Changed files ({totalFiles})</span>
          <span className="mx-1">&middot;</span>
          <span className="text-emerald-400">+{totals.additions}</span>
          <span className="mx-0.5 text-foreground/30">/</span>
          <span className="text-red-400/80">-{totals.deletions}</span>
        </p>
        <div className="flex items-center gap-1.5">
          {dirGroups.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md border border-input bg-popover px-2 py-0.5 text-[11px] font-medium text-foreground shadow-xs/5 transition-colors hover:bg-accent/50"
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          <button
            type="button"
            onClick={handleViewDiff}
            className="rounded-md border border-input bg-popover px-2 py-0.5 text-[11px] font-medium text-foreground shadow-xs/5 transition-colors hover:bg-accent/50"
          >
            View diff
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="space-y-0.5">
        {dirGroups.map((group) => {
          const isDirCollapsed = collapsedDirs.has(group.dir)

          return (
            <div key={group.dir || '__root'}>
              {/* Directory header */}
              {group.dir && (
                <button
                  type="button"
                  onClick={() => toggleDir(group.dir)}
                  className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
                  style={{ paddingLeft: 8 }}
                >
                  <IconChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-foreground/30 transition-transform group-hover:text-foreground/60',
                      !isDirCollapsed && 'rotate-90',
                    )}
                    aria-hidden
                  />
                  {isDirCollapsed
                    ? <IconFolder className="size-3.5 shrink-0 text-foreground/35" aria-hidden />
                    : <IconFolderOpen className="size-3.5 shrink-0 text-foreground/35" aria-hidden />}
                  <span className="truncate font-mono text-[11px] text-foreground/50 group-hover:text-foreground/80">
                    {group.dir}
                  </span>
                  <Stats additions={group.additions} deletions={group.deletions} />
                </button>
              )}

              {/* Files */}
              {!isDirCollapsed && (
                <div className="space-y-0.5">
                  {group.files.map((file) => {
                    if (isCapped && visibleCount >= MAX_VISIBLE_FILES) return null
                    visibleCount++
                    return (
                      <FileRow
                        key={file.path}
                        file={file}
                        depth={group.dir ? 1 : 0}
                        onClick={handleFileClick}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {isCapped && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex w-full justify-center py-1.5 text-[11px] text-foreground/30 transition-colors hover:text-foreground/30"
          >
            Show {totalFiles - MAX_VISIBLE_FILES} more files
          </button>
        )}
      </div>
    </div>
  )
})
