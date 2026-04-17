import { useCallback, useRef, useState } from 'react'
import { IconGitBranch, IconPencil } from '@tabler/icons-react'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { slugify, isValidWorktreeSlug } from '@/lib/utils'
import type { IpcAttachment } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { ChatInput } from './ChatInput'
import { EmptyThreadSplash } from './EmptyThreadSplash'

interface PendingChatProps {
  workspace: string
}

export function PendingChat({ workspace }: PendingChatProps) {
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const getProjectId = useTaskStore((s) => s.getProjectId)
  const draft = useTaskStore((s) => s.drafts[workspace])
  const setDraft = useTaskStore((s) => s.setDraft)
  const removeDraft = useTaskStore((s) => s.removeDraft)

  const settings = useSettingsStore((s) => s.settings)
  const projectPrefs = settings.projectPrefs?.[workspace]
  const [useWorktree, setUseWorktree] = useState(false)
  const [worktreeSlug, setWorktreeSlug] = useState('')
  const [isSlugEdited, setIsSlugEdited] = useState(false)
  const [isEditingSlug, setIsEditingSlug] = useState(false)
  const slugInputRef = useRef<HTMLInputElement>(null)

  const handleDraftChange = useCallback((val: string) => {
    setDraft(workspace, val)
    // Auto-generate slug from message text if user hasn't manually edited it
    if (!isSlugEdited) {
      setWorktreeSlug(slugify(val.slice(0, 40)))
    }
  }, [workspace, setDraft, isSlugEdited])

  const handleSlugChange = useCallback((val: string) => {
    setWorktreeSlug(val)
    setIsSlugEdited(true)
  }, [])

  const handleWorktreeToggle = useCallback((checked: boolean | 'indeterminate') => {
    const next = checked === true
    setUseWorktree(next)
    useSettingsStore.getState().setProjectPref(workspace, { worktreeEnabled: next })
  }, [workspace])

  const handleEditSlug = useCallback(() => {
    setIsEditingSlug(true)
    setIsSlugEdited(true)
    requestAnimationFrame(() => slugInputRef.current?.focus())
  }, [])

  const handleSlugKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditingSlug(false)
    }
  }, [])

  const handleSend = useCallback(async (msg: string, attachments?: IpcAttachment[]) => {
    removeDraft(workspace)
    const cleanMsg = msg.replace(/<\/?kirodex_tangent>/g, '').trim()
    const name = cleanMsg.length > 60 ? cleanMsg.slice(0, 57) + '\u2026' : cleanMsg
    const { settings: currentSettings, activeWorkspace, currentModeId } = useSettingsStore.getState()
    const prefs = activeWorkspace ? currentSettings.projectPrefs?.[activeWorkspace] : undefined
    const autoApprove = prefs?.autoApprove !== undefined ? prefs.autoApprove : currentSettings.autoApprove
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined

    if (useWorktree && worktreeSlug && isValidWorktreeSlug(worktreeSlug)) {
      // Create worktree first, then create task in it
      try {
        const symlinkDirs = prefs?.symlinkDirectories ?? ['node_modules']
        const wtResult = await ipc.gitWorktreeCreate(workspace, worktreeSlug)
        try {
          await ipc.gitWorktreeSetup(workspace, wtResult.worktreePath, symlinkDirs)
        } catch {
          void ipc.gitWorktreeRemove(workspace, wtResult.worktreePath).catch(() => {})
          throw new Error('Worktree setup failed')
        }
        const created = await ipc.createTask({ name, workspace: wtResult.worktreePath, prompt: msg, autoApprove, modeId, attachments })
        upsertTask({
          ...created,
          projectId: getProjectId(workspace),
          worktreePath: wtResult.worktreePath,
          originalWorkspace: workspace,
          messages: [
            ...created.messages,
            { role: 'system', content: `Working in worktree \`${wtResult.worktreePath}\` on branch \`${wtResult.branch}\``, timestamp: new Date().toISOString() },
          ],
        })
        if (currentModeId && currentModeId !== 'kiro_default') {
          useTaskStore.getState().setTaskMode(created.id, currentModeId)
        }
        useTaskStore.setState({ pendingWorkspace: null, selectedTaskId: created.id })
        if (msg.includes('<kirodex_tangent>')) {
          const question = msg.replace(/<\/?kirodex_tangent>/g, '').trim()
          useTaskStore.getState().enterBtwMode(created.id, question)
        }
        return
      } catch (wtErr) {
        // Worktree failed — fall back to original workspace with inline error
        const errMsg = wtErr instanceof Error ? wtErr.message : String(wtErr)
        const created = await ipc.createTask({ name, workspace, prompt: msg, autoApprove, modeId, attachments })
        upsertTask({
          ...created,
          projectId: getProjectId(workspace),
          messages: [
            { role: 'system', content: `\u26a0\ufe0f Worktree creation failed: ${errMsg}. Running in the original workspace.`, timestamp: new Date().toISOString() },
            ...created.messages,
          ],
        })
        if (currentModeId && currentModeId !== 'kiro_default') {
          useTaskStore.getState().setTaskMode(created.id, currentModeId)
        }
        useTaskStore.setState({ pendingWorkspace: null, selectedTaskId: created.id })
        if (msg.includes('<kirodex_tangent>')) {
          const question = msg.replace(/<\/?kirodex_tangent>/g, '').trim()
          useTaskStore.getState().enterBtwMode(created.id, question)
        }
        return
      }
    }

    const created = await ipc.createTask({ name, workspace, prompt: msg, autoApprove, modeId, attachments })
    upsertTask({ ...created, projectId: getProjectId(workspace) })
    if (currentModeId && currentModeId !== 'kiro_default') {
      useTaskStore.getState().setTaskMode(created.id, currentModeId)
    }
    useTaskStore.setState({ pendingWorkspace: null, selectedTaskId: created.id })
    // If this was a /btw question, enter btw mode on the new task
    if (msg.includes('<kirodex_tangent>')) {
      const question = msg.replace(/<\/?kirodex_tangent>/g, '').trim()
      useTaskStore.getState().enterBtwMode(created.id, question)
    }
  }, [workspace, upsertTask, removeDraft, useWorktree, worktreeSlug, getProjectId])

  const kiroAuth = useSettingsStore((s) => s.kiroAuth)
  const kiroAuthChecked = useSettingsStore((s) => s.kiroAuthChecked)
  const openLogin = useSettingsStore((s) => s.openLogin)
  const isLoggedOut = kiroAuthChecked && !kiroAuth
  const isSlugValid = !worktreeSlug || isValidWorktreeSlug(worktreeSlug)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {isLoggedOut ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-600 dark:text-amber-400" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V8a1 1 0 0 1 2 0v5Z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/80">Sign in to start a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground">Kiro authentication is required to use AI agents</p>
            </div>
            <button
              type="button"
              onClick={openLogin}
              className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
            >
              Sign in to Kiro
            </button>
          </div>
        ) : (
          <EmptyThreadSplash />
        )}
      </div>
      {/* Worktree toggle */}
      {!isLoggedOut && (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pb-2">
          <div className="flex w-full max-w-md flex-col rounded-xl border border-border/40 bg-card/30 px-3 py-2.5">
            {/* Toggle row */}
            <label
              htmlFor="worktree-toggle"
              className="flex cursor-pointer items-center gap-2.5 select-none"
            >
              <Checkbox
                id="worktree-toggle"
                checked={useWorktree}
                onCheckedChange={handleWorktreeToggle}
                aria-label="Use worktree for this thread"
              />
              <IconGitBranch className="size-3.5 text-violet-500 dark:text-violet-400" aria-hidden />
              <span className="text-xs font-medium text-foreground/70">Use worktree</span>
              <span className="text-[11px] text-muted-foreground">Isolate this thread in its own directory</span>
            </label>
            {/* Slug row */}
            {useWorktree && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-border/30 pt-2 pl-[26px]">
                <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/70">.kiro/worktrees/</span>
                {isEditingSlug ? (
                  <input
                    ref={slugInputRef}
                    type="text"
                    value={worktreeSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    onBlur={() => setIsEditingSlug(false)}
                    onKeyDown={handleSlugKeyDown}
                    maxLength={30}
                    placeholder="slug"
                    className={`min-w-0 flex-1 rounded border bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 ${isSlugValid ? 'border-border/40 focus:border-violet-400/60' : 'border-red-400/60'}`}
                    aria-label="Worktree slug"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleEditSlug}
                    className="group inline-flex min-w-0 items-center gap-1 rounded border border-transparent px-1.5 py-0.5 font-mono text-[11px] text-foreground/60 transition-colors hover:border-border/40 hover:bg-muted/40 hover:text-foreground"
                    aria-label="Edit worktree slug"
                    tabIndex={0}
                  >
                    <span className="truncate">{worktreeSlug || 'slug'}</span>
                    <IconPencil className="size-2.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-foreground/50" aria-hidden />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <ChatInput autoFocus disabled={isLoggedOut} initialValue={draft} onDraftChange={handleDraftChange} onSendMessage={handleSend} workspace={workspace} isWorktree={useWorktree} />
    </div>
  )
}
