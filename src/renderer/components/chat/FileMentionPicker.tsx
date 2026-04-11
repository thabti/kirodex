import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { IconRobot, IconTool } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useSettingsStore } from '@/stores/settingsStore'
import { useKiroStore } from '@/stores/kiroStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ProjectFile } from '@/types'

// ── File type icon by extension ──────────────────────────────────────
const EXT_ICONS: Record<string, { label: string; cls: string }> = {
  ts:    { label: 'TS',  cls: 'bg-blue-500/20 text-blue-400' },
  tsx:   { label: 'TSX', cls: 'bg-blue-500/20 text-blue-400' },
  js:    { label: 'JS',  cls: 'bg-yellow-500/20 text-yellow-400' },
  jsx:   { label: 'JSX', cls: 'bg-yellow-500/20 text-yellow-400' },
  rs:    { label: 'RS',  cls: 'bg-orange-500/20 text-orange-400' },
  toml:  { label: 'TL',  cls: 'bg-gray-500/20 text-gray-400' },
  json:  { label: '{}',  cls: 'bg-green-500/20 text-green-400' },
  md:    { label: 'MD',  cls: 'bg-blue-500/20 text-blue-400' },
  css:   { label: 'CSS', cls: 'bg-pink-500/20 text-pink-400' },
  html:  { label: 'HTM', cls: 'bg-red-500/20 text-red-400' },
  yml:   { label: 'YML', cls: 'bg-rose-500/20 text-rose-400' },
  yaml:  { label: 'YML', cls: 'bg-rose-500/20 text-rose-400' },
  py:    { label: 'PY',  cls: 'bg-emerald-500/20 text-emerald-400' },
  go:    { label: 'GO',  cls: 'bg-cyan-500/20 text-cyan-400' },
  sh:    { label: 'SH',  cls: 'bg-gray-500/20 text-gray-400' },
  svg:   { label: 'SVG', cls: 'bg-violet-500/20 text-violet-400' },
  png:   { label: 'IMG', cls: 'bg-teal-500/20 text-teal-400' },
  jpg:   { label: 'IMG', cls: 'bg-teal-500/20 text-teal-400' },
  lock:  { label: 'LCK', cls: 'bg-gray-500/20 text-gray-500' },
}

const FileIcon = memo(function FileIcon({ ext, isDir }: { ext: string; isDir: boolean }) {
  if (isDir) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-400">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </span>
    )
  }
  const info = EXT_ICONS[ext.toLowerCase()]
  if (info) {
    return (
      <span className={cn('flex h-5 w-5 items-center justify-center rounded text-[8px] font-bold', info.cls)}>
        {info.label}
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    </span>
  )
})

// ── Git change badge ─────────────────────────────────────────────────
const GIT_STATUS_INFO: Record<string, { label: string; tooltip: string; cls: string; bgCls: string }> = {
  M: { label: 'M', tooltip: 'Modified', cls: 'text-amber-400', bgCls: 'bg-amber-500/15 border-amber-500/20' },
  A: { label: 'A', tooltip: 'Added (untracked)', cls: 'text-emerald-400', bgCls: 'bg-emerald-500/15 border-emerald-500/20' },
  D: { label: 'D', tooltip: 'Deleted', cls: 'text-red-400', bgCls: 'bg-red-500/15 border-red-500/20' },
  R: { label: 'R', tooltip: 'Renamed', cls: 'text-blue-400', bgCls: 'bg-blue-500/15 border-blue-500/20' },
}

