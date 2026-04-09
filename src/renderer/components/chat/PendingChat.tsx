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

  const handleSend = useCallback(async (msg: string) => {
    const name = msg.length > 60 ? msg.slice(0, 57) + '\u2026' : msg
    const { settings, activeWorkspace } = useSettingsStore.getState()
    const projectPrefs = activeWorkspace ? settings.projectPrefs?.[activeWorkspace] : undefined
    const autoApprove = projectPrefs?.autoApprove !== undefined ? projectPrefs.autoApprove : settings.autoApprove
    const created = await ipc.createTask({ name, workspace, prompt: msg, autoApprove })
    upsertTask(created)
    setPendingWorkspace(null)
    setSelectedTask(created.id)
  }, [workspace, upsertTask, setSelectedTask, setPendingWorkspace])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground/40 select-none">New thread</p>
      </div>
      <ChatInput disabled={false} onSendMessage={handleSend} workspace={workspace} />
    </div>
  )
}
