import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { IconGitBranch, IconChevronDown } from '@tabler/icons-react'
import { cn, slugify } from '@/lib/utils'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import { BranchList } from './BranchList'
import { CreateBranchDialog } from './CreateBranchDialog'
import type { BranchData } from './BranchList'
import type { InlineMode } from './CreateBranchDialog'

interface BranchSelectorProps {
  workspace: string | null
  isWorktree?: boolean
}

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

  useEffect(() => {
    fetchBranches()
    const handleFocus = () => { fetchBranches() }
    window.addEventListener('focus', handleFocus)
    return () => { window.removeEventListener('focus', handleFocus) }
  }, [fetchBranches])

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

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineMode !== 'none') { setInlineMode('none'); setInlineValue('') }
        else { setOpen(false) }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, inlineMode])

  const friendlyGitError = (raw: string): { message: string; isConflict: boolean } => {
    const lower = raw.toLowerCase()
    if (lower.includes('conflict')) return { message: 'Uncommitted changes conflict with this branch. Commit or stash your changes first.', isConflict: true }
    if (lower.includes('not found') || lower.includes('revspec')) return { message: 'Branch not found. It may have been deleted.', isConflict: false }
    if (lower.includes('worktree') || lower.includes('checked out')) return { message: 'This branch is checked out in another worktree and cannot be switched to.', isConflict: false }
    if (lower.includes('lock') || lower.includes('locked')) return { message: 'The repository is locked by another process. Try again in a moment.', isConflict: false }
    if (lower.includes('already exists')) return { message: 'A branch with this name already exists.', isConflict: false }
    return { message: raw, isConflict: false }
  }

  const handleCheckout = useCallback(async (branch: string, force?: boolean) => {
    if (!workspace || checkingOut) return
    if (isWorktree) { setError('Cannot switch branches in a worktree thread. The branch is locked to this worktree.'); return }
    setCheckingOut(true); setError(null); setConflictBranch(null)
    try {
      await ipc.gitCheckout(workspace, branch, force)
      await fetchBranches()
      setOpen(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const { message, isConflict } = friendlyGitError(raw)
      if (isConflict && !force) { setError(message); setConflictBranch(branch) }
      else { setError(message); setConflictBranch(null) }
    } finally { setCheckingOut(false) }
  }, [workspace, checkingOut, fetchBranches, isWorktree])

  const handleCreate = useCallback(async (name: string) => {
    if (!workspace || checkingOut) return
    const branchName = slugify(name.trim())
    if (!branchName) return
    setCheckingOut(true); setError(null)
    try {
      await ipc.gitCreateBranch(workspace, branchName)
      await fetchBranches()
      setOpen(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(friendlyGitError(raw).message)
    } finally { setCheckingOut(false) }
  }, [workspace, checkingOut, fetchBranches])

  const handleCreateWorktree = useCallback(async (slug: string) => {
    if (!workspace || checkingOut) return
    const normalizedSlug = slugify(slug.trim())
    if (!normalizedSlug) return
    const task = useTaskStore.getState().selectedTaskId ? useTaskStore.getState().tasks[useTaskStore.getState().selectedTaskId!] : null
    const projectRoot = task?.originalWorkspace ?? workspace
    setCheckingOut(true)
    try {
      await ipc.gitWorktreeCreate(projectRoot, normalizedSlug)
      await fetchBranches()
    } catch (err) {
      console.error('[branch-selector] worktree create failed:', err)
    } finally { setCheckingOut(false); setOpen(false) }
  }, [workspace, checkingOut, fetchBranches])

  const handleInlineSubmit = useCallback(() => {
    const trimmed = inlineValue.trim()
    if (!trimmed || checkingOut) return
    if (inlineMode === 'branch') handleCreate(trimmed)
    else if (inlineMode === 'worktree') handleCreateWorktree(trimmed)
  }, [inlineMode, inlineValue, checkingOut, handleCreate, handleCreateWorktree])

  const handleDelete = useCallback(async (branch: string) => {
    if (!workspace || checkingOut) return
    setCheckingOut(true); setError(null)
    try {
      await ipc.gitDeleteBranch(workspace, branch)
      await fetchBranches()
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(friendlyGitError(raw).message)
    } finally { setCheckingOut(false) }
  }, [workspace, checkingOut, fetchBranches])

  const canCreate = search.trim().length > 0 && !data?.local.some((b) => b.name === search.trim()) && !checkingOut
  const currentBranch = data?.currentBranch || data?.local.find((b) => b.current)?.name

  if (!workspace) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="branch-selector-button"
        onClick={() => setOpen((v) => !v)}
        className={cn('flex items-center gap-1 rounded-lg px-1.5 py-1 text-[14px] font-medium transition-colors', 'text-muted-foreground hover:text-foreground/80', open && 'text-foreground/80')}
      >
        <IconGitBranch className="size-3" />
        <span className="hidden max-w-[120px] truncate @[480px]/toolbar:inline">{currentBranch ?? 'branch'}</span>
        {isWorktree && <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-medium text-violet-500 dark:text-violet-400">WT</span>}
        <IconChevronDown className={cn('hidden size-3 opacity-50 transition-transform @[480px]/toolbar:block', open && 'rotate-180')} />
      </button>
      {open && (
        <div data-testid="branch-selector-popup" className="absolute bottom-full right-0 z-[9999] mb-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <BranchList
            data={data}
            loading={loading}
            search={search}
            checkingOut={checkingOut}
            isWorktree={isWorktree}
            error={error}
            conflictBranch={conflictBranch}
            canCreate={canCreate}
            inputRef={inputRef}
            onSearchChange={setSearch}
            onSearchKeyDown={(e) => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); handleCreate(search) } }}
            onCheckout={handleCheckout}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
          <div className="border-t border-border">
            <CreateBranchDialog
              inlineMode={inlineMode}
              inlineValue={inlineValue}
              checkingOut={checkingOut}
              onInlineModeChange={setInlineMode}
              onInlineValueChange={setInlineValue}
              onSubmit={handleInlineSubmit}
            />
          </div>
        </div>
      )}
    </div>
  )
})