const GitChangeBadge = memo(function GitChangeBadge({
  status, linesAdded, linesDeleted,
}: {
  status?: string; linesAdded?: number; linesDeleted?: number
}) {
  if (!status) return null
  const info = GIT_STATUS_INFO[status]
  if (!info) return null

  const added = linesAdded ?? 0
  const deleted = linesDeleted ?? 0
  const hasLineInfo = added > 0 || deleted > 0

  const tooltipLines = [info.tooltip]
  if (hasLineInfo) {
    const parts: string[] = []
    if (added > 0) parts.push(`+${added} line${added !== 1 ? 's' : ''}`)
    if (deleted > 0) parts.push(`-${deleted} line${deleted !== 1 ? 's' : ''}`)
    tooltipLines.push(parts.join(', '))
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-md border px-1 py-px text-[10px] font-medium leading-none',
          info.bgCls,
        )}>
          <span className={cn('font-bold', info.cls)}>{info.label}</span>
          {hasLineInfo && (
            <>
              {added > 0 && <span className="text-emerald-400">+{added}</span>}
              {deleted > 0 && <span className="text-red-400">-{deleted}</span>}
            </>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {tooltipLines.map((line, i) => (
          <span key={i} className={i > 0 ? 'block text-muted-foreground' : ''}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
})

// ── Relative time formatter ──────────────────────────────────────────
const formatRelativeTime = (epochSecs: number): string => {
  if (epochSecs <= 0) return ''
  const now = Date.now() / 1000
  const diff = Math.max(0, now - epochSecs)

  if (diff < 60) return 'just now'
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return `${m}m ago`
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return `${h}h ago`
  }
  if (diff < 604800) {
    const d = Math.floor(diff / 86400)
    return `${d}d ago`
  }
  if (diff < 2592000) {
    const w = Math.floor(diff / 604800)
    return `${w}w ago`
  }
  const mo = Math.floor(diff / 2592000)
  return `${mo}mo ago`
}

// ── Fuzzy search scoring (t3code-acp inspired) ──────────────────────
const fuzzyScore = (query: string, target: string): number | null => {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact match
  if (t === q) return 0
  // Starts with
  if (t.startsWith(q)) return 1
  // Contains
  const containsIdx = t.indexOf(q)
  if (containsIdx >= 0) return 2 + containsIdx

  // Subsequence match
  let qi = 0
  let firstMatch = -1
  let gaps = 0
  let lastMatch = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti
      if (lastMatch >= 0 && ti - lastMatch > 1) gaps += ti - lastMatch - 1
      lastMatch = ti
      qi++
    }
  }

  if (qi < q.length) return null // no match

  const span = lastMatch - firstMatch + 1
  return 100 + firstMatch * 2 + gaps * 3 + span
}

const searchFiles = (files: ProjectFile[], query: string, limit: number = 50): ProjectFile[] => {
  const q = query.replace(/^[@./]+/, '').trim()
  if (!q) return files.slice(0, limit)

  const scored: Array<{ file: ProjectFile; score: number }> = []

  for (const file of files) {
    // Score against basename first, then full path
    const nameScore = fuzzyScore(q, file.name)
    const pathScore = fuzzyScore(q, file.path)
    const best = nameScore !== null && pathScore !== null
      ? Math.min(nameScore, pathScore + 50)
      : nameScore ?? (pathScore !== null ? pathScore + 50 : null)

    if (best !== null) {
      scored.push({ file, score: best })
    }
  }

  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.file)
}

// ── File mention pill (rendered in textarea overlay) ─────────────────
export const FileMentionPill = memo(function FileMentionPill({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const isAgent = path.startsWith('agent:')
  const isSkill = path.startsWith('skill:')
  const name = isAgent || isSkill ? path.split(':').slice(1).join(':') : (path.split('/').pop() ?? path)
  const ext = (!isAgent && !isSkill && name.includes('.')) ? name.split('.').pop() ?? '' : ''

  const icon = isAgent
    ? <IconRobot className="size-3.5 text-purple-400" />
    : isSkill
      ? <IconTool className="size-3.5 text-yellow-400" />
      : <FileIcon ext={ext} isDir={false} />

  return (
    <span className={cn(
      'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium align-middle',
      isAgent ? 'bg-blue-500/15 text-blue-300' :
      isSkill ? 'bg-yellow-500/15 text-yellow-300' :
      'bg-accent/60 text-foreground/70',
    )}>
      {icon}
      <span className="max-w-[160px] truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 flex size-4 items-center justify-center rounded text-current/40 hover:text-destructive"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l6 6M7 1l-6 6" />
          </svg>
        </button>
      )}
    </span>
  )
})

// ── Main picker component ────────────────────────────────────────────
interface FileMentionPickerProps {
  query: string
  workspace: string | null
  onSelect: (file: ProjectFile) => void
  onDismiss: () => void
  activeIndex: number
}

