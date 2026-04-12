import { useCallback } from 'react'
import { ipc } from '@/lib/ipc'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ChatInput } from './ChatInput'

interface PendingChatProps {
  workspace: string
}

export function PendingChat({ workspace }: PendingChatProps) {
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const setPendingWorkspace = useTaskStore((s) => s.setPendingWorkspace)
  const draft = useTaskStore((s) => s.drafts[workspace])
  const setDraft = useTaskStore((s) => s.setDraft)
  const removeDraft = useTaskStore((s) => s.removeDraft)

  const handleDraftChange = useCallback((val: string) => {
    setDraft(workspace, val)
  }, [workspace, setDraft])

  const handleSend = useCallback(async (msg: string) => {
    removeDraft(workspace)
    const name = msg.length > 60 ? msg.slice(0, 57) + '\u2026' : msg
    const { settings, activeWorkspace, currentModeId } = useSettingsStore.getState()
    const projectPrefs = activeWorkspace ? settings.projectPrefs?.[activeWorkspace] : undefined
    const autoApprove = projectPrefs?.autoApprove !== undefined ? projectPrefs.autoApprove : settings.autoApprove
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined
    const created = await ipc.createTask({ name, workspace, prompt: msg, autoApprove, modeId })
    upsertTask(created)
    setPendingWorkspace(null)
    setSelectedTask(created.id)
  }, [workspace, upsertTask, setSelectedTask, setPendingWorkspace, removeDraft])

  const kiroAuth = useSettingsStore((s) => s.kiroAuth)
  const kiroAuthChecked = useSettingsStore((s) => s.kiroAuthChecked)
  const openLogin = useSettingsStore((s) => s.openLogin)
  const isLoggedOut = kiroAuthChecked && !kiroAuth

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {isLoggedOut ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-400" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V8a1 1 0 0 1 2 0v5Z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/80">Sign in to start a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground/50">Kiro authentication is required to use AI agents</p>
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
          <p className="text-sm text-muted-foreground/40 select-none">New thread</p>
        )}
      </div>
      <ChatInput disabled={isLoggedOut} initialValue={draft} onDraftChange={handleDraftChange} onSendMessage={handleSend} workspace={workspace} />
    </div>
  )
}
