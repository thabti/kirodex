import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconGitBranch, IconChevronDown, IconSearch, IconPlus, IconCheck, IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'

// ── Types ──────────────────────────────────────────────────────────────

interface LocalBranch {
  name: string
  current: boolean
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
}

// ── Component ──────────────────────────────────────────────────────────

export const BranchSelector = memo(function BranchSelector({ workspace }: BranchSelectorProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<BranchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Fetch current branch on mount
  useEffect(() => { fetchBranches() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // On open, refresh and focus search
  useEffect(() => {
    if (!open) { setSearch(''); return }
    fetchBranches()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, fetchBranches])

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
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

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

  // Can create new branch?
  const canCreate =
    search.trim().length > 0 &&
    !data?.local.some((b) => b.name === search.trim()) &&
    !checkingOut

  // ── Actions ─────────────────────────────────────────────────────────

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!workspace || checkingOut) return
      setCheckingOut(true)
      try {
        await ipc.gitCheckout(workspace, branch)
        await fetchBranches()
      } catch (err) {
        console.error('[branch-selector] checkout failed:', err)
      } finally {
        setCheckingOut(false)
        setOpen(false)
      }
    },
    [workspace, checkingOut, fetchBranches],
  )

  const handleCreate = useCallback(
    async (name: string) => {
      if (!workspace || checkingOut) return
      const trimmed = name.trim()
      if (!trimmed) return
      setCheckingOut(true)
      try {
        await ipc.gitCreateBranch(workspace, trimmed)
        await fetchBranches()
      } catch (err) {
        console.error('[branch-selector] create failed:', err)
      } finally {
        setCheckingOut(false)
        setOpen(false)
      }
    },
    [workspace, checkingOut, fetchBranches],
  )

  // ── Current branch label ────────────────────────────────────────────

  const currentBranch = data?.currentBranch || data?.local.find((b) => b.current)?.name

  if (!workspace) return null

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-colors',
          'text-muted-foreground/60 hover:text-foreground/80',
          open && 'text-foreground/80',
        )}
      >
        <IconGitBranch className="size-3" />
        <span className="max-w-[120px] truncate">{currentBranch ?? 'branch'}</span>
        <IconChevronDown className={cn('size-3 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute bottom-full left-0 z-[200] mb-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-1.5">
              <IconSearch className="size-3.5 shrink-0 text-muted-foreground/50" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault()
                    handleCreate(search)
                  }
                }}
                placeholder="Search branches"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {/* Branch list */}
          <div className="max-h-64 overflow-y-auto scroll-smooth">
            {loading && !data ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground/60">
                <IconLoader2 className="size-3.5 animate-spin" />
                Loading branches...
              </div>
            ) : !hasResults && !canCreate ? (
              <div className="py-6 text-center text-xs text-muted-foreground/50">
                No branches found.
              </div>
            ) : (
              <>
                {/* Local branches */}
                {filteredLocal.length > 0 && (
                  <div className="py-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                      Branches
                    </div>
                    {filteredLocal.map((branch) => (
                      <BranchItem
                        key={branch.name}
                        name={branch.name}
                        isCurrent={branch.current}
                        disabled={checkingOut}
                        onClick={() => handleCheckout(branch.name)}
                      />
                    ))}
                  </div>
                )}

                {/* Remote branches grouped by remote name */}
                {Object.entries(filteredRemotes).map(([remoteName, branches]) => (
                  <div key={remoteName} className="py-1">
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                      {remoteName}
                    </div>
                    {branches.map((branch) => (
                      <BranchItem
                        key={branch.fullRef}
                        name={branch.name}
                        isCurrent={false}
                        badge="remote"
                        disabled={checkingOut}
                        onClick={() => handleCheckout(branch.fullRef)}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Create new branch footer */}
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
      <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground/40" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isCurrent && <IconCheck className="size-3.5 shrink-0 text-foreground" />}
      {badge && !isCurrent && (
        <span className="shrink-0 text-[10px] text-muted-foreground/40">{badge}</span>
      )}
    </button>
  )
}
