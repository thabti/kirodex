import type { AgentTask, ActivityEntry, ToolCall, PlanStep, SoftDeletedThread, CompactionStatus, Attachment, ProjectFile, IpcAttachment } from '@/types'
import type { PastedChunk } from '@/hooks/useChatInput'

export interface QueuedMessage {
  readonly text: string
  readonly attachments?: readonly IpcAttachment[]
}

export interface BtwCheckpoint {
  readonly taskId: string
  readonly messages: readonly import('@/types').TaskMessage[]
  readonly question: string
}

export interface TaskStore {
  tasks: Record<string, AgentTask>
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
  /** Queued messages per task — typed while agent is running, sent on turn end */
  queuedMessages: Record<string, QueuedMessage[]>
  activityFeed: ActivityEntry[]
  connected: boolean
  terminalOpenTasks: Set<string>
  /** Workspace-level terminal open state (for PendingChat when no task is selected) */
  isWorkspaceTerminalOpen: boolean
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
  /** Whether a fork operation is in progress */
  isForking: boolean
  /** Workspace path of the most recently added project (for auto-focus) */
  lastAddedProject: string | null
  /** Pending worktree cleanup — set when a worktree thread is being deleted/archived */
  worktreeCleanupPending: { taskId: string; worktreePath: string; branch: string; originalWorkspace: string; action: 'archive' | 'delete'; hasChanges: boolean | null } | null
  setSelectedTask: (id: string | null) => void
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
  setTaskMode: (taskId: string, modeId: string) => void
  loadTasks: () => Promise<void>
  setConnected: (v: boolean) => void
  persistHistory: () => void
  clearHistory: () => Promise<void>
  resolveWorktreeCleanup: (remove: boolean) => void
  enterBtwMode: (taskId: string, question: string) => void
  exitBtwMode: (keepTail: boolean) => void
}
