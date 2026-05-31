import type { AgentTask, ActivityEntry, ToolCall, ToolCallSplit, PlanStep, SoftDeletedThread, CompactionStatus, Attachment, ProjectFile, IpcAttachment } from '@/types'
import type { PastedChunk } from '@/hooks/useChatInput'
import type { ArchivedThreadMeta } from '@/lib/history-store'
import type { LocalDispatchSnapshot } from '@/lib/dispatch-snapshot'
import type { ConnectionStatus } from '@/lib/connection-state'

export interface QueuedMessage {
  readonly text: string
  readonly attachments?: readonly IpcAttachment[]
}

export interface BtwCheckpoint {
  readonly taskId: string
  readonly messages: readonly import('@/types').TaskMessage[]
  readonly question: string
}

/**
 * A one-shot request to open the built-in terminal at a specific directory.
 * Each request gets a unique `requestId` so consumers can distinguish a
 * fresh "Open in Terminal" click from a stale state read.
 */
export interface PendingTerminalRequest {
  readonly taskId: string
  /** Absolute path to the directory the new terminal should `cd` into. */
  readonly cwd: string
  /** Monotonic id; incremented on every new request. */
  readonly requestId: number
}

export interface TaskStore {
  tasks: Record<string, AgentTask>
  /** Lazy metadata for archived threads not currently inflated into `tasks`.
   *  These are read-only past-session threads. Hydrated on demand when the
   *  user opens one. Keyed by thread id. */
  archivedMeta: Record<string, ArchivedThreadMeta>
  projects: string[]           // workspace paths
  /** Maps workspace path → stable UUID for project identity */
  projectIds: Record<string, string>
  deletedTaskIds: Set<string>  // guard against backend re-adding deleted tasks
  softDeleted: Record<string, SoftDeletedThread>  // threads pending permanent deletion
  selectedTaskId: string | null
  pendingWorkspace: string | null  // workspace for a new thread not yet created
  view: 'chat' | 'dashboard' | 'analytics'
  isNewProjectOpen: boolean
  isSettingsOpen: boolean
  settingsInitialSection: string | null
  /** Btw (tangent) mode checkpoint — snapshot of messages before the side question */
  btwCheckpoint: BtwCheckpoint | null
  /** Accumulated text chunks for streaming display */
  streamingChunks: Record<string, string>
  /** Accumulated thinking chunks for live thinking display */
  thinkingChunks: Record<string, string>
  /** Live tool calls for the current turn (by taskId) */
  liveToolCalls: Record<string, ToolCall[]>
  /**
   * Anchors recorded during streaming for inline tool-call rendering.
   * Each entry records the streaming-text length at the moment the
   * corresponding tool call was first seen. Sorted ascending by `at`.
   * Cleared at turn end alongside {@link liveToolCalls}.
   */
  liveToolSplits: Record<string, ToolCallSplit[]>
  /** Queued messages per task — typed while agent is running, sent on turn end */
  queuedMessages: Record<string, QueuedMessage[]>
  activityFeed: ActivityEntry[]
  connected: boolean
  /** Rich connection status for UI indicators (phase, retry count, timestamps) */
  connectionStatus: ConnectionStatus
  /** Local dispatch snapshots per task — tracks optimistic UI state */
  dispatchSnapshots: Record<string, LocalDispatchSnapshot>
  terminalOpenTasks: Set<string>
  /** Workspace-level terminal open state (for PendingChat when no task is selected) */
  isWorkspaceTerminalOpen: boolean
  /**
   * One-shot request to open the in-app terminal at a specific cwd.
   * The {@link TerminalDrawer} watches this and opens a new tab. We use
   * a record keyed by taskId so split-view panels each get their own slot
   * and a stale request from another panel doesn't reopen here.
   * `__workspace__` is the special key for the workspace-level drawer in
   * {@link PendingChat}.
   */
  pendingTerminalRequests: Record<string, PendingTerminalRequest>
  /** Per-workspace draft text (in-memory only, not persisted to disk) */
  drafts: Record<string, string>
  /** Per-workspace draft attachments (in-memory only) */
  draftAttachments: Record<string, Attachment[]>
  /** Per-workspace draft pasted chunks (in-memory only) */
  draftPastedChunks: Record<string, PastedChunk[]>
  /** Per-workspace draft file/agent/skill mentions (in-memory only) */
  draftMentionedFiles: Record<string, ProjectFile[]>
  /** One-shot guard: workspace whose next setDraft call should be suppressed */
  _suppressDraftSave: string | null
  /** Task IDs from desktop notifications pending click-to-navigate */
  notifiedTaskIds: string[]
  /** Per-thread mode (e.g. 'kiro_planner') so toggling plan mode in one thread doesn't affect others */
  taskModes: Record<string, string>
  /** Per-thread model ID so switching model in one thread doesn't affect others */
  taskModels: Record<string, string>
  /** Per-thread kiro CLI session ID (from ACP new_session) for debugging */
  sessionIds: Record<string, string>
  /** Whether a fork operation is in progress */
  isForking: boolean
  /** Workspace path of the most recently added project (for auto-focus) */
  lastAddedProject: string | null
  /** Pending worktree cleanup — set when a worktree thread is being deleted/archived */
  worktreeCleanupPending: { taskId: string; worktreePath: string; branch: string; originalWorkspace: string; action: 'archive' | 'delete'; hasChanges: boolean | null } | null
  /** Thread IDs pinned to the top of the sidebar */
  pinnedThreadIds: string[]
  /** Saved split view pairings */
  splitViews: Array<{ id: string; left: string; right: string; ratio: number }>
  /** Currently active split view ID (null = single panel mode) */
  activeSplitId: string | null
  /** Pending split replacement: next thread click replaces this side */
  pendingSplitReplace: { splitId: string; side: 'left' | 'right' } | null
  /** Split-screen: which panel is focused */
  focusedPanel: 'left' | 'right'
  /** Per-thread scroll positions (in-memory only, not persisted) */
  scrollPositions: Record<string, number>
  /** Per-project thread ordering (workspace → ordered thread IDs) */
  threadOrders: Record<string, string[]>
  setSelectedTask: (id: string | null) => void
  /** Browser-style thread navigation history (stack of thread IDs) */
  navHistory: string[]
  /** Current index into navHistory; -1 when empty */
  navIndex: number
  /** Internal flag: when true, setSelectedTask skips history push (used by navBack/Forward) */
  _navInternal: boolean
  /** Walk back through history to a still-existing thread; no-op if none */
  navBack: () => void
  /** Walk forward through history to a still-existing thread; no-op if none */
  navForward: () => void
  setView: (view: 'chat' | 'dashboard' | 'analytics') => void
  setNewProjectOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean, section?: string | null) => void
  addProject: (workspace: string) => void
  clearLastAddedProject: () => void
  /** Returns the stable UUID for a workspace, generating one if needed */
  getProjectId: (workspace: string) => string
  removeProject: (workspace: string) => void
  archiveThreads: (workspace: string) => void
  upsertTask: (task: AgentTask) => void
  removeTask: (id: string) => void
  archiveTask: (id: string) => void
  softDeleteTask: (id: string) => void
  restoreTask: (id: string) => void
  permanentlyDeleteTask: (id: string) => void
  purgeExpiredSoftDeletes: () => void
  /** Drop every soft-deleted thread immediately, regardless of age. */
  purgeAllSoftDeletes: () => void
  /** Auto-archive threads inactive for longer than settings.autoArchiveDays. */
  autoArchiveStaleThreads: () => void
  appendChunk: (taskId: string, chunk: string) => void
  appendThinkingChunk: (taskId: string, chunk: string) => void
  upsertToolCall: (taskId: string, toolCall: ToolCall) => void
  updatePlan: (taskId: string, plan: PlanStep[]) => void
  updateUsage: (taskId: string, used: number, size: number) => void
  updateCompactionStatus: (taskId: string, status: CompactionStatus, summary?: string) => void
  clearTurn: (taskId: string) => void
  enqueueMessage: (taskId: string, message: string, attachments?: IpcAttachment[]) => void
  dequeueMessages: (taskId: string) => QueuedMessage[]
  removeQueuedMessage: (taskId: string, index: number) => void
  reorderQueuedMessage: (taskId: string, from: number, to: number) => void
  createDraftThread: (workspace: string) => string
  setPendingWorkspace: (workspace: string | null) => void
  renameTask: (taskId: string, name: string) => void
  forkTask: (taskId: string) => Promise<void>
  projectNames: Record<string, string>
  reorderProject: (from: number, to: number) => void
  /** Reorder a thread within a project */
  reorderThread: (workspace: string, from: number, to: number) => void
  setDraft: (workspace: string, content: string) => void
  removeDraft: (workspace: string) => void
  setDraftAttachments: (workspace: string, attachments: Attachment[]) => void
  setDraftPastedChunks: (workspace: string, chunks: PastedChunk[]) => void
  removeDraftAttachments: (workspace: string) => void
  removeDraftPastedChunks: (workspace: string) => void
  setDraftMentionedFiles: (workspace: string, files: ProjectFile[]) => void
  removeDraftMentionedFiles: (workspace: string) => void
  toggleTerminal: (taskId: string) => void
  toggleWorkspaceTerminal: () => void
  /**
   * Open the in-app terminal at the given absolute cwd. If the terminal
   * drawer is closed it will be opened, otherwise a new tab is spawned.
   * `taskId` is the panel id, or `'__workspace__'` for the pending-chat
   * workspace drawer.
   */
  requestOpenTerminalAt: (taskId: string, cwd: string) => void
  /** Mark a pending terminal request as consumed by the drawer. */
  consumeTerminalRequest: (taskId: string, requestId: number) => void
  setTaskMode: (taskId: string, modeId: string) => void
  setTaskModel: (taskId: string, modelId: string) => void
  loadTasks: () => Promise<void>
  /** Inflate an archived thread from disk into `tasks` so its messages can be
   *  rendered. No-op if already hydrated. Returns true on success. */
  hydrateArchivedTask: (id: string) => Promise<boolean>
  setConnected: (v: boolean) => void
  /** Update the rich connection status */
  setConnectionStatus: (status: ConnectionStatus) => void
  /** Set a dispatch snapshot for optimistic UI tracking */
  setDispatchSnapshot: (taskId: string, snapshot: LocalDispatchSnapshot | null) => void
  /** Atomically move a dispatch snapshot from one task id to another. */
  rekeyDispatchSnapshot: (fromTaskId: string, toTaskId: string) => void
  persistHistory: () => void
  persistUiState: () => void
  clearHistory: () => Promise<void>
  resolveWorktreeCleanup: (remove: boolean) => void
  enterBtwMode: (taskId: string, question: string) => void
  exitBtwMode: (keepTail: boolean) => void
  /** Create a saved split view pairing and activate it */
  createSplitView: (left: string, right: string) => string
  /** Remove a saved split view */
  removeSplitView: (id: string) => void
  /** Replace the left or right thread in a split view */
  replaceSplitThread: (splitId: string, side: 'left' | 'right', threadId: string) => void
  /** Pin a thread to the top of the sidebar */
  pinThread: (id: string) => void
  /** Unpin a thread from the sidebar */
  unpinThread: (id: string) => void
  /** Activate a saved split view (null to deactivate) */
  setActiveSplit: (id: string | null) => void
  /** Update the active split view's ratio */
  setSplitRatio: (ratio: number) => void
  /** Set which panel is focused */
  setFocusedPanel: (panel: 'left' | 'right') => void
  /** Deactivate split view without removing the saved pairing */
  closeSplit: () => void
  /** Save scroll position for a thread (in-memory only) */
  saveScrollPosition: (taskId: string, scrollTop: number) => void
  /**
   * Truncate messages back to the assistant turn at `messageIndex`
   * (keeping the assistant message itself) and clear streaming state.
   * If the task has a worktree+checkpoint mechanism wired, the caller can
   * additionally invoke `ipc.checkpointRevert` to roll the files back.
   */
  rollbackToMessage: (taskId: string, messageIndex: number) => void
}
