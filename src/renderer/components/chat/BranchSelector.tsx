import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconGitBranch,
  IconChevronDown,
  IconSearch,
  IconPlus,
  IconCheck,
  IconLoader2,
  IconGitFork,
  IconArrowLeft,
} from '@tabler/icons-react'
import { cn, slugify } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'

// ── Types ──────────────────────────────────────────────────────────────

interface LocalBranch {
  name: string
  current: boolean
  worktreeLocked: boolean
}

interface RemoteBranch {
  name: string
  fullRef: string
}

interface BranchData {
  local: LocalBranch[]
  remotes: Record<string, RemoteBranch[]>
  currentBranch: string
}

interface BranchSelectorProps {
  workspace: string | null
  isWorktree?: boolean
}

type InlineMode = 'none' | 'branch' | 'worktree'

// ── Component ──────────────────────────────────────────────────────────

export const BranchSelector = memo(function BranchSelector({ workspace, isWorktree }: BranchSelectorProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<BranchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [inlineMode, setInlineMode] = useState<InlineMode>('none')
  const [inlineValue, setInlineValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflictBranch, setConflictBranch] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch branches ──────────────────────────────────────────────────

  const fetchBranches = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    try {
      const result = await ipc.gitListBranches(workspace)
      setData(result)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [workspace])

  // Fetch current branch on mount + refresh on window focus
  useEffect(() => {
    fetchBranches()
    const handleFocus = () => { fetchBranches() }
    window.addEventListener('focus', handleFocus)
    return () => { window.removeEventListener('focus', handleFocus) }
  }, [fetchBranches])

  // On open, refresh and focus search
  useEffect(() => {
    if (!open) {
      setSearch('')
      setInlineMode('none')
      setInlineValue('')
      setError(null)
      setConflictBranch(null)
      return
    }
    fetchBranches()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, fetchBranches])

  // Focus inline input when mode changes
  useEffect(() => {
    if (inlineMode !== 'none') {
      requestAnimationFrame(() => inlineInputRef.current?.focus())
    }
  }, [inlineMode])

  // Click outside → close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Esc → close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineMode !== 'none') {
          setInlineMode('none')
          setInlineValue('')
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, inlineMode])

  // ── Filter logic ────────────────────────────────────────────────────

  const normalizedSearch = search.trim().toLowerCase()

  const filteredLocal = useMemo(() => {
    if (!data) return []
    if (!normalizedSearch) return data.local
    return data.local.filter((b) => b.name.toLowerCase().includes(normalizedSearch))
  }, [data, normalizedSearch])

  const filteredRemotes = useMemo(() => {
    if (!data) return {} as Record<string, RemoteBranch[]>
    const result: Record<string, RemoteBranch[]> = {}
    for (const [remote, branches] of Object.entries(data.remotes)) {
      const filtered = normalizedSearch
        ? branches.filter(
            (b) =>
              b.name.toLowerCase().includes(normalizedSearch) ||
              b.fullRef.toLowerCase().includes(normalizedSearch),
          )
        : branches
      if (filtered.length > 0) result[remote] = filtered
    }
    return result
  }, [data, normalizedSearch])

  const hasResults = filteredLocal.length > 0 || Object.keys(filteredRemotes).length > 0

  // Can create new branch from search?
  const canCreate =
    search.trim().length > 0 &&
    !data?.local.some((b) => b.name === search.trim()) &&
    !checkingOut

  // ── Actions ─────────────────────────────────────────────────────────

  const friendlyGitError = (raw: string): { message: string; isConflict: boolean } => {
    const lower = raw.toLowerCase()
    if (lower.includes('conflict'))
      return { message: 'Uncommitted changes conflict with this branch. Commit or stash your changes first.', isConflict: true }
    if (lower.includes('not found') || lower.includes('revspec'))
      return { message: 'Branch not found. It may have been deleted.', isConflict: false }
    if (lower.includes('worktree') || lower.includes('checked out'))
      return { message: 'This branch is checked out in another worktree and cannot be switched to.', isConflict: false }
    if (lower.includes('lock') || lower.includes('locked'))
      return { message: 'The repository is locked by another process. Try again in a moment.', isConflict: false }
    if (lower.includes('already exists'))
      return { message: 'A branch with this name already exists.', isConflict: false }
    return { message: raw, isConflict: false }
  }

  const handleCheckout = useCallback(
    async (branch: string, force?: boolean) => {
      if (!workspace || checkingOut) return
      if (isWorktree) {
        setError('Cannot switch branches in a worktree thread. The branch is locked to this worktree.')
        return
      }
      setCheckingOut(true)
      setError(null)
      setConflictBranch(null)
      try {
        await ipc.gitCheckout(workspace, branch, force)
        await fetchBranches()
        setOpen(false)
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        const { message, isConflict } = friendlyGitError(raw)
        if (isConflict && !force) {
          setError(message)
          setConflictBranch(branch)
        } else {
          setError(message)
          setConflictBranch(null)
        }
      } finally {
        setCheckingOut(false)
      }
    },
    [workspace, checkingOut, fetchBranches, isWorktree],
  )

  const handleCreate = useCallback(
    async (name: string) => {
      if (!workspace || checkingOut) return
      const branchName = slugify(name.trim())
      if (!branchName) return
      setCheckingOut(true)
      setError(null)
      try {
        await ipc.gitCreateBranch(workspace, branchName)
        await fetchBranches()
        setOpen(false)
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        setError(friendlyGitError(raw).message)
      } finally {
        setCheckingOut(false)
      }
    },
    [workspace, checkingOut, fetchBranches],
  )

  const handleCreateWorktree = useCallback(
    async (slug: string) => {
      if (!workspace || checkingOut) return
      const normalizedSlug = slugify(slug.trim())
      if (!normalizedSlug) return
      // Worktree must be created from the project root, not from inside another worktree
      const task = useTaskStore.getState().selectedTaskId
        ? useTaskStore.getState().tasks[useTaskStore.getState().selectedTaskId!]
        : null
      const projectRoot = task?.originalWorkspace ?? workspace
      setCheckingOut(true)
      try {
        await ipc.gitWorktreeCreate(projectRoot, normalizedSlug)
        await fetchBranches()
      } catch (err) {
        console.error('[branch-selector] worktree create failed:', err)
      } finally {
        setCheckingOut(false)
        setOpen(false)
      }
    },
    [workspace, checkingOut, fetchBranches],
  )

  const handleInlineSubmit = useCallback(() => {
    const trimmed = inlineValue.trim()
    if (!trimmed || checkingOut) return
    if (inlineMode === 'branch') {
      handleCreate(trimmed)
    } else if (inlineMode === 'worktree') {
      handleCreateWorktree(trimmed)
    }
  }, [inlineMode, inlineValue, checkingOut, handleCreate, handleCreateWorktree])

  // ── Current branch label ────────────────────────────────────────────

  const currentBranch = data?.currentBranch || data?.local.find((b) => b.current)?.name

  if (!workspace) return null

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        data-testid="branch-selector-button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[14px] font-medium transition-colors',
          'text-muted-foreground hover:text-foreground/80',
          open && 'text-foreground/80',
        )}
      >
        <IconGitBranch className="size-3" />
        <span className="max-w-[120px] truncate">{currentBranch ?? 'branch'}</span>
        {isWorktree && <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-medium text-violet-500 dark:text-violet-400">WT</span>}
        <IconChevronDown className={cn('size-3 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Popup */}
      {open && (
        <div
          data-testid="branch-selector-popup"
          className="absolute bottom-full right-0 z-[9999] mb-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-1.5">
              <IconSearch className="size-3.5 shrink-0 text-muted-foreground/70" />
              <input
                ref={inputRef}
                type="text"
                data-testid="branch-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault()
                    handleCreate(search)
                  }
                }}
                placeholder="Search branches"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Branch list */}
          <div className="max-h-64 overflow-y-auto scroll-smooth">
            {error && (
              <div className="mx-2 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
                {conflictBranch && (
                  <button
                    type="button"
                    onClick={() => handleCheckout(conflictBranch, true)}
                    disabled={checkingOut}
                    className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                  >
                    Force checkout (discard local changes)
                  </button>
                )}
              </div>
            )}
            {isWorktree && (
              <div className="mx-2 mt-2 flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-[11px] text-violet-600 dark:text-violet-400">
                <IconGitBranch className="size-3 shrink-0" aria-hidden />
                Branch locked to this worktree
              </div>
            )}
            {loading && !data ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <IconLoader2 className="size-3.5 animate-spin" />
                Loading branches...
              </div>
            ) : !hasResults && !canCreate ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No branches found.
              </div>
            ) : (
              <>
                {/* Local branches */}
                {filteredLocal.length > 0 && (
                  <div className="py-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Branches
                    </div>
                    {filteredLocal.map((branch) => (
                      <BranchItem
                        key={branch.name}
                        name={branch.name}
                        isCurrent={branch.current}
                        disabled={checkingOut || branch.worktreeLocked || (!!isWorktree && !branch.current)}
                        badge={branch.worktreeLocked ? 'worktree' : undefined}
                        onClick={() => handleCheckout(branch.name)}
                      />
                    ))}
                  </div>
                )}

                {/* Remote branches grouped by remote name */}
                {Object.entries(filteredRemotes).map(([remoteName, branches]) => (
                  <div key={remoteName} className="py-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {remoteName}
                    </div>
                    {branches.map((branch) => (
                      <BranchItem
                        key={branch.fullRef}
                        name={branch.name}
                        isCurrent={false}
                        badge="remote"
                        disabled={checkingOut || !!isWorktree}
                        onClick={() => handleCheckout(branch.fullRef)}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Create new branch from search */}
          {canCreate && (
            <>
              <div className="mx-3 border-t border-border" />
              <button
                type="button"
                onClick={() => handleCreate(search)}
                disabled={checkingOut}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <IconPlus className="size-3.5" />
                <span>
                  Create and checkout <span className="font-medium text-foreground">{search.trim()}</span>
                </span>
              </button>
            </>
          )}

          {/* Actions footer */}
          <div className="border-t border-border">
            {inlineMode === 'none' ? (
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Create new branch"
                  onClick={() => setInlineMode('branch')}
                  disabled={checkingOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <IconPlus className="size-3.5" />
                  <span>New branch</span>
                </button>
                <button
                  type="button"
                  aria-label="Create new worktree"
                  onClick={() => setInlineMode('worktree')}
                  disabled={checkingOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <IconGitFork className="size-3.5" />
                  <span>New worktree</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Go back"
                    onClick={() => { setInlineMode('none'); setInlineValue('') }}
                    className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <IconArrowLeft className="size-3.5" />
                  </button>
                  <span className="text-xs font-medium text-foreground">
                    {inlineMode === 'branch' ? 'Create branch' : 'Create worktree'}
                  </span>
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                  {inlineMode === 'branch'
                    ? 'Enter a name for the new branch. It will be checked out after creation.'
                    : 'Enter a slug for the worktree. A new branch and working directory will be created.'}
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={inlineInputRef}
                    type="text"
                    value={inlineValue}
                    onChange={(e) => setInlineValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleInlineSubmit()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setInlineMode('none')
                        setInlineValue('')
                      }
                    }}
                    placeholder={inlineMode === 'branch' ? 'feat/my-feature' : 'my-feature'}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30"
                  />
                  <button
                    type="button"
                    aria-label={inlineMode === 'branch' ? 'Create branch' : 'Create worktree'}
                    onClick={handleInlineSubmit}
                    disabled={!inlineValue.trim() || checkingOut}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {checkingOut ? (
                      <IconLoader2 className="size-3 animate-spin" />
                    ) : inlineMode === 'branch' ? (
                      <IconGitBranch className="size-3" />
                    ) : (
                      <IconGitFork className="size-3" />
                    )}
                    {checkingOut ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

// ── Branch item ──────────────────────────────────────────────────────

function BranchItem({
  name,
  isCurrent,
  badge,
  disabled,
  onClick,
}: {
  name: string
  isCurrent: boolean
  badge?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50',
        isCurrent ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isCurrent && <IconCheck className="size-3.5 shrink-0 text-foreground" />}
      {badge && !isCurrent && (
        <span className={cn('shrink-0 text-[10px]', badge === 'worktree' ? 'rounded bg-violet-500/15 px-1 py-0.5 text-violet-500 dark:text-violet-400' : 'text-muted-foreground')}>{badge}</span>
      )}
    </button>
  )
}
