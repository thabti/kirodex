/**
 * Git History Panel — displays commit history timeline.
 * All data comes from the Rust backend via IPC. This component is a dumb
 * display layer: it fetches, renders, and dispatches user actions back to IPC.
 */
import { memo, useEffect, useState, useCallback } from 'react'
import {
  IconGitCommit, IconRefresh, IconChevronDown, IconChevronUp,
  IconArrowBackUp, IconLoader2, IconArchive,
} from '@tabler/icons-react'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface CommitEntry {
  shortOid: string
  oid: string
  subject: string
  body: string
  authorName: string
  authorEmail: string
  timestamp: number
  additions: number
  deletions: number
  fileCount: number
  parents: string[]
  isHead: boolean
}

interface StashEntry {
  index: number
  message: string
  oid: string
  timestamp: number
}

interface GitHistoryPanelProps {
  workspace: string
  onViewDiff?: (patch: string) => void
}

function relativeTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

export const GitHistoryPanel = memo(function GitHistoryPanel({ workspace, onViewDiff }: GitHistoryPanelProps) {
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedOid, setExpandedOid] = useState<string | null>(null)
  const [showStashes, setShowStashes] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    try {
      const [history, stashList] = await Promise.all([
        ipc.gitCommitHistory(workspace, 50),
        ipc.gitStashList(workspace).catch(() => [] as StashEntry[]),
      ])
      setCommits(history)
      setStashes(stashList)
    } catch {
      setCommits([])
      setStashes([])
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => { void fetchHistory() }, [fetchHistory])

  const handleViewDiff = useCallback(async (oid: string) => {
    if (!workspace || !onViewDiff) return
    try {
      const patch = await ipc.gitCommitDiff(workspace, oid)
      onViewDiff(patch)
    } catch { /* ignore */ }
  }, [workspace, onViewDiff])

  const handleStashPop = useCallback(async (index: number) => {
    if (!workspace) return
    try {
      await ipc.gitStashPop(workspace, index)
      void fetchHistory()
    } catch { /* ignore */ }
  }, [workspace, fetchHistory])

  const handleStashDrop = useCallback(async (index: number) => {
    if (!workspace) return
    try {
      await ipc.gitStashDrop(workspace, index)
      void fetchHistory()
    } catch { /* ignore */ }
  }, [workspace, fetchHistory])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/80">
          <IconGitCommit className="size-3.5" />
          <span>Commit History</span>
          {commits.length > 0 && (
            <span className="text-muted-foreground/50">({commits.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {stashes.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowStashes(!showStashes)}
                  className={cn(
                    'rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground',
                    showStashes && 'bg-accent text-foreground',
                  )}
                >
                  <IconArchive className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Stashes ({stashes.length})</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void fetchHistory()}
                className="rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              >
                {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRefresh className="size-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stash section */}
      {showStashes && stashes.length > 0 && (
        <div className="border-b border-border/40 bg-muted/20 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground/60">STASHES</div>
          {stashes.map((stash) => (
            <div key={stash.oid} className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-accent/50">
              <IconArchive className="size-3 shrink-0 text-muted-foreground/50" />
              <span className="min-w-0 flex-1 truncate text-foreground/80">{stash.message || `stash@{${stash.index}}`}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/40">{relativeTime(stash.timestamp)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void handleStashPop(stash.index)}
                    className="rounded p-0.5 text-muted-foreground/50 hover:text-green-500"
                  >
                    <IconArrowBackUp className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Pop stash</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {loading && commits.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
            <IconLoader2 className="mr-2 size-4 animate-spin" />
            Loading history…
          </div>
        )}
        {!loading && commits.length === 0 && (
          <div className="py-8 text-center text-[12px] text-muted-foreground/50">
            No commits found
          </div>
        )}
        {commits.map((commit) => (
          <div
            key={commit.oid}
            className={cn(
              'group border-b border-border/20 px-3 py-2 transition-colors hover:bg-accent/30',
              commit.isHead && 'bg-accent/10',
            )}
          >
            <div className="flex items-start gap-2">
              {/* Timeline dot */}
              <div className="mt-1.5 flex flex-col items-center">
                <div className={cn(
                  'size-2 rounded-full',
                  commit.isHead ? 'bg-blue-500' : 'bg-muted-foreground/30',
                )} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
                    {commit.subject}
                  </span>
                  {commit.isHead && (
                    <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
                      HEAD
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/50">
                  <code className="font-mono">{commit.shortOid}</code>
                  <span>·</span>
                  <span>{commit.authorName}</span>
                  <span>·</span>
                  <span>{relativeTime(commit.timestamp)}</span>
                  {commit.fileCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-600 dark:text-emerald-400">+{commit.additions}</span>
                      <span className="text-red-600 dark:text-red-400">-{commit.deletions}</span>
                      <span>({commit.fileCount} files)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onViewDiff && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void handleViewDiff(commit.oid)}
                        className="rounded p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground"
                      >
                        <IconChevronDown className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>View diff</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
