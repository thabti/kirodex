import { memo, useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { isValidWorktreeSlug, slugify, sanitizeBranchName } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTaskStore } from '@/stores/taskStore'
import { ipc } from '@/lib/ipc'
import { PanelShell } from './PanelShell'

export const BranchPanel = memo(function BranchPanel({ onDismiss }: { onDismiss: () => void }) {
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspace = useSettingsStore((s) => s.operationalWorkspace)

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || !workspace) return
    const branchName = sanitizeBranchName(trimmed)
    if (!branchName) return
    setIsCreating(true); setError(null)
    try {
      await ipc.gitCreateBranch(workspace, branchName)
      const { selectedTaskId, tasks, upsertTask } = useTaskStore.getState()
      if (selectedTaskId && tasks[selectedTaskId]) {
        const task = tasks[selectedTaskId]
        upsertTask({ ...task, messages: [...task.messages, { role: 'system', content: `Created and checked out branch \`${branchName}\``, timestamp: new Date().toISOString() }] })
      }
      onDismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsCreating(false) }
  }, [name, workspace, onDismiss])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleCreate() }
  }, [handleCreate])

  return (
    <PanelShell onDismiss={onDismiss}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Create branch</span>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2">
        <input ref={inputRef} type="text" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} onKeyDown={handleKeyDown} placeholder="Branch name…" autoFocus className="flex-1 rounded-md border border-border/40 bg-background/50 px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80" aria-label="Branch name" />
        <button type="button" disabled={!name.trim() || isCreating || !workspace} onMouseDown={(e) => { e.preventDefault(); void handleCreate() }} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50" aria-label="Create branch">
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <p className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </PanelShell>
  )
})

export const WorktreePanel = memo(function WorktreePanel({ onDismiss }: { onDismiss: () => void }) {
  const [slug, setSlug] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspace = useSettingsStore((s) => s.activeWorkspace)
  const settings = useSettingsStore((s) => s.settings)

  const normalizedSlug = slugify(slug)
  const isValid = normalizedSlug.length > 0 && isValidWorktreeSlug(normalizedSlug)

  const handleCreate = useCallback(async () => {
    if (!normalizedSlug || !workspace || !isValidWorktreeSlug(normalizedSlug)) return
    setIsCreating(true); setError(null)
    try {
      const symlinkDirs = settings.projectPrefs?.[workspace]?.symlinkDirectories ?? ['node_modules']
      const result = await ipc.gitWorktreeCreate(workspace, normalizedSlug)
      try {
        await ipc.gitWorktreeSetup(workspace, result.worktreePath, symlinkDirs)
      } catch (setupErr) {
        void ipc.gitWorktreeRemove(workspace, result.worktreePath).catch(() => {})
        throw setupErr
      }
      const task = await ipc.createTask({ name: normalizedSlug, workspace: result.worktreePath, prompt: '', autoApprove: settings.autoApprove, deferSpawn: true })
      const store = useTaskStore.getState()
      store.upsertTask({ ...task, worktreePath: result.worktreePath, originalWorkspace: workspace, messages: [{ role: 'system', content: `Working in worktree \`${result.worktreePath}\` on branch \`${result.branch}\``, timestamp: new Date().toISOString() }] })
      store.setSelectedTask(task.id)
      onDismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsCreating(false) }
  }, [normalizedSlug, workspace, settings, onDismiss])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleCreate() }
  }, [handleCreate])

  return (
    <PanelShell onDismiss={onDismiss}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Create worktree</span>
      </div>
      <div className="flex items-center gap-2 px-3 pb-1">
        <input ref={inputRef} type="text" value={slug} onChange={(e) => { setSlug(e.target.value); setError(null) }} onKeyDown={handleKeyDown} placeholder="Worktree name…" autoFocus className="flex-1 rounded-md border border-border/40 bg-background/50 px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80" aria-label="Worktree slug" />
        <button type="button" disabled={!isValid || isCreating || !workspace} onMouseDown={(e) => { e.preventDefault(); void handleCreate() }} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50" aria-label="Create worktree">
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {slug && normalizedSlug && normalizedSlug !== slug && (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">Slug: <code className="rounded bg-muted/40 px-1 text-[10px]">{normalizedSlug}</code></p>
      )}
      {slug && !isValid && <p className="px-3 pb-2 text-[11px] text-amber-600 dark:text-amber-400">Invalid slug: use alphanumeric, dashes, underscores, dots</p>}
      {error && <p className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </PanelShell>
  )
})
