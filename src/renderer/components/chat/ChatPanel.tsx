import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { IconHistory } from '@tabler/icons-react'
import { useTaskStore } from '@/stores/taskStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PermissionBanner } from './PermissionBanner'
import { ExecutionPlan } from './ExecutionPlan'
import { CompactSuggestBanner } from './CompactSuggestBanner'
import { TerminalDrawer } from './TerminalDrawer'
import { QueuedMessages } from './QueuedMessages'
import { SearchBar } from './SearchBar'
import { SearchQueryContext } from './HighlightText'
import { BtwOverlay } from './BtwOverlay'
import { useMessageSearch } from '@/hooks/useMessageSearch'
import { ipc } from '@/lib/ipc'
import type { TaskMessage, ToolCall, IpcAttachment } from '@/types'
import type { TimelineRow } from '@/lib/timeline'

const EMPTY_MESSAGES: TaskMessage[] = []
const EMPTY_TOOL_CALLS: ToolCall[] = []
const EMPTY_OPTIONS: Array<{ optionId: string; name: string; kind: string }> = []
const EMPTY_QUEUE: string[] = []

/**
 * Owns the streaming selectors so ChatPanel doesn't re-render on every token.
 */
const StreamingMessageList = memo(function StreamingMessageList({
  isRunning,
  searchMatchIds,
  activeMatchId,
  onTimelineRows,
}: {
  isRunning: boolean
  searchMatchIds?: string[]
  activeMatchId?: string | null
  onTimelineRows?: (rows: TimelineRow[]) => void
}) {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const messages = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.messages ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  const streamingChunk = useTaskStore((s) => s.btwCheckpoint ? '' : selectedTaskId ? s.streamingChunks[selectedTaskId] ?? '' : '')
  const liveToolCalls = useTaskStore((s) => s.btwCheckpoint ? EMPTY_TOOL_CALLS : selectedTaskId ? s.liveToolCalls[selectedTaskId] ?? EMPTY_TOOL_CALLS : EMPTY_TOOL_CALLS)
  const liveThinking = useTaskStore((s) => s.btwCheckpoint ? '' : selectedTaskId ? s.thinkingChunks[selectedTaskId] ?? '' : '')

  return (
    <MessageList
      messages={messages}
      streamingChunk={streamingChunk}
      liveToolCalls={liveToolCalls}
      liveThinking={liveThinking}
      isRunning={isRunning}
      searchMatchIds={searchMatchIds}
      activeMatchId={activeMatchId}
      onTimelineRows={onTimelineRows}
    />
  )
})

/** Send a message directly to the backend (shared by initial send and queue drain). */
async function sendMessageDirect(msg: string, attachments?: IpcAttachment[]): Promise<void> {
  const state = useTaskStore.getState()
  const id = state.selectedTaskId
  const task = id ? state.tasks[id] : null
  if (!task) return
  const isDraft = task.messages.length === 0 && task.status === 'paused'

  const userMsg = { role: 'user' as const, content: msg, timestamp: new Date().toISOString() }
  state.upsertTask({ ...task, status: 'running', messages: [...task.messages, userMsg] })
  state.clearTurn(task.id)

  if (isDraft) {
    const { settings, currentModeId } = useSettingsStore.getState()
    const projectRoot = task.originalWorkspace ?? task.workspace
    const projectPrefs = projectRoot ? settings.projectPrefs?.[projectRoot] : undefined
    const autoApprove = projectPrefs?.autoApprove !== undefined ? projectPrefs.autoApprove : settings.autoApprove
    const modeId = currentModeId && currentModeId !== 'kiro_default' ? currentModeId : undefined
    const created = await ipc.createTask({ name: task.name, workspace: task.workspace, prompt: msg, autoApprove, modeId, attachments })
    const draft = useTaskStore.getState().tasks[task.id]
    const messages = draft?.messages.length ? draft.messages : [userMsg]
    state.upsertTask({ ...created, messages })
    if (currentModeId && currentModeId !== 'kiro_default') {
      useTaskStore.getState().setTaskMode(created.id, currentModeId)
    }
    state.setSelectedTask(created.id)
  } else {
    ipc.sendMessage(task.id, msg, attachments)
  }
}

