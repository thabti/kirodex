import { memo, useCallback } from 'react'
import { IconHistory } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PermissionBanner } from './PermissionBanner'
import { ExecutionPlan } from './ExecutionPlan'
import { TerminalDrawer } from './TerminalDrawer'
import { QueuedMessages } from './QueuedMessages'
import { ipc } from '@/lib/ipc'
import type { TaskMessage, ToolCall } from '@/types'

const EMPTY_MESSAGES: TaskMessage[] = []
const EMPTY_TOOL_CALLS: ToolCall[] = []
const EMPTY_OPTIONS: Array<{ optionId: string; name: string; kind: string }> = []
const EMPTY_QUEUE: string[] = []

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

/** Send a message directly to the backend (shared by initial send and queue drain). */
async function sendMessageDirect(msg: string): Promise<void> {
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
    const draft = useTaskStore.getState().tasks[task.id]
    const messages = draft?.messages.length ? draft.messages : [userMsg]
    state.upsertTask({ ...created, messages })
    state.setSelectedTask(created.id)
  } else {
    ipc.sendMessage(task.id, msg)
  }
}

/** Zigzag divider shown at top of archived conversations */
const ArchivedBanner = memo(function ArchivedBanner() {
  return (
    <div className="relative flex items-center justify-center py-4 px-6 select-none" data-testid="chat-archived-banner">
      {/* Zigzag line left */}
      <svg className="flex-1 h-3 text-blue-400/30" preserveAspectRatio="none" viewBox="0 0 120 12">
        <path d="M0,6 L5,0 L10,6 L15,0 L20,6 L25,0 L30,6 L35,0 L40,6 L45,0 L50,6 L55,0 L60,6 L65,0 L70,6 L75,0 L80,6 L85,0 L90,6 L95,0 L100,6 L105,0 L110,6 L115,0 L120,6" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      {/* Label */}
      <div className="flex shrink-0 items-center gap-1.5 mx-3 rounded-full border border-blue-400/20 bg-card px-3 py-1">
        <IconHistory className="size-3 text-blue-400/50" />
        <span className="text-[11px] font-medium text-blue-300/50">Previous conversation — view only</span>
      </div>
      {/* Zigzag line right */}
      <svg className="flex-1 h-3 text-blue-400/30" preserveAspectRatio="none" viewBox="0 0 120 12">
        <path d="M0,6 L5,0 L10,6 L15,0 L20,6 L25,0 L30,6 L35,0 L40,6 L45,0 L50,6 L55,0 L60,6 L65,0 L70,6 L75,0 L80,6 L85,0 L90,6 L95,0 L100,6 L105,0 L110,6 L115,0 L120,6" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
})

export const ChatPanel = memo(function ChatPanel() {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const taskStatus = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.status : null)
  const isArchived = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.isArchived === true : false)
  const taskPlan = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.plan : null)
  const pendingPermission = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.pendingPermission : null)
  const contextUsage = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.contextUsage : null)
  const taskWorkspace = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.workspace : null)
  const messageCount = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.messages?.length ?? 0 : 0)
  const terminalOpen = useTaskStore((s) => selectedTaskId ? s.terminalOpenTasks.has(selectedTaskId) : false)
  const queuedMessages = useTaskStore((s) => selectedTaskId ? s.queuedMessages[selectedTaskId] ?? EMPTY_QUEUE : EMPTY_QUEUE)

  const handleSendMessage = useCallback(async (msg: string) => {
    const state = useTaskStore.getState()
    const id = state.selectedTaskId
    const task = id ? state.tasks[id] : null
    if (!task) return

    // If the agent is running, queue the message instead of sending directly
    if (task.status === 'running') {
      state.enqueueMessage(task.id, msg)
      return
    }

    await sendMessageDirect(msg)
  }, [])

  const handleRemoveQueued = useCallback((index: number) => {
    const id = useTaskStore.getState().selectedTaskId
    if (id) useTaskStore.getState().removeQueuedMessage(id, index)
  }, [])

  const handleSteer = useCallback(async (index: number) => {
    const state = useTaskStore.getState()
    const id = state.selectedTaskId
    if (!id) return
    const msg = state.queuedMessages[id]?.[index]
    if (!msg) return
    // Pause the agent first
    await ipc.pauseTask(id)
    // Remove from queue
    state.removeQueuedMessage(id, index)
    // Send the message (will resume the agent with new direction)
    await sendMessageDirect(msg)
  }, [])

  const handleReorderQueued = useCallback((from: number, to: number) => {
    const id = useTaskStore.getState().selectedTaskId
    if (id) useTaskStore.getState().reorderQueuedMessage(id, from, to)
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
  const inputDisabled = isArchived || taskStatus === 'cancelled'

  return (
    <div data-testid="chat-panel" className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {taskPlan && taskPlan.length > 0 && (
          <div className="shrink-0 px-4 pt-2">
            <ExecutionPlan steps={taskPlan} />
          </div>
        )}

        <StreamingMessageList isRunning={isRunning} />

        {isArchived && <ArchivedBanner />}

        {!isArchived && pendingPermission && selectedTaskId && (
          <PermissionBanner
            taskId={selectedTaskId}
            toolName={pendingPermission.toolName}
            description={pendingPermission.description}
            options={pendingPermission.options ?? EMPTY_OPTIONS}
            onSelect={handlePermissionSelect}
          />
        )}

        {!isArchived && (
          <QueuedMessages messages={queuedMessages} onRemove={handleRemoveQueued} onReorder={handleReorderQueued} onSteer={isRunning ? handleSteer : undefined} />
        )}

        {isArchived ? (
          <div className="px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl">
              <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/50 px-4 py-3 opacity-50">
                <span className="text-[13px] text-muted-foreground/50">This conversation is from a previous session</span>
              </div>
            </div>
          </div>
        ) : (
          <ChatInput
            disabled={inputDisabled}
            contextUsage={contextUsage}
            messageCount={messageCount}
            isRunning={isRunning}
            onSendMessage={handleSendMessage}
            onPause={handlePause}
            workspace={taskWorkspace}
          />
        )}
      </div>
      {terminalOpen && taskWorkspace && selectedTaskId && (
        <TerminalDrawer key={selectedTaskId} cwd={taskWorkspace} />
      )}
    </div>
  )
})