export const FileMentionPicker = memo(function FileMentionPicker({
  query, workspace, onSelect, onDismiss, activeIndex,
}: FileMentionPickerProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(false)
  const filesRef = useRef<ProjectFile[]>([])
  const respectGitignore = useSettingsStore((s) => s.settings.respectGitignore ?? true)
  const agents = useKiroStore((s) => s.config.agents)
  const skills = useKiroStore((s) => s.config.skills)

  // Ensure kiro config is loaded
  useEffect(() => {
    if (!useKiroStore.getState().loaded) {
      useKiroStore.getState().loadConfig(workspace ?? undefined)
    }
  }, [workspace])

  // Load project files once when workspace changes
  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    setLoading(true)
    ipc.listProjectFiles(workspace, respectGitignore).then((result) => {
      if (cancelled) return
      filesRef.current = result
      setFiles(result)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [workspace, respectGitignore])

  // Build kiro items filtered by query
  const q = (query ?? '').replace(/^[@./]+/, '').trim().toLowerCase()
  const kiroItems: Array<{ type: 'agent' | 'skill'; name: string; description?: string }> = []
  for (const a of agents) {
    if (!q || a.name.toLowerCase().includes(q)) {
      kiroItems.push({ type: 'agent', name: a.name, description: a.description })
    }
  }
  for (const s of skills) {
    if (!q || s.name.toLowerCase().includes(q)) {
      kiroItems.push({ type: 'skill', name: s.name })
    }
  }

  // Update filtered results when query changes
  const filtered = query ? searchFiles(filesRef.current, query) : filesRef.current.slice(0, 50)
  const totalItems = kiroItems.length + filtered.length

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Listen for keyboard selection from ChatInput
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index ?? 0
      const normalizedIdx = idx % totalItems
      if (normalizedIdx < kiroItems.length) {
        const item = kiroItems[normalizedIdx]
        const prefix = item.type === 'agent' ? 'agent' : 'skill'
        onSelect({ path: `${prefix}:${item.name}`, name: item.name, dir: '', isDir: false, ext: '', gitStatus: '', linesAdded: 0, linesDeleted: 0, modifiedAt: 0 })
      } else {
        const file = filtered[(normalizedIdx - kiroItems.length) % filtered.length]
        if (file) onSelect(file)
      }
    }
    document.addEventListener('file-mention-select', handler)
    return () => document.removeEventListener('file-mention-select', handler)
  }, [filtered, kiroItems, totalItems, onSelect])

  if (loading) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground/50">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Loading project files…
        </div>
      </div>
    )
  }

  if (totalItems === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
        <p className="px-3 py-3 text-xs text-muted-foreground/50">No files found</p>
      </div>
    )
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-[300] mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
      role="listbox"
      aria-label="File mentions"
    >
      <ul ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
        {kiroItems.map((item, i) => {
          const isActive = i === activeIndex % totalItems
          return (
            <li
              key={`${item.type}:${item.name}`}
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect({ path: `${item.type}:${item.name}`, name: item.name, dir: '', isDir: false, ext: '', gitStatus: '', linesAdded: 0, linesDeleted: 0, modifiedAt: 0 })
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors',
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span className={cn(
                'flex h-5 w-5 items-center justify-center rounded text-[9px]',
                item.type === 'agent' ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400',
              )}>
                {item.type === 'agent' ? <IconRobot className="size-3" /> : <IconTool className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium">{item.name}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/30">{item.type}</span>
            </li>
          )
        })}
        {kiroItems.length > 0 && filtered.length > 0 && (
          <li className="mx-3 my-1 border-t border-border/20" role="separator" />
        )}
        {filtered.map((file, i) => {
          const globalIdx = kiroItems.length + i
          const isActive = globalIdx === activeIndex % totalItems
          return (
            <li
              key={file.path}
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => { e.preventDefault(); onSelect(file) }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors',
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <FileIcon ext={file.ext} isDir={file.isDir} />
              <span className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium">{file.name}</span>
                <GitChangeBadge status={file.gitStatus} linesAdded={file.linesAdded} linesDeleted={file.linesDeleted} />
              </span>
              {file.modifiedAt > 0 && !file.isDir && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/30">
                  {formatRelativeTime(file.modifiedAt)}
                </span>
              )}
              {file.dir && (
                <span className="shrink-0 truncate text-[11px] text-muted-foreground/40 max-w-[180px]">
                  {file.dir}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
})
