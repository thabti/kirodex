export type TaskStatus = 'running' | 'paused' | 'completed' | 'error' | 'cancelled' | 'pending_permission'

// ── Tool calls (matches ACP ToolCall / ToolCallUpdate) ────────────

export type ToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other'
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface ToolCallLocation {
  path: string
  line?: number | null
}

export interface ToolCallContentItem {
  type: 'content' | 'diff' | 'terminal'
  /** For type=content: text block */
  text?: string
  /** For type=diff */
  path?: string
  oldText?: string | null
  newText?: string
  /** For type=terminal */
  terminalId?: string
}

export interface ToolCall {
  toolCallId: string
  title: string
  status: ToolCallStatus
  kind?: ToolKind
  locations?: ToolCallLocation[]
  content?: ToolCallContentItem[]
  rawInput?: unknown
  rawOutput?: unknown
}

// ── Plan (matches ACP Plan / PlanEntry) ───────────────────────────

export type PlanEntryStatus = 'pending' | 'in_progress' | 'completed'
export type PlanEntryPriority = 'high' | 'medium' | 'low'

export interface PlanStep {
  content: string
  status: PlanEntryStatus
  priority: PlanEntryPriority
}

// ── Messages ──────────────────────────────────────────────────────

export interface TaskMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  thinking?: string
  questionAnswers?: { question: string; answer: string }[]
}

// ── Task ──────────────────────────────────────────────────────────

export type CompactionStatus = 'idle' | 'compacting' | 'completed' | 'failed'

export interface AgentTask {
  id: string
  name: string
  workspace: string
  status: TaskStatus
  createdAt: string
  messages: TaskMessage[]
  pendingPermission?: {
    requestId: string
    toolName: string
    description: string
    options: Array<{ optionId: string; name: string; kind: string }>
  }
  /** Live tool calls for the current turn (cleared on turn end) */
  liveToolCalls?: ToolCall[]
  /** Live thinking text for the current turn */
  liveThinking?: string
  /** Current plan */
  plan?: PlanStep[]
  /** Context usage: used / size */
  contextUsage?: { used: number; size: number } | null
  /** Current compaction status */
  compactionStatus?: CompactionStatus
  agentProfileId?: string
  /** True only when the user explicitly hit Pause mid-run (not draft/idle) */
  userPaused?: boolean
  /** Task ID of the parent thread this was forked from */
  parentTaskId?: string
  /** True for threads restored from persisted history (read-only) */
  isArchived?: boolean
  /** Path to the git worktree directory, if this thread uses one */
  worktreePath?: string
  /** Original workspace path before worktree was created */
  originalWorkspace?: string
  /** Canonical project workspace path — threads always group under this */
  projectId?: string
}

// ── Soft-deleted threads ──────────────────────────────────────────

export interface SoftDeletedThread {
  readonly task: AgentTask
  readonly deletedAt: string
}

// ── Profiles ──────────────────────────────────────────────────────

export interface AgentProfile {
  id: string
  name: string
  agentId: string
  tags: string[]
  isDefault: boolean
}

export interface ActivityEntry {
  taskId: string
  taskName: string
  status: TaskStatus
  timestamp: string
}

export interface ProjectPrefs {
  modelId?: string | null
  autoApprove?: boolean
  worktreeEnabled?: boolean
  symlinkDirectories?: string[]
  tightSandbox?: boolean
  iconOverride?: { type: 'framework'; id: string } | { type: 'file'; path: string } | null
}

export type SidebarPosition = 'left' | 'right'
export type ThemeMode = 'dark' | 'light' | 'system'

export interface AppSettings {
  kiroBin: string
  agentProfiles: AgentProfile[]
  fontSize: number
  defaultModel?: string | null
  autoApprove?: boolean
  respectGitignore?: boolean
  coAuthor?: boolean
  coAuthorJsonReport?: boolean
  notifications?: boolean
  soundNotifications?: boolean
  projectPrefs?: Record<string, ProjectPrefs>
  hasOnboardedV2?: boolean
  sidebarPosition?: SidebarPosition
  /** Theme mode: dark, light, or system (follows OS preference). Default: dark. */
  theme?: ThemeMode
  /** Opt-in flag for anonymous product analytics. Default: true. */
  analyticsEnabled?: boolean
  /** Random UUID generated on first opt-in, cleared on opt-out. */
  analyticsAnonId?: string | null
  /** Max character limit for /btw side questions. Default: 1220. */
  btwMaxChars?: number
}

export interface ProjectFile {
  path: string
  name: string
  dir: string
  isDir: boolean
  ext: string
  /** Git status: "M" modified, "A" added/new, "D" deleted, "R" renamed, "" clean */
  gitStatus?: string
  /** Lines added in working copy (0 if unchanged) */
  linesAdded?: number
  /** Lines deleted in working copy (0 if unchanged) */
  linesDeleted?: number
  /** File modification time as Unix epoch seconds */
  modifiedAt: number
}

// ── Kiro Configuration Types ──────────────────────────────────────

export interface KiroAgent {
  name: string
  description: string
  tools: string[]
  source: 'global' | 'local'
  filePath: string
}

export interface KiroSkill {
  name: string
  source: 'global' | 'local'
  filePath: string
}

export interface KiroSteeringRule {
  name: string
  alwaysApply: boolean
  source: 'global' | 'local'
  excerpt: string
  filePath: string
}

export interface KiroMcpServer {
  name: string
  enabled: boolean
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  error?: string
  filePath: string
  status?: 'connecting' | 'ready' | 'needs-auth' | 'error'
  oauthUrl?: string
}

export interface KiroConfig {
  agents: KiroAgent[]
  skills: KiroSkill[]
  steeringRules: KiroSteeringRule[]
  mcpServers?: KiroMcpServer[]
}

// ── Attachments ───────────────────────────────────────────────────

export type AttachmentType = 'image' | 'text' | 'binary'

export interface Attachment {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly type: AttachmentType
  readonly size: number
  readonly mimeType: string
  /** Base64 data URL for image previews */
  preview?: string
  /** Text content for text files */
  textContent?: string
  /** Base64 content for binary embedding */
  base64Content?: string
}

/** Structured image attachment data sent to the Rust backend via IPC (fix #14). */
export interface IpcAttachment {
  readonly base64: string
  readonly mimeType: string
  readonly name: string
}

// ── Debug Panel Types ─────────────────────────────────────────────

export type DebugCategory = 'notification' | 'request' | 'response' | 'error' | 'stderr' | 'lifecycle'

export interface DebugLogEntry {
  id: number
  timestamp: string
  direction: 'in' | 'out'
  category: DebugCategory
  type: string
  taskId: string | null
  summary: string
  payload: unknown
  isError: boolean
  mcpServerName?: string
}

// ── JS Debug Panel Types ──────────────────────────────────────────

export type JsDebugCategory = 'log' | 'warn' | 'error' | 'exception' | 'network' | 'rust'

export interface JsDebugEntry {
  readonly id: number
  readonly timestamp: string
  readonly category: JsDebugCategory
  readonly message: string
  readonly detail: string
  readonly isError: boolean
  /** Active task ID at capture time */
  readonly taskId?: string | null
  /** Active thread name at capture time */
  readonly threadName?: string | null
  /** Active project (workspace basename) at capture time */
  readonly projectName?: string | null
  /** Network request fields */
  readonly url?: string
  readonly method?: string
  readonly status?: number
  readonly duration?: number
}
