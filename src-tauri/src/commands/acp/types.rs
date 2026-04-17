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
    ForkSession(oneshot::Sender<Result<String, String>>),
    Kill,
}

// ── Per-task connection handle ─────────────────────────────────────────

pub struct ConnectionHandle {
    pub cmd_tx: mpsc::UnboundedSender<AcpCommand>,
    pub alive: Arc<std::sync::atomic::AtomicBool>,
    pub auto_approve: Arc<std::sync::atomic::AtomicBool>,
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
    pub attachments: Option<Vec<AttachmentData>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkTaskParams {
    pub task_id: String,
    pub workspace: Option<String>,
    pub parent_name: Option<String>,
}