/** Zigzag divider shown at top of archived conversations */
const ArchivedBanner = memo(function ArchivedBanner() {
  return (
    <div className="relative flex items-center justify-center py-4 px-6 select-none" data-testid="chat-archived-banner">
      {/* Zigzag line left */}
      <svg className="flex-1 h-3 text-blue-600/30 dark:text-blue-400/30" preserveAspectRatio="none" viewBox="0 0 120 12">
        <path d="M0,6 L5,0 L10,6 L15,0 L20,6 L25,0 L30,6 L35,0 L40,6 L45,0 L50,6 L55,0 L60,6 L65,0 L70,6 L75,0 L80,6 L85,0 L90,6 L95,0 L100,6 L105,0 L110,6 L115,0 L120,6" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      {/* Label */}
      <div className="flex shrink-0 items-center gap-1.5 mx-3 rounded-full border border-blue-400/20 bg-card px-3 py-1">
        <IconHistory className="size-3 text-blue-600/50 dark:text-blue-400/50" />
        <span className="text-[11px] font-medium text-blue-500/60 dark:text-blue-300/50">Previous conversation — view only</span>
      </div>
      {/* Zigzag line right */}
      <svg className="flex-1 h-3 text-blue-600/30 dark:text-blue-400/30" preserveAspectRatio="none" viewBox="0 0 120 12">
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
  const isPlanMode = useSettingsStore((s) => s.currentModeId === 'kiro_planner')
  const taskWorkspace = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.workspace : null)
  const isWorktree = useTaskStore((s) => selectedTaskId ? !!s.tasks[selectedTaskId]?.worktreePath : false)
  const messageCount = useTaskStore((s) => selectedTaskId ? s.tasks[selectedTaskId]?.messages?.length ?? 0 : 0)
  const terminalOpen = useTaskStore((s) => selectedTaskId ? s.terminalOpenTasks.has(selectedTaskId) : false)
  const toggleTerminal = useTaskStore((s) => s.toggleTerminal)
  const queuedMessages = useTaskStore((s) => selectedTaskId ? s.queuedMessages[selectedTaskId] ?? EMPTY_QUEUE : EMPTY_QUEUE)
  const isBtwMode = useTaskStore((s) => s.btwCheckpoint !== null)

  // Search state — timeline rows are pushed up from MessageList via callback
  const timelineRowsRef = useRef<TimelineRow[]>([])
  const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([])
  const handleTimelineRows = useCallback((rows: TimelineRow[]) => {
    // Only update state when the row array identity changes (memo'd in MessageList)
    if (rows !== timelineRowsRef.current) {
      timelineRowsRef.current = rows
      setTimelineRows(rows)
    }
  }, [])

  const search = useMessageSearch(timelineRows)

  // Close search when switching threads
  const prevTaskIdRef = useRef(selectedTaskId)
  useEffect(() => {
    if (prevTaskIdRef.current !== selectedTaskId && search.isOpen) {
      search.close()
    }
    prevTaskIdRef.current = selectedTaskId
  }, [selectedTaskId, search])

  // Cmd+F / Ctrl+F shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (search.isOpen) {
          search.close()
        } else {
          search.open()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [search])

  const handleSendMessage = useCallback(async (msg: string, attachments?: IpcAttachment[]) => {
    const state = useTaskStore.getState()
    const id = state.selectedTaskId
    const task = id ? state.tasks[id] : null
    if (!task) return

    // If the agent is running, queue the message instead of sending directly
    // Exception: btw mode messages should always send immediately
    if (task.status === 'running' && !state.btwCheckpoint) {
      state.enqueueMessage(task.id, msg)
      return
    }

    await sendMessageDirect(msg, attachments)
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

  const [isInputCollapsed, setIsInputCollapsed] = useState(false)
  const handleToggleCollapse = useCallback(() => setIsInputCollapsed((v) => !v), [])

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

  const searchQuery = search.isOpen ? search.query : ''

  return (
    <div data-testid="chat-panel" className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {isBtwMode && <BtwOverlay />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {taskPlan && taskPlan.length > 0 && (
          <div className="shrink-0 px-4 pt-2">
            <ExecutionPlan steps={taskPlan} />
          </div>
        )}

        {search.isOpen && (
          <div className="shrink-0">
            <SearchBar
              query={search.query}
              matchCount={search.matchCount}
              activeIndex={search.activeIndex}
              onQueryChange={search.setQuery}
              onNext={search.goToNext}
              onPrevious={search.goToPrevious}
              onClose={search.close}
            />
          </div>
        )}

        <SearchQueryContext.Provider value={searchQuery}>
          <StreamingMessageList
            isRunning={isRunning && !isBtwMode}
            searchMatchIds={search.isOpen ? search.matchIds : undefined}
            activeMatchId={search.isOpen ? search.activeMatchId : undefined}
            onTimelineRows={handleTimelineRows}
          />
        </SearchQueryContext.Provider>

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
          <CompactSuggestBanner contextUsage={contextUsage} isPlanMode={isPlanMode} />
        )}

        {!isArchived && (
          <QueuedMessages messages={queuedMessages} onRemove={handleRemoveQueued} onReorder={handleReorderQueued} onSteer={isRunning ? handleSteer : undefined} />
        )}

        {isArchived ? (
          <div className="px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl">
              <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card px-4 py-3 opacity-50">
                <span className="text-[13px] text-muted-foreground/80">This conversation is from a previous session</span>
              </div>
            </div>
          </div>
        ) : (
          <ChatInput
            disabled={inputDisabled}
            disabledReason={isArchived ? 'Previous session — view only' : taskStatus === 'cancelled' ? 'Task was cancelled' : undefined}
            contextUsage={contextUsage}
            messageCount={messageCount}
            isRunning={isRunning}
            hasQueuedMessages={queuedMessages.length > 0}
            onSendMessage={handleSendMessage}
            onPause={handlePause}
            workspace={taskWorkspace}
            isWorktree={isWorktree}
            isCollapsed={isInputCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />
        )}
      </div>
      {terminalOpen && taskWorkspace && selectedTaskId && (
        <TerminalDrawer key={selectedTaskId} cwd={taskWorkspace} onClose={() => toggleTerminal(selectedTaskId)} />
      )}
    </div>
  )
})
