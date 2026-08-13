use std::collections::HashMap;
use parking_lot::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

use std::sync::Arc;

// ── Frontend-facing types (match Electron's JSON shape) ────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallData {
    pub tool_call_id: String,
    pub title: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locations: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub content: String,
    pub status: String,
    pub priority: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingPermission {
    pub request_id: String,
    pub tool_name: String,
    pub description: String,
    pub options: Vec<PermissionOption>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

impl ReasoningEffort {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Xhigh => "xhigh",
            Self::Max => "max",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub name: String,
    pub workspace: String,
    pub status: String,
    pub created_at: String,
    pub messages: Vec<TaskMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_permission: Option<PendingPermission>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan: Option<Vec<PlanStep>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_usage: Option<ContextUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_approve: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_paused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContextUsage {
    pub used: u64,
    pub size: u64,
}

// ── Image attachment data sent from the frontend (fix #14) ─────────────

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentData {
    pub base64: String,
    pub mime_type: String,
    pub name: Option<String>,
}

// ── Commands sent to the ACP connection thread ─────────────────────────

pub enum AcpCommand {
    Prompt(String, Vec<AttachmentData>),
    Cancel,
    SetMode(String),
    SetModel(String),
    Kill,
}

// ── Per-task connection handle ─────────────────────────────────────────

pub struct ConnectionHandle {
    pub cmd_tx: mpsc::UnboundedSender<AcpCommand>,
    pub alive: Arc<std::sync::atomic::AtomicBool>,
    /// Becomes true only after ACP initialization and session setup complete.
    pub ready: Arc<std::sync::atomic::AtomicBool>,
    pub auto_approve: Arc<std::sync::atomic::AtomicBool>,
}

impl ConnectionHandle {
    pub fn wait_until_ready(&self, timeout: std::time::Duration) -> Result<(), String> {
        let started_at = std::time::Instant::now();
        loop {
            if self.ready.load(std::sync::atomic::Ordering::Acquire) {
                return Ok(());
            }
            if !self.alive.load(std::sync::atomic::Ordering::Acquire) {
                return Err("The replacement Kiro session could not start".to_string());
            }
            if started_at.elapsed() >= timeout {
                return Err("Timed out while starting the replacement Kiro session".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}

// ── Global ACP state ───────────────────────────────────────────────────

pub struct AcpState {
    pub tasks: Mutex<HashMap<String, Task>>,
    pub connections: Mutex<HashMap<String, ConnectionHandle>>,
    pub permission_resolvers: Mutex<HashMap<String, oneshot::Sender<PermissionReply>>>,
    /// Guard to prevent concurrent probe_capabilities calls
    pub probe_running: std::sync::atomic::AtomicBool,
}

pub struct PermissionReply {
    pub option_id: String,
}

impl Default for AcpState {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
            permission_resolvers: Mutex::new(HashMap::new()),
            probe_running: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskParams {
    pub name: String,
    pub workspace: String,
    pub prompt: String,
    pub auto_approve: Option<bool>,
    pub mode_id: Option<String>,
    /// Optional model id to apply right after the ACP session is created.
    /// Falls back to project pref → global `defaultModel` → CLI default
    /// when not provided.
    pub model_id: Option<String>,
    /// Optional reasoning effort applied when the ACP subprocess starts.
    pub effort: Option<ReasoningEffort>,
    pub attachments: Option<Vec<AttachmentData>>,
    /// When provided, the backend reuses this id and seeds the task with the
    /// supplied historical messages instead of generating a new uuid. Used for
    /// stateless resumption: the frontend keeps the original thread
    /// id while spawning a fresh kiro-cli connection.
    pub existing_id: Option<String>,
    /// Prior messages to seed the task with (resumed threads pass their full
    /// history so it shows up in the timeline before the user's new prompt).
    pub existing_messages: Option<Vec<TaskMessage>>,
    /// When true, register the task in state but do not spawn a kiro-cli
    /// subprocess and do not push an empty user message. The connection is
    /// spawned lazily on the first call to `task_send_message`. Used by the
    /// worktree creation flow which pre-creates a thread before the user has
    /// typed anything.
    #[serde(default)]
    pub defer_spawn: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkTaskParams {
    pub task_id: String,
    pub workspace: Option<String>,
    pub parent_name: Option<String>,
}
