import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AgentTask, AppSettings, KiroConfig, ToolCall, PlanStep, DebugLogEntry, ProjectFile } from '@/types'

type UnsubscribeFn = () => void

const tauriListen = <T>(event: string, cb: (payload: T) => void): UnsubscribeFn => {
  let unlisten: (() => void) | null = null
  let cleaned = false
  const ready = listen<T>(event, (e) => { if (!cleaned) cb(e.payload) })
  ready.then((fn) => {
    if (cleaned) {
      try { fn() } catch { /* already unregistered */ }
    } else {
      unlisten = fn
    }
  }).catch((err) => {
    console.warn(`[tauriListen] failed to register "${event}":`, err)
  })
  return () => {
    if (cleaned) return
    cleaned = true
    if (unlisten) {
      try { unlisten() } catch { /* already unregistered */ }
    } else {
      ready.then((fn) => { try { fn() } catch { /* noop */ } }).catch(() => {})
    }
  }
}

export const ipc = {
  createTask: (params: { name: string; workspace: string; prompt: string; autoApprove?: boolean }): Promise<AgentTask> =>
    invoke('task_create', { params }),
  listTasks: (): Promise<AgentTask[]> =>
    invoke('task_list'),
  sendMessage: (taskId: string, message: string): Promise<void> =>
    invoke('task_send_message', { taskId, message }),
  pauseTask: (taskId: string): Promise<void> =>
    invoke('task_pause', { taskId }),
  resumeTask: (taskId: string): Promise<void> =>
    invoke('task_resume', { taskId }),
  cancelTask: (taskId: string): Promise<void> =>
    invoke('task_cancel', { taskId }),
  deleteTask: (taskId: string): Promise<void> =>
    invoke('task_delete', { taskId }),
  allowPermission: (taskId: string, requestId: string, optionId?: string): Promise<void> =>
    invoke('task_allow_permission', { taskId, requestId, optionId }),
  denyPermission: (taskId: string, requestId: string, optionId?: string): Promise<void> =>
    invoke('task_deny_permission', { taskId, requestId, optionId }),
  selectPermissionOption: (taskId: string, requestId: string, optionId: string): Promise<void> =>
    invoke('task_allow_permission', { taskId, requestId, optionId }),
  pickFolder: (): Promise<string | null> =>
    invoke('pick_folder'),
  detectKiroCli: (): Promise<string | null> =>
    invoke('detect_kiro_cli'),
  listModels: (kiroBin?: string): Promise<{ availableModels: Array<{ modelId: string; name: string; description?: string | null }>; currentModelId: string | null }> =>
    invoke('list_models', { kiroBin }),
  probeCapabilities: (): Promise<{ ok: boolean }> =>
    invoke('probe_capabilities'),
  getSettings: (): Promise<AppSettings> =>
    invoke('get_settings'),
  saveSettings: (settings: AppSettings): Promise<void> =>
    invoke('save_settings', { settings }),
  gitDetect: (path: string): Promise<boolean> =>
    invoke('git_detect', { path }),
  gitListBranches: (cwd: string): Promise<{
    local: Array<{ name: string; current: boolean }>;
    remotes: Record<string, Array<{ name: string; fullRef: string }>>;
    currentBranch: string;
  }> =>
    invoke('git_list_branches', { cwd }),
  gitCheckout: (cwd: string, branch: string): Promise<{ branch: string }> =>
    invoke('git_checkout', { cwd, branch }),
  gitCreateBranch: (cwd: string, branch: string): Promise<{ branch: string }> =>
    invoke('git_create_branch', { cwd, branch }),
  getTaskDiff: (taskId: string): Promise<string> =>
    invoke('task_diff', { taskId }),
  gitDiffFile: (taskId: string, filePath: string): Promise<string> =>
    invoke('git_diff_file', { taskId, filePath }),
  gitDiffStats: (cwd: string): Promise<{ additions: number; deletions: number; fileCount: number }> =>
    invoke('git_diff_stats', { cwd }),
  openInEditor: (path: string, editor: string): Promise<void> =>
    invoke('open_in_editor', { path, editor }),
  detectEditors: (): Promise<string[]> =>
    invoke('detect_editors'),
  gitCommit: (taskId: string, message: string): Promise<void> =>
    invoke('git_commit', { taskId, message }),
  gitPush: (taskId: string): Promise<void> =>
    invoke('git_push', { taskId }),
  gitStage: (taskId: string, filePath: string): Promise<void> =>
    invoke('git_stage', { taskId, filePath }),
  gitRevert: (taskId: string, filePath: string): Promise<void> =>
    invoke('git_revert', { taskId, filePath }),
  setMode: (taskId: string, modeId: string): Promise<void> =>
    invoke('set_mode', { taskId, modeId }),
  ptyCreate: (id: string, cwd: string): Promise<void> =>
    invoke('pty_create', { id, cwd }),
  ptyWrite: (id: string, data: string): Promise<void> =>
    invoke('pty_write', { id, data }),
  ptyResize: (id: string, cols: number, rows: number): Promise<void> =>
    invoke('pty_resize', { id, cols, rows }),
  ptyKill: (id: string): Promise<void> =>
    invoke('pty_kill', { id }),
  getKiroConfig: (projectPath?: string): Promise<KiroConfig> =>
    invoke('get_kiro_config', { projectPath }),
  readFile: (filePath: string): Promise<string | null> =>
    invoke('read_text_file', { path: filePath }),
  readFileBase64: (filePath: string): Promise<string | null> =>
    invoke('read_file_base64', { path: filePath }),
  listProjectFiles: (root: string, respectGitignore: boolean = true): Promise<ProjectFile[]> =>
    invoke('list_project_files', { root, respectGitignore }),
  openUrl: (url: string): Promise<void> =>
    invoke('open_url', { url }),
  // Event listeners
  onTaskUpdate: (cb: (task: AgentTask) => void): UnsubscribeFn =>
    tauriListen('task_update', cb),
  onMessageChunk: (cb: (data: { taskId: string; chunk: string }) => void): UnsubscribeFn =>
    tauriListen('message_chunk', cb),
  onPtyData: (cb: (data: { id: string; data: string }) => void): UnsubscribeFn =>
    tauriListen('pty_data', cb),
  onPtyExit: (cb: (data: { id: string }) => void): UnsubscribeFn =>
    tauriListen('pty_exit', cb),
  onToolCall: (cb: (data: { taskId: string; toolCall: ToolCall }) => void): UnsubscribeFn =>
    tauriListen('tool_call', cb),
  onToolCallUpdate: (cb: (data: { taskId: string; toolCall: ToolCall }) => void): UnsubscribeFn =>
    tauriListen('tool_call_update', cb),
  onThinkingChunk: (cb: (data: { taskId: string; chunk: string }) => void): UnsubscribeFn =>
    tauriListen('thinking_chunk', cb),
  onPlanUpdate: (cb: (data: { taskId: string; plan: PlanStep[] }) => void): UnsubscribeFn =>
    tauriListen('plan_update', cb),
  onUsageUpdate: (cb: (data: { taskId: string; used: number; size: number }) => void): UnsubscribeFn =>
    tauriListen('usage_update', cb),
  onTurnEnd: (cb: (data: { taskId: string }) => void): UnsubscribeFn =>
    tauriListen('turn_end', cb),
  onDebugLog: (cb: (entry: DebugLogEntry) => void): UnsubscribeFn =>
    tauriListen('debug_log', cb),
  onSessionInit: (cb: (data: { taskId: string; models: unknown; modes: unknown; configOptions: unknown }) => void): UnsubscribeFn =>
    tauriListen('session_init', cb),
  onMcpUpdate: (cb: (data: { serverName: string; status: string; error?: string; oauthUrl?: string }) => void): UnsubscribeFn =>
    tauriListen('mcp_update', cb),
  onMcpConnecting: (cb: () => void): UnsubscribeFn =>
    tauriListen('mcp_connecting', cb),
  onCommandsUpdate: (cb: (data: { taskId: string; commands: Array<{ name: string; description?: string; inputType?: string }>; mcpServers?: Array<{ name: string; status: string; toolCount: number }> }) => void): UnsubscribeFn =>
    tauriListen('commands_update', cb),
  onTaskError: (cb: (data: { taskId: string; message: string }) => void): UnsubscribeFn =>
    tauriListen('task_error', cb),
}
