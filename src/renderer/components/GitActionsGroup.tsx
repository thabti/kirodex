import { useState, useRef, useEffect } from 'react'
import { IconGitCommit, IconChevronDown } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ipc } from '@/lib/ipc'

const GitHubIcon = () => (
  <svg aria-hidden className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

export function GitActionsGroup({ taskId, workspace }: { taskId: string; workspace: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setBusy(true)
    try { await ipc.gitCommit(taskId, commitMsg.trim()); setCommitMsg(''); setShowCommitInput(false) }
    catch (e) { alert(e instanceof Error ? e.message : 'Commit failed') }
    finally { setBusy(false) }
  }

  const handlePush = async () => {
    setBusy(true)
    try { await ipc.gitPush(taskId) }
    catch (e) { alert(e instanceof Error ? e.message : 'Push failed') }
    finally { setBusy(false); setMenuOpen(false) }
  }

  return (
    <div ref={ref} data-testid="git-actions-group" className="relative flex w-fit">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => setShowCommitInput((v) => !v)} disabled={busy}
            data-testid="git-commit-button"
            className="inline-flex h-6 items-center gap-1 rounded-l-md border border-input bg-popover px-1.5 text-xs text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32 disabled:opacity-50">
            <IconGitCommit className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Git commit</TooltipContent>
      </Tooltip>
      <div className="pointer-events-none relative z-[2] w-px bg-input dark:bg-input/32" />
      <button type="button" aria-label="Git options" onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-r-md border border-input bg-popover text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 dark:bg-input/32">
        <IconChevronDown className="size-3.5" aria-hidden />
      </button>

      {showCommitInput && (
        <div className="absolute right-0 top-7 z-[200] w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Commit message</p>
          <input autoFocus value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCommit() }}
            placeholder="feat: ..."
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring" />
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setShowCommitInput(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">Cancel</button>
            <button type="button" onClick={() => void handleCommit()} disabled={!commitMsg.trim() || busy}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Committing...' : 'Commit'}
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="absolute right-0 top-7 z-[200] min-w-[140px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          <button type="button" onClick={() => void handlePush()} disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors disabled:opacity-50">
            <IconGitCommit className="size-3.5" /> Push
          </button>
          <button type="button" onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors">
            <GitHubIcon /> Open on GitHub
          </button>
        </div>
      )}
    </div>
  )
}
