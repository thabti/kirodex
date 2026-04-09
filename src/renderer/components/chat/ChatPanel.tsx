import { memo, useCallback } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PermissionBanner } from './PermissionBanner'
import { ExecutionPlan } from './ExecutionPlan'
import { TerminalDrawer } from './TerminalDrawer'
import { ipc } from '@/lib/ipc'
import type { TaskMessage, ToolCall } from '@/types'

const EMPTY_MESSAGES: TaskMessage[] = []
const EMPTY_TOOL_CALLS: ToolCall[] = []
const EMPTY_OPTIONS: Array<{ optionId: string; name: string; kind: string }> = []

/**
 * Owns the streaming selectors so ChatPanel doesn't re-render on every token.
 */
const StreamingMessageList = memo(function StreamingMessageList({ isRunning }: { isRunning: boolean }) {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const messages = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.messages ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  const streamingChunk = useTaskStore((s) => selectedTaskId ? s.streamingChunks[selectedTaskId] ?? '' : '')
  const liveToolCalls = useTaskStore((s) => selectedTaskId ? s.liveToolCalls[selectedTaskId] ?? EMPTY_TOOL_CALLS : EMPTY_TOOL_CALLS)
  const liveThinking = useTaskStore((s) => selectedTaskId ? s.thinkingChunks[selectedTaskId] ?? '' : '')

  return (
    <MessageList
      messages={messages}
      streamingChunk={streamingChunk}
      liveToolCalls={liveToolCalls}
      liveThinking={liveThinking}
      isRunning={isRunning}
    />
  )
})

export const ChatPanel = memo(function ChatPanel() {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskStatus = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.status : null)
  const taskPlan = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.plan : null)
  const pendingPermission = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.pendingPermission : null)
  const contextUsage = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.contextUsage : null)
  const taskWorkspace = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.workspace : null)
  const messageCount = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.messages?.length ?? 0 : 0)
  const terminalOpen = useTaskStore((s) => s.terminalOpen)

  const handleSendMessage = useCallback(async (msg: string) => {
    const state = useTaskStore.getState()
    const id = state.selectedTaskId
    const task = id ? state.tasks[id] : null
    if (!task) return
    const isDraft = task.messages.length === 0 && task.status === 'paused'

    const userMsg = { role: 'user' as const, content: msg, timestamp: new Date().toISOString() }
    state.upsertTask({ ...task, status: 'running', messages: [...task.messages, userMsg] })
    state.clearTurn(task.id)

    if (isDraft) {
      const { settings } = useSettingsStore.getState()
      const projectPrefs = task.workspace ? settings.projectPrefs?.[task.workspace] : undefined
      const autoApprove = projectPrefs?.autoApprove !== undefined ? projectPrefs.autoApprove : settings.autoApprove
      const created = await ipc.createTask({ name: task.name, workspace: task.workspace, prompt: msg, autoApprove })
      // Carry over messages from the draft (the server task arrives with messages: [])
      const draft = useTaskStore.getState().tasks[task.id]
      const messages = draft?.messages.length ? draft.messages : [userMsg]
      state.upsertTask({ ...created, messages })
      state.setSelectedTask(created.id)
    } else {
      ipc.sendMessage(task.id, msg)
    }
  }, [])

  const handlePermissionSelect = useCallback((optionId: string) => {
    const state = useTaskStore.getState()
    const id = state.selectedTaskId
    const task = id ? state.tasks[id] : null
    if (task?.pendingPermission) {
      ipc.selectPermissionOption(task.id, task.pendingPermission.requestId, optionId).catch(() => {})
    }
  }, [])

  const handlePause = useCallback(() => {
    if (selectedTaskId) ipc.pauseTask(selectedTaskId)
  }, [selectedTaskId])

  if (!taskStatus) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Kirodex</EmptyTitle>
          <EmptyDescription>Select a task or create a new one to get started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const isRunning = taskStatus === 'running'
  const inputDisabled = taskStatus === 'cancelled'

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {taskPlan && taskPlan.length > 0 && (
          <div className="shrink-0 px-4 pt-2">
            <ExecutionPlan steps={taskPlan} />
          </div>
        )}

        <StreamingMessageList isRunning={isRunning} />

        {pendingPermission && selectedTaskId && (
          <PermissionBanner
            taskId={selectedTaskId}
            toolName={pendingPermission.toolName}
            description={pendingPermission.description}
            options={pendingPermission.options ?? EMPTY_OPTIONS}
            onSelect={handlePermissionSelect}
          />
        )}

        <ChatInput
          disabled={inputDisabled}
          contextUsage={contextUsage}
          messageCount={messageCount}
          isRunning={isRunning}
          onSendMessage={handleSendMessage}
          onPause={handlePause}
          workspace={taskWorkspace}
        />
      </div>
      {terminalOpen && taskWorkspace && (
        <TerminalDrawer cwd={taskWorkspace} />
      )}
    </div>
  )
})
