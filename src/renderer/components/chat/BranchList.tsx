import { memo, useMemo } from 'react'
import { IconGitBranch, IconSearch, IconPlus, IconCheck, IconLoader2, IconTrash } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface LocalBranch { name: string; current: boolean; worktreeLocked: boolean }
export interface RemoteBranch { name: string; fullRef: string }
export interface BranchData { local: LocalBranch[]; remotes: Record<string, RemoteBranch[]>; currentBranch: string }

interface BranchListProps {
  data: BranchData | null
  loading: boolean
  search: string
  checkingOut: boolean
  isWorktree?: boolean
  error: string | null
  conflictBranch: string | null
  canCreate: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onSearchChange: (value: string) => void
  onSearchKeyDown: (e: React.KeyboardEvent) => void
  onCheckout: (branch: string, force?: boolean) => void
  onCreate: (name: string) => void
  onDelete?: (branch: string) => void
}

const BranchItem = ({ name, isCurrent, badge, disabled, onClick, onDelete }: { name: string; isCurrent: boolean; badge?: string; disabled?: boolean; onClick: () => void; onDelete?: () => void }) => (
  <div className="group relative flex w-full items-center transition-colors hover:bg-accent">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn('flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50', isCurrent ? 'text-foreground' : 'text-muted-foreground')}
    >
      <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isCurrent && <IconCheck className="size-3.5 shrink-0 text-foreground" />}
      {badge && !isCurrent && (
        <span className={cn('shrink-0 text-[10px]', badge === 'worktree' ? 'rounded bg-violet-500/15 px-1 py-0.5 text-violet-500 dark:text-violet-400' : 'text-muted-foreground')}>{badge}</span>
      )}
    </button>
    {onDelete && !isCurrent && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label={`Delete branch ${name}`}
        tabIndex={0}
        className="absolute right-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!bg-destructive/15 hover:!text-destructive"
      >
        <IconTrash className="size-3" />
      </button>
    )}
  </div>
)

export const BranchList = memo(function BranchList({
  data, loading, search, checkingOut, isWorktree,
  error, conflictBranch, canCreate,
  inputRef, onSearchChange, onSearchKeyDown,
  onCheckout, onCreate, onDelete,
}: BranchListProps) {
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
        ? branches.filter((b) => b.name.toLowerCase().includes(normalizedSearch) || b.fullRef.toLowerCase().includes(normalizedSearch))
        : branches
      if (filtered.length > 0) result[remote] = filtered
    }
    return result
  }, [data, normalizedSearch])

  const hasResults = filteredLocal.length > 0 || Object.keys(filteredRemotes).length > 0

  return (
    <>
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-1.5">
          <IconSearch className="size-3.5 shrink-0 text-muted-foreground/70" />
          <input
            ref={inputRef}
            type="text"
            data-testid="branch-search-input"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search branches"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto scroll-smooth">
        {error && (
          <div className="mx-2 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
            {conflictBranch && (
              <button
                type="button"
                onClick={() => onCheckout(conflictBranch, true)}
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
          <div className="py-6 text-center text-xs text-muted-foreground">No branches found.</div>
        ) : (
          <>
            {filteredLocal.length > 0 && (
              <div className="py-1">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Branches</div>
                {filteredLocal.map((branch) => (
                  <BranchItem
                    key={branch.name}
                    name={branch.name}
                    isCurrent={branch.current}
                    disabled={checkingOut || branch.worktreeLocked || (!!isWorktree && !branch.current)}
                    badge={branch.worktreeLocked ? 'worktree' : undefined}
                    onClick={() => onCheckout(branch.name)}
                    onDelete={!branch.current && !branch.worktreeLocked && onDelete ? () => onDelete(branch.name) : undefined}
                  />
                ))}
              </div>
            )}
            {Object.entries(filteredRemotes).map(([remoteName, branches]) => (
              <div key={remoteName} className="py-1">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{remoteName}</div>
                {branches.map((branch) => (
                  <BranchItem key={branch.fullRef} name={branch.name} isCurrent={false} badge="remote" disabled={checkingOut || !!isWorktree} onClick={() => onCheckout(branch.fullRef)} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      {canCreate && (
        <>
          <div className="mx-3 border-t border-border" />
          <button
            type="button"
            onClick={() => onCreate(search)}
            disabled={checkingOut}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <IconPlus className="size-3.5" />
            <span>Create and checkout <span className="font-medium text-foreground">{search.trim()}</span></span>
          </button>
        </>
      )}
    </>
  )
})
