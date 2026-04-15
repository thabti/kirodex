use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn now_rfc3339() -> String {
    // Produce a UTC timestamp like 2024-01-15T12:30:45Z
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    // Days/hours/minutes/seconds from epoch
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;
    // Date from days since epoch (simplified Gregorian)
    let (y, mo, day) = days_to_ymd(days);
    format!("{y:04}-{mo:02}-{day:02}T{h:02}:{m:02}:{s:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from Howard Hinnant's chrono-compatible date library
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

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

// ── Commands sent to the ACP connection thread ─────────────────────────

pub enum AcpCommand {
    Prompt(String),
    Cancel,
    SetMode(String),
    ForkSession(oneshot::Sender<Result<String, String>>),
    Kill,
}

// ── Per-task connection handle ─────────────────────────────────────────

pub struct ConnectionHandle {
    pub cmd_tx: mpsc::UnboundedSender<AcpCommand>,
    pub alive: Arc<std::sync::atomic::AtomicBool>,
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

// ── ACP connection spawner ─────────────────────────────────────────────
// The ACP Rust SDK uses !Send futures, so we run each connection on a
// dedicated single-threaded tokio runtime in its own OS thread.
// Communication happens via channels.

use agent_client_protocol as acp;
use acp::Agent as _; // Brings initialize, new_session, prompt, cancel, set_session_mode into scope
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

struct KirodexClient {
    task_id: String,
    workspace: String,
    app: tauri::AppHandle,
    auto_approve: bool,
    perm_tx: mpsc::UnboundedSender<(String, acp::RequestPermissionRequest, oneshot::Sender<PermissionReply>)>,
    /// Paths outside the workspace that the user explicitly mentioned in messages.
    /// These are allowed through the sandbox.
    allowed_paths: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
}

/// Check whether `path` is inside `workspace` after canonicalization.
/// Returns false for paths that escape via `..`, symlinks to outside, or sibling dirs.
fn is_within_workspace(workspace: &str, path: &str) -> bool {
    let ws = match std::fs::canonicalize(workspace) {
        Ok(p) => p,
        Err(_) => return std::path::Path::new(path).starts_with(workspace),
    };
    // Try to canonicalize the full path first (works if file exists)
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical.starts_with(&ws);
    }
    // File doesn't exist yet — canonicalize the parent directory instead
    let p = std::path::Path::new(path);
    if let Some(parent) = p.parent() {
        if let Ok(canonical_parent) = std::fs::canonicalize(parent) {
            return canonical_parent.starts_with(&ws);
        }
    }
    false
}

/// Extract absolute file paths from user message text.
/// Matches tokens that start with `/` and look like file paths.
fn extract_paths_from_message(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for token in text.split_whitespace() {
        // Strip surrounding backticks, quotes, parens
        let cleaned = token.trim_matches(|c: char| c == '`' || c == '\'' || c == '"' || c == '(' || c == ')' || c == '[' || c == ']');
        if cleaned.starts_with('/') && cleaned.len() > 1 && cleaned.contains('/') {
            // Must look like a file path (has at least one path separator beyond the root)
            let segments: Vec<&str> = cleaned.split('/').filter(|s| !s.is_empty()).collect();
            if segments.len() >= 2 {
                paths.push(cleaned.to_string());
            }
        }
    }
    paths
}

/// Check if a path is allowed by the user-mentioned paths set.
/// Matches if the requested path starts with (is inside) any allowed path,
/// or if any allowed path starts with the requested path's directory.
fn is_path_allowed(allowed: &std::collections::HashSet<String>, path: &str) -> bool {
    let p = std::path::Path::new(path);
    for allowed_path in allowed {
        let ap = std::path::Path::new(allowed_path);
        // Exact match or requested path is under an allowed directory
        if p.starts_with(ap) || p == ap {
            return true;
        }
        // Allowed path is a file, and the request is for the same file
        // or a file in the same directory
        if let Some(allowed_parent) = ap.parent() {
            if p.starts_with(allowed_parent) {
                return true;
            }
        }
    }
    false
}

#[async_trait::async_trait(?Send)]
impl acp::Client for KirodexClient {
    async fn session_notification(&self, args: acp::SessionNotification) -> acp::Result<()> {
        let tid = &self.task_id;
        // Serialize the update to JSON Value so we can inspect the sessionUpdate field
        let val = serde_json::to_value(&args).unwrap_or_default();
        let update = val.get("update").unwrap_or(&val);
        let update_type = update.get("sessionUpdate").and_then(|v| v.as_str()).unwrap_or("");

        use tauri::Emitter;
        match update_type {
            "agent_message_chunk" => {
                let text = update.get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    let _ = self.app.emit("message_chunk", serde_json::json!({
                        "taskId": tid, "chunk": text
                    }));
                }
            }
            "agent_thought_chunk" => {
                let text = update.get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    let _ = self.app.emit("thinking_chunk", serde_json::json!({
                        "taskId": tid, "chunk": text
                    }));
                }
            }
            "tool_call" => {
                let _ = self.app.emit("tool_call", serde_json::json!({
                    "taskId": tid, "toolCall": update
                }));
            }
            "tool_call_update" => {
                let _ = self.app.emit("tool_call_update", serde_json::json!({
                    "taskId": tid, "toolCall": update
                }));
            }
            "plan" => {
                let _ = self.app.emit("plan_update", serde_json::json!({
                    "taskId": tid, "plan": update.get("entries")
                }));
            }
            "usage_update" => {
                let used = update.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
                let size = update.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                let _ = self.app.emit("usage_update", serde_json::json!({
                    "taskId": tid, "used": used, "size": size
                }));
            }
            _ => {
                log::debug!("[ACP] unhandled notification: {update_type}");
            }
        }

        // Also emit to debug log
        let _ = self.app.emit("debug_log", serde_json::json!({
            "direction": "in", "category": "notification", "type": update_type,
            "taskId": tid, "summary": update_type, "payload": update, "isError": false
        }));

        Ok(())
    }

    async fn request_permission(&self, args: acp::RequestPermissionRequest) -> acp::Result<acp::RequestPermissionResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();

        // Extract options
        let options: Vec<PermissionOption> = val.get("options")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|o| {
                Some(PermissionOption {
                    option_id: o.get("optionId")?.as_str()?.to_string(),
                    name: o.get("name")?.as_str()?.to_string(),
                    kind: o.get("kind")?.as_str()?.to_string(),
                })
            }).collect())
            .unwrap_or_default();

        // Auto-approve logic (matches Electron)
        if self.auto_approve {
            let allow_opt = options.iter()
                .find(|o| o.kind == "allow_once")
                .or_else(|| options.iter().find(|o| o.kind == "allow_always"))
                .or_else(|| options.first());
            if let Some(opt) = allow_opt {
                return Ok(acp::RequestPermissionResponse::new(
                    acp::RequestPermissionOutcome::Selected(
                        acp::SelectedPermissionOutcome::new(opt.option_id.clone()),
                    ),
                ));
            }
        }

        // Send to main thread for UI handling
        let (reply_tx, reply_rx) = oneshot::channel();
        let request_id = format!("perm-{}", now_millis());
        let _ = self.perm_tx.send((request_id.clone(), args, reply_tx));

        // Wait for user response (5 min timeout to prevent indefinite hang)
        match tokio::time::timeout(std::time::Duration::from_secs(300), reply_rx).await {
            Ok(Ok(reply)) => {
                Ok(acp::RequestPermissionResponse::new(
                    acp::RequestPermissionOutcome::Selected(
                        acp::SelectedPermissionOutcome::new(reply.option_id),
                    ),
                ))
            }
            Ok(Err(_)) | Err(_) => {
                log::warn!("[ACP] Permission request {} timed out or was dropped", request_id);
                Ok(acp::RequestPermissionResponse::new(
                    acp::RequestPermissionOutcome::Cancelled,
                ))
            }
        }
    }

    async fn ext_notification(&self, args: acp::ExtNotification) -> acp::Result<()> {
        let method = args.method.as_ref();
        let params = serde_json::to_value(&args).unwrap_or_default();

        use tauri::Emitter;

        // Normalize method: strip leading underscore if present (ACP SDK may vary)
        let method_normalized = method.strip_prefix('_').unwrap_or(method);

        // MCP server tracking
        if method_normalized == "kiro.dev/mcp/server_initialized" {
            if let Some(name) = params.get("serverName").and_then(|v| v.as_str()) {
                let _ = self.app.emit("mcp_update", serde_json::json!({
                    "serverName": name, "status": "ready"
                }));
            }
        }
        if method_normalized == "kiro.dev/mcp/oauth_request" {
            if let Some(name) = params.get("serverName").and_then(|v| v.as_str()) {
                let _ = self.app.emit("mcp_update", serde_json::json!({
                    "serverName": name, "status": "needs-auth",
                    "oauthUrl": params.get("oauthUrl")
                }));
            }
        }
        // Commands / MCP servers available
        if method_normalized == "kiro.dev/commands/available" {
            let _ = self.app.emit("commands_update", serde_json::json!({
                "taskId": self.task_id,
                "commands": params.get("commands").cloned().unwrap_or(Value::Array(vec![])),
                "mcpServers": params.get("mcpServers").cloned().unwrap_or(Value::Array(vec![]))
            }));
        }
        // Compaction status — forward so the frontend can show compacting indicator
        if method_normalized == "kiro.dev/compaction/status" {
            let status_type = params.get("status")
                .and_then(|s| s.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("unknown");
            let _ = self.app.emit("compaction_status", serde_json::json!({
                "taskId": self.task_id,
                "status": status_type,
                "summary": params.get("summary").cloned().unwrap_or(Value::Null)
            }));
        }
        // Subagent lifecycle — forward so the frontend can track subagent sessions
        if method_normalized == "kiro.dev/subagent/list_update" {
            let _ = self.app.emit("subagent_update", serde_json::json!({
                "taskId": self.task_id,
                "subagents": params.get("subagents").cloned().unwrap_or(Value::Array(vec![])),
                "pendingStages": params.get("pendingStages").cloned().unwrap_or(Value::Array(vec![]))
            }));
        }

        // Skip noisy empty notifications from debug log
        if method.is_empty() && params.is_null() {
            return Ok(());
        }

        let _ = self.app.emit("debug_log", serde_json::json!({
            "direction": "in", "category": "notification", "type": format!("ext:{method}"),
            "taskId": self.task_id, "summary": format!("kiro notification: {method}"),
            "payload": params, "isError": false
        }));

        Ok(())
    }

    async fn read_text_file(&self, args: acp::ReadTextFileRequest) -> acp::Result<acp::ReadTextFileResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();
        let path = val.get("path").and_then(|v| v.as_str()).unwrap_or("");
        if !path.is_empty() && !is_within_workspace(&self.workspace, path) {
            let allowed = self.allowed_paths.lock().unwrap_or_else(|e| e.into_inner());
            if !is_path_allowed(&allowed, path) {
                log::warn!("[ACP] read_text_file blocked: '{}' is outside workspace '{}'", path, self.workspace);
                return Err(acp::Error::invalid_params().data(serde_json::json!({
                    "path": path,
                    "workspace": self.workspace,
                    "reason": "Path is outside the project workspace and was not mentioned by the user"
                })));
            }
        }
        match std::fs::read_to_string(path) {
            Ok(content) => Ok(serde_json::from_value(serde_json::json!({ "content": content })).unwrap()),
            Err(_) => Ok(serde_json::from_value(serde_json::json!({ "content": "" })).unwrap()),
        }
    }

    async fn write_text_file(&self, args: acp::WriteTextFileRequest) -> acp::Result<acp::WriteTextFileResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();
        let path = val.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let content = val.get("content").and_then(|v| v.as_str()).unwrap_or("");
        if !path.is_empty() && !is_within_workspace(&self.workspace, path) {
            let allowed = self.allowed_paths.lock().unwrap_or_else(|e| e.into_inner());
            if !is_path_allowed(&allowed, path) {
                log::warn!("[ACP] write_text_file blocked: '{}' is outside workspace '{}'", path, self.workspace);
                return Err(acp::Error::invalid_params().data(serde_json::json!({
                    "path": path,
                    "workspace": self.workspace,
                    "reason": "Path is outside the project workspace and was not mentioned by the user"
                })));
            }
        }
        let _ = std::fs::write(path, content);
        Ok(serde_json::from_value(serde_json::json!({})).unwrap())
    }

    async fn ext_method(&self, _args: acp::ExtRequest) -> acp::Result<acp::ExtResponse> {
        Err(acp::Error::method_not_found())
    }
}

// ── Spawn a kiro-cli ACP connection on a dedicated thread ──────────────

fn spawn_connection(
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: bool,
    app: tauri::AppHandle,
    initial_mode_id: Option<String>,
) -> Result<ConnectionHandle, String> {
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AcpCommand>();
    let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let alive_clone = alive.clone();

    let (perm_tx, mut perm_rx) = mpsc::unbounded_channel::<(
        String,
        acp::RequestPermissionRequest,
        oneshot::Sender<PermissionReply>,
    )>();

    // Spawn permission handler on the Tauri async runtime.
    // Uses the managed AcpState via app handle — NOT a cloned copy.
    let app2 = app.clone();
    let tid2 = task_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some((request_id, req, reply_tx)) = perm_rx.recv().await {
            let val = serde_json::to_value(&req).unwrap_or_default();
            let tool_call = val.get("toolCall");
            let tool_name = tool_call
                .and_then(|tc| tc.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("unknown")
                .to_string();
            let options: Vec<PermissionOption> = val.get("options")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|o| {
                    Some(PermissionOption {
                        option_id: o.get("optionId")?.as_str()?.to_string(),
                        name: o.get("name")?.as_str()?.to_string(),
                        kind: o.get("kind")?.as_str()?.to_string(),
                    })
                }).collect())
                .unwrap_or_default();
            let description = if tool_name != "unknown" {
                format!("{tool_name} requires permission")
            } else {
                "Permission requested".to_string()
            };

            // Access the MANAGED state — same instance that tauri commands use.
            use tauri::Manager;
            if let Some(managed_state) = app2.try_state::<AcpState>() {
                // Update task status
                if let Ok(mut tasks) = managed_state.tasks.lock() {
                    if let Some(task) = tasks.get_mut(&tid2) {
                        task.status = "pending_permission".to_string();
                        task.pending_permission = Some(PendingPermission {
                            request_id: request_id.clone(),
                            tool_name,
                            description,
                            options,
                        });
                        use tauri::Emitter;
                        let _ = app2.emit("task_update", task.clone());
                    }
                }

                // Store the reply sender in the MANAGED state
                if let Ok(mut resolvers) = managed_state.permission_resolvers.lock() {
                    resolvers.insert(request_id, reply_tx);
                }
            }
        }
    });

    // Spawn the ACP connection on a dedicated OS thread with its own single-threaded runtime.
    // Wrapped in catch_unwind to prevent silent thread death from orphaning channels.
    let app3 = app.clone();
    let tid3 = task_id.clone();
    let alive_for_panic = alive.clone();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for ACP");

            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async move {
                let result = run_acp_connection(
                    tid3.clone(), workspace, kiro_bin, auto_approve,
                    app3.clone(), perm_tx, &mut cmd_rx, initial_mode_id,
                ).await;

                alive_clone.store(false, std::sync::atomic::Ordering::SeqCst);

                if let Err(e) = result {
                    use tauri::Emitter;
                    let _ = app3.emit("debug_log", serde_json::json!({
                        "direction": "in", "category": "error", "type": "connection-error",
                        "taskId": tid3, "summary": e, "payload": { "error": e }, "isError": true
                    }));
                }
            });
        }));
        if result.is_err() {
            log::error!("[ACP] Connection thread panicked");
            alive_for_panic.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    });

    Ok(ConnectionHandle { cmd_tx, alive })
}

async fn run_acp_connection(
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: bool,
    app: tauri::AppHandle,
    perm_tx: mpsc::UnboundedSender<(String, acp::RequestPermissionRequest, oneshot::Sender<PermissionReply>)>,
    cmd_rx: &mut mpsc::UnboundedReceiver<AcpCommand>,
    initial_mode_id: Option<String>,
) -> Result<(), String> {
    // Spawn kiro-cli acp subprocess
    let mut child = tokio::process::Command::new(&kiro_bin)
        .arg("acp")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}", std::env::var("PATH").unwrap_or_default()))
        .spawn()
        .map_err(|e| format!("Failed to spawn kiro-cli: {e}"))?;

    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    // Pipe stderr to debug log
    let app_stderr = app.clone();
    let tid_stderr = task_id.clone();
    tokio::task::spawn_local(async move {
        use tokio::io::AsyncReadExt;
        let mut stderr = stderr;
        let mut buf = vec![0u8; 4096];
        loop {
            match stderr.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    use tauri::Emitter;
                    let _ = app_stderr.emit("debug_log", serde_json::json!({
                        "direction": "in", "category": "stderr", "type": "stderr",
                        "taskId": tid_stderr, "summary": &text[..text.len().min(120)],
                        "payload": text, "isError": false
                    }));
                }
                Err(_) => break,
            }
        }
    });

    let outgoing = stdin.compat_write();
    let incoming = stdout.compat();

    let allowed_paths = Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));

    let client = KirodexClient {
        task_id: task_id.clone(),
        workspace: workspace.clone(),
        app: app.clone(),
        auto_approve,
        perm_tx,
        allowed_paths: allowed_paths.clone(),
    };

    let (conn, io_future) = acp::ClientSideConnection::new(
        client, outgoing, incoming,
        |fut| { tokio::task::spawn_local(fut); },
    );

    // Run IO in background
    tokio::task::spawn_local(async move {
        if let Err(e) = io_future.await {
            log::error!("[ACP] IO error for task: {e}");
        }
    });

    // Initialize
    let init_req = acp::InitializeRequest::new(acp::ProtocolVersion::V1)
        .client_info(acp::Implementation::new("kirodex", "0.1.0").title("Kirodex"));
    conn.initialize(init_req).await.map_err(|e| format!("Initialize failed: {e}"))?;

    // Create session
    let session = conn.new_session(
        acp::NewSessionRequest::new(std::path::PathBuf::from(&workspace))
    ).await.map_err(|e| format!("New session failed: {e}"))?;

    let session_id = session.session_id.clone();

    // Emit session-init with models/modes/configOptions
    {
        let session_val = serde_json::to_value(&session).unwrap_or_default();
        let model_count = session_val.get("models")
            .and_then(|m| m.get("availableModels"))
            .and_then(|a| a.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let current_model = session_val.get("models")
            .and_then(|m| m.get("currentModelId"))
            .and_then(|v| v.as_str())
            .unwrap_or("none");
        let mode_count = session_val.get("modes")
            .and_then(|m| m.get("availableModes"))
            .and_then(|a| a.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        log::info!("[ACP] session_init for task={}: {} models (current={}), {} modes",
            task_id, model_count, current_model, mode_count);
        use tauri::Emitter;
        let _ = app.emit("session_init", serde_json::json!({
            "taskId": task_id,
            "models": session_val.get("models"),
            "modes": session_val.get("modes"),
            "configOptions": session_val.get("configOptions"),
        }));
        let _ = app.emit("mcp_connecting", Value::Null);
    }

    // Apply initial mode if provided (e.g. user switched to /plan before first message)
    if let Some(mode_id) = initial_mode_id {
        let _ = conn.set_session_mode(
            acp::SetSessionModeRequest::new(session_id.clone(), mode_id)
        ).await;
    }

    // Process commands from the main thread
    while let Some(cmd) = cmd_rx.recv().await {
        match cmd {
            AcpCommand::Prompt(text) => {
                // Extract absolute paths from user message to allow through the sandbox
                let external_paths = extract_paths_from_message(&text);
                if !external_paths.is_empty() {
                    if let Ok(mut allowed) = allowed_paths.lock() {
                        for p in &external_paths {
                            allowed.insert(p.clone());
                        }
                    }
                }
                let prompt_req = acp::PromptRequest::new(
                    session_id.clone(),
                    vec![text.into()],
                );
                match conn.prompt(prompt_req).await {
                    Ok(result) => {
                        let result_val = serde_json::to_value(&result).unwrap_or_default();
                        let stop_reason = result_val.get("stopReason")
                            .and_then(|v| v.as_str())
                            .unwrap_or("end_turn")
                            .to_string();
                        use tauri::Emitter;
                        let _ = app.emit("turn_end", serde_json::json!({ "taskId": task_id, "stopReason": stop_reason }));
                        let _ = app.emit("debug_log", serde_json::json!({
                            "direction": "in", "category": "response", "type": "turn-end",
                            "taskId": task_id, "summary": format!("turn ended: {stop_reason}"),
                            "payload": result_val, "isError": false
                        }));
                    }
                    Err(e) => {
                        use tauri::Emitter;
                        let err_str = e.to_string();
                        let message = if err_str.contains("ValidationException") {
                            format!("{err_str}\n\nTip: This often means the prompt is too large or too many concurrent requests are active. Try closing unused sessions or trimming alwaysApply context rules to reduce per-request token usage.")
                        } else {
                            err_str.clone()
                        };
                        let _ = app.emit("task_error", serde_json::json!({
                            "taskId": task_id, "message": message
                        }));
                        let _ = app.emit("debug_log", serde_json::json!({
                            "direction": "in", "category": "error", "type": "prompt-error",
                            "taskId": task_id, "summary": err_str,
                            "payload": { "error": err_str }, "isError": true
                        }));
                    }
                }
            }
            AcpCommand::Cancel => {
                let _ = conn.cancel(acp::CancelNotification::new(session_id.clone())).await;
            }
            AcpCommand::SetMode(mode_id) => {
                let _ = conn.set_session_mode(
                    acp::SetSessionModeRequest::new(session_id.clone(), mode_id)
                ).await;
            }
            AcpCommand::ForkSession(reply_tx) => {
                let result = conn.fork_session(
                    acp::ForkSessionRequest::new(session_id.clone(), std::path::PathBuf::from(&workspace))
                ).await;
                match result {
                    Ok(resp) => { let _ = reply_tx.send(Ok(resp.session_id.0.to_string())); }
                    Err(e) => { let _ = reply_tx.send(Err(e.to_string())); }
                }
            }
            AcpCommand::Kill => break,
        }
    }

    // Kill subprocess
    let _ = child.kill().await;
    Ok(())
}

// ── Tauri Commands ─────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskParams {
    pub name: String,
    pub workspace: String,
    pub prompt: String,
    pub auto_approve: Option<bool>,
    pub mode_id: Option<String>,
}

#[tauri::command]
pub fn task_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    params: CreateTaskParams,
) -> Result<Task, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings = settings_state.0.lock().map_err(|e| e.to_string())?;
    let auto_approve = params.auto_approve.unwrap_or(settings.settings.auto_approve);
    let kiro_bin = settings.settings.kiro_bin.clone();
    let co_author = settings.settings.co_author;
    let co_author_json_report = settings.settings.co_author_json_report;
    drop(settings);

    let task = Task {
        id: id.clone(),
        name: params.name,
        workspace: params.workspace.clone(),
        status: "running".to_string(),
        created_at: now.clone(),
        messages: vec![TaskMessage {
            role: "user".to_string(),
            content: params.prompt.clone(),
            timestamp: now,
            tool_calls: None,
            thinking: None,
        }],
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(auto_approve),
        user_paused: None,
        parent_task_id: None,
    };

    state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?.insert(id.clone(), task.clone());

    // Pass the app handle so spawn_connection can access managed state directly.
    // Previously this created a cloned AcpState, causing permission updates and
    // message history to diverge between the connection thread's copy and the
    // real managed state.

    let _is_plan_mode = params.mode_id.as_deref() == Some("kiro_planner");

    let handle = spawn_connection(
        id.clone(),
        params.workspace,
        kiro_bin,
        auto_approve,
        app.clone(),
        params.mode_id,
    )?;

    // Send initial prompt with UI formatting rules prepended (not shown in UI)
    let mut system_prefix = String::from(concat!(
        "## Structured questions\n\n",
        "When you need to ask the user clarifying questions before starting work, ",
        "use this exact format so the UI can render interactive question cards:\n\n",
        "[1]: Question text here?\n",
        "a. **Label** — Description of this option\n",
        "b. **Label** — Description of this option\n",
        "c. **Other** — Describe your preference\n\n",
        "Rules:\n",
        "- Use `[N]:` bracket-number format for each question (not bold, not numbered lists).\n",
        "- Use lowercase `a.` `b.` `c.` for options.\n",
        "- Place each question and its options on consecutive lines with no extra blank lines between them.\n",
        "- You may include a short lead-in sentence before the questions.\n\n",
        "---\n\n",
    ));
    if co_author {
        system_prefix.push_str(concat!(
            "## Commits\n\n",
            "Every git commit must include the co-author trailer:\n\n",
            "```\nCo-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>\n```\n\n",
            "Use conventional commit format: `type(scope): description`.\n\n",
            "---\n\n",
        ));
    }
    let json_report_suffix = if co_author_json_report {
        concat!(
            "\n\n## Completion report\n\n",
            "When you finish the task, append a JSON block at the very end of your final message.\n",
            "Use this exact format:\n\n",
            "```kirodex-report\n",
            "{\n",
            "  \"status\": \"done\" | \"partial\" | \"blocked\",\n",
            "  \"summary\": \"one-line description of what was done\",\n",
            "  \"filesChanged\": [\"path/to/file.ts\"],\n",
            "  \"linesAdded\": 42,\n",
            "  \"linesRemoved\": 7\n",
            "}\n",
            "```\n\n",
            "Only include the block once, at the end. Do not wrap it in any other code fence.\n",
        )
    } else {
        ""
    };
    let full_prompt = format!("{system_prefix}{}{json_report_suffix}", params.prompt);
    let _ = handle.cmd_tx.send(AcpCommand::Prompt(full_prompt));

    state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.insert(id, handle);

    Ok(task)
}

#[tauri::command]
pub fn task_list(state: tauri::State<'_, AcpState>) -> Result<Vec<Task>, String> {
    let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    Ok(tasks.values().cloned().collect())
}

#[tauri::command]
pub fn task_send_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    task_id: String,
    message: String,
) -> Result<Task, String> {
    // Push user message
    {
        let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
        task.messages.push(TaskMessage {
            role: "user".to_string(),
            content: message.clone(),
            timestamp: now_rfc3339(),
            tool_calls: None,
            thinking: None,
        });
        task.status = "running".to_string();
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }

    // Check if connection is alive, reconnect if needed
    let need_reconnect = {
        let conns = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        match conns.get(&task_id) {
            Some(h) => !h.alive.load(std::sync::atomic::Ordering::SeqCst),
            None => true,
        }
    };

    if need_reconnect {
        let settings = settings_state.0.lock().map_err(|e| e.to_string())?;
        let kiro_bin = settings.settings.kiro_bin.clone();
        let auto_approve = settings.settings.auto_approve;
        drop(settings);

        let workspace = {
            let tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
            tasks.get(&task_id).map(|t| t.workspace.clone()).ok_or("Task not found")?
        };

        // Destroy old connection
        if let Some(old) = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&task_id) {
            let _ = old.cmd_tx.send(AcpCommand::Kill);
        }

        let handle = spawn_connection(
            task_id.clone(), workspace, kiro_bin, auto_approve,
            app.clone(), None,
        )?;
        let _ = handle.cmd_tx.send(AcpCommand::Prompt(message));
        state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.insert(task_id.clone(), handle);
    } else {
        let conns = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        if let Some(h) = conns.get(&task_id) {
            let _ = h.cmd_tx.send(AcpCommand::Prompt(message));
        }
    }

    let tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    tasks.get(&task_id).cloned().ok_or_else(|| "Task not found".to_string())
}

#[tauri::command]
pub fn task_pause(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<Task, String> {
    if let Some(h) = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.get(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Cancel);
    }
    let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = "paused".to_string();
    task.user_paused = Some(true);
    use tauri::Emitter;
    let _ = app.emit("task_update", task.clone());
    Ok(task.clone())
}

#[tauri::command]
pub fn task_resume(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<Task, String> {
    if let Some(h) = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.get(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Prompt("continue".to_string()));
    }
    let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = "running".to_string();
    task.user_paused = Some(false);
    use tauri::Emitter;
    let _ = app.emit("task_update", task.clone());
    Ok(task.clone())
}

#[tauri::command]
pub fn task_cancel(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<(), String> {
    // Kill connection
    if let Some(h) = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Kill);
    }
    let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "cancelled".to_string();
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn task_delete(state: tauri::State<'_, AcpState>, task_id: String) -> Result<(), String> {
    if let Some(h) = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Kill);
    }
    state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&task_id);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkTaskParams {
    pub task_id: String,
    pub workspace: Option<String>,
    pub parent_name: Option<String>,
}

#[tauri::command]
pub async fn task_fork(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    params: ForkTaskParams,
) -> Result<Task, String> {
    let task_id = &params.task_id;
    // Read parent task if it exists in backend state
    let parent = {
        let tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        tasks.get(task_id).cloned()
    };
    let workspace = parent.as_ref().map(|p| p.workspace.clone())
        .or(params.workspace)
        .ok_or("No workspace found for task")?;
    let parent_name = parent.as_ref().map(|p| p.name.clone())
        .or(params.parent_name)
        .unwrap_or_else(|| "thread".to_string());
    let parent_messages = parent.as_ref().map(|p| p.messages.clone()).unwrap_or_default();
    let parent_auto_approve = parent.as_ref().and_then(|p| p.auto_approve);
    // Try ACP fork if the parent has a live connection (best-effort, non-blocking)
    let has_live_connection = {
        let conns = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        conns.get(task_id)
            .map(|h| h.alive.load(std::sync::atomic::Ordering::SeqCst))
            .unwrap_or(false)
    };
    if has_live_connection {
        let (reply_tx, reply_rx) = oneshot::channel();
        {
            let conns = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
            if let Some(handle) = conns.get(task_id) {
                let _ = handle.cmd_tx.send(AcpCommand::ForkSession(reply_tx));
            }
        }
        // Await the fork response with a timeout — non-blocking on the async runtime
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            reply_rx,
        ).await;
    }
    // Create a new task with parent messages
    let new_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings = settings_state.0.lock().map_err(|e| e.to_string())?;
    let auto_approve = parent_auto_approve.unwrap_or(settings.settings.auto_approve);
    let kiro_bin = settings.settings.kiro_bin.clone();
    drop(settings);
    let fork_task = Task {
        id: new_id.clone(),
        name: format!("fork: {}", parent_name),
        workspace: workspace.clone(),
        status: "paused".to_string(),
        created_at: now.clone(),
        messages: {
            let mut msgs = parent_messages;
            msgs.push(TaskMessage {
                role: "system".to_string(),
                content: format!("Forked from: {}", parent_name),
                timestamp: now,
                tool_calls: None,
                thinking: None,
            });
            msgs
        },
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(auto_approve),
        user_paused: None,
        parent_task_id: Some(task_id.clone()),
    };
    state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?.insert(new_id.clone(), fork_task.clone());
    // Spawn a new ACP connection for the forked task
    let handle = spawn_connection(
        new_id.clone(),
        workspace,
        kiro_bin,
        auto_approve,
        app,
        None,
    )?;
    state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?.insert(new_id, handle);
    Ok(fork_task)
}

#[tauri::command]
pub fn task_allow_permission(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    let resolved_id = if let Some(id) = option_id {
        id
    } else {
        let tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        tasks.get(&task_id)
            .and_then(|t| t.pending_permission.as_ref())
            .and_then(|pp| {
                pp.options.iter().find(|o| o.kind == "allow_once")
                    .or_else(|| pp.options.iter().find(|o| o.kind == "allow_always"))
                    .or_else(|| pp.options.first())
            })
            .map(|o| o.option_id.clone())
            .unwrap_or_else(|| "allow".to_string())
    };

    // Resolve the permission
    if let Some(tx) = state.permission_resolvers.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&request_id) {
        let _ = tx.send(PermissionReply { option_id: resolved_id });
    }

    // Update task
    let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "running".to_string();
        task.pending_permission = None;
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn task_deny_permission(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    let resolved_id = if let Some(id) = option_id {
        id
    } else {
        let tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        tasks.get(&task_id)
            .and_then(|t| t.pending_permission.as_ref())
            .and_then(|pp| {
                pp.options.iter().find(|o| o.kind == "reject_once")
                    .or_else(|| pp.options.iter().find(|o| o.kind == "reject_always"))
                    .or_else(|| pp.options.first())
            })
            .map(|o| o.option_id.clone())
            .unwrap_or_else(|| "reject".to_string())
    };

    if let Some(tx) = state.permission_resolvers.lock().map_err(|e| format!("Lock poisoned: {e}"))?.remove(&request_id) {
        let _ = tx.send(PermissionReply { option_id: resolved_id });
    }

    let mut tasks = state.tasks.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "running".to_string();
        task.pending_permission = None;
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn set_mode(
    state: tauri::State<'_, AcpState>,
    task_id: String,
    mode_id: String,
) -> Result<(), String> {
    let conns = state.connections.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    let h = conns.get(&task_id).ok_or("No connection for task")?;
    h.cmd_tx.send(AcpCommand::SetMode(mode_id)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_models(
    app: tauri::AppHandle,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    kiro_bin: Option<String>,
) -> Result<Value, String> {
    let bin = match kiro_bin {
        Some(b) => b,
        None => settings_state.0.lock().map_err(|e| format!("Lock poisoned: {e}"))?.settings.kiro_bin.clone(),
    };

    // Spawn a temporary connection to get models
    let (tx, rx) = std::sync::mpsc::channel();
    let _app_clone = app.clone();

    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for list_models");
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async {
                let mut child = tokio::process::Command::new(&bin)
                    .arg("acp")
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null())
                    .env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}", std::env::var("PATH").unwrap_or_default()))
                    .spawn()
                    .map_err(|e| format!("Failed to spawn: {e}"))?;

                let stdin = child.stdin.take().ok_or("No stdin")?;
                let stdout = child.stdout.take().ok_or("No stdout")?;

                struct MinimalClient;
                #[async_trait::async_trait(?Send)]
                impl acp::Client for MinimalClient {
                    async fn session_notification(&self, _: acp::SessionNotification) -> acp::Result<()> { Ok(()) }
                    async fn request_permission(&self, _: acp::RequestPermissionRequest) -> acp::Result<acp::RequestPermissionResponse> {
                        Ok(acp::RequestPermissionResponse::new(acp::RequestPermissionOutcome::Cancelled))
                    }
                    async fn ext_notification(&self, _: acp::ExtNotification) -> acp::Result<()> { Ok(()) }
                }

                let (conn, io_future) = acp::ClientSideConnection::new(
                    MinimalClient, stdin.compat_write(), stdout.compat(),
                    |fut| { tokio::task::spawn_local(fut); },
                );
                tokio::task::spawn_local(async { let _ = io_future.await; });

                conn.initialize(
                    acp::InitializeRequest::new(acp::ProtocolVersion::V1)
                        .client_info(acp::Implementation::new("kirodex", "0.1.0"))
                ).await.map_err(|e| format!("Init failed: {e}"))?;

                let session = conn.new_session(
                    acp::NewSessionRequest::new(std::env::current_dir().unwrap_or_default())
                ).await.map_err(|e| format!("Session failed: {e}"))?;

                let session_val = serde_json::to_value(&session).unwrap_or_default();
                let models = session_val.get("models").cloned().unwrap_or(Value::Null);

                let _ = child.kill().await;
                Ok::<Value, String>(models)
            })
        }));
        match result {
            Ok(inner) => { let _ = tx.send(inner); }
            Err(_) => { let _ = tx.send(Err("list_models thread panicked".to_string())); }
        }
    });

    rx.recv_timeout(std::time::Duration::from_secs(30))
        .map_err(|e| format!("list_models timed out or channel closed: {e}"))?.map(|models| {
        serde_json::json!({
            "availableModels": models.get("availableModels").unwrap_or(&Value::Array(vec![])),
            "currentModelId": models.get("currentModelId")
        })
    })
}

#[tauri::command]
pub fn probe_capabilities(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
) -> Result<Value, String> {
    // Prevent concurrent probes (React StrictMode, HMR reloads)
    if state.probe_running.swap(true, std::sync::atomic::Ordering::SeqCst) {
        log::info!("[ACP] probe_capabilities skipped (already running)");
        return Ok(serde_json::json!({ "ok": true, "skipped": true }));
    }

    let bin = settings_state.0.lock().map_err(|e| {
        state.probe_running.store(false, std::sync::atomic::Ordering::SeqCst);
        format!("Lock poisoned: {e}")
    })?.settings.kiro_bin.clone();
    log::info!("[ACP] probe_capabilities starting with bin={}", bin);

    // Fire-and-forget: spawn the probe on a background thread and return immediately.
    // Model/mode data is delivered via the "session_init" event, which the frontend
    // already listens for. This avoids blocking the Tauri command thread for ~8 seconds.
    let app_for_flag = app.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for probe");
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async {
                let mut child = tokio::process::Command::new(&bin)
                    .arg("acp")
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null())
                    .env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}", std::env::var("PATH").unwrap_or_default()))
                    .spawn()
                    .map_err(|e| format!("Failed to spawn: {e}"))?;

                let stdin = child.stdin.take().ok_or("No stdin")?;
                let stdout = child.stdout.take().ok_or("No stdout")?;

                struct ProbeClient;
                #[async_trait::async_trait(?Send)]
                impl acp::Client for ProbeClient {
                    async fn session_notification(&self, _: acp::SessionNotification) -> acp::Result<()> { Ok(()) }
                    async fn request_permission(&self, _: acp::RequestPermissionRequest) -> acp::Result<acp::RequestPermissionResponse> {
                        Ok(acp::RequestPermissionResponse::new(acp::RequestPermissionOutcome::Cancelled))
                    }
                    async fn ext_notification(&self, _: acp::ExtNotification) -> acp::Result<()> { Ok(()) }
                }

                let (conn, io_future) = acp::ClientSideConnection::new(
                    ProbeClient, stdin.compat_write(), stdout.compat(),
                    |fut| { tokio::task::spawn_local(fut); },
                );
                tokio::task::spawn_local(async { let _ = io_future.await; });

                conn.initialize(
                    acp::InitializeRequest::new(acp::ProtocolVersion::V1)
                        .client_info(acp::Implementation::new("kirodex", "0.1.0"))
                ).await.map_err(|e| format!("Init failed: {e}"))?;

                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
                let session = conn.new_session(
                    acp::NewSessionRequest::new(std::path::PathBuf::from(&home))
                ).await.map_err(|e| format!("Session failed: {e}"))?;

                let session_val = serde_json::to_value(&session).unwrap_or_default();

                let model_count = session_val.get("models")
                    .and_then(|m| m.get("availableModels"))
                    .and_then(|a| a.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                let current_model = session_val.get("models")
                    .and_then(|m| m.get("currentModelId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("none");
                log::info!("[ACP] probe session_init: {} models (current={})", model_count, current_model);

                use tauri::Emitter;
                let _ = app_clone.emit("session_init", serde_json::json!({
                    "taskId": "__probe__",
                    "models": session_val.get("models"),
                    "modes": session_val.get("modes"),
                    "configOptions": session_val.get("configOptions"),
                }));

                let _ = child.kill().await;
                Ok::<(), String>(())
            })
        }));

        // ALWAYS reset the probe guard when the thread exits (even on panic)
        use tauri::Manager;
        if let Some(acp_state) = app_for_flag.try_state::<AcpState>() {
            acp_state.probe_running.store(false, std::sync::atomic::Ordering::SeqCst);
        }

        match result {
            Ok(Ok(())) => log::info!("[ACP] probe_capabilities succeeded"),
            Ok(Err(e)) => log::warn!("[ACP] probe_capabilities failed: {}", e),
            Err(_) => log::error!("[ACP] probe_capabilities thread panicked"),
        }
    });

    // Return immediately — models/modes arrive via session_init event
    Ok(serde_json::json!({ "ok": true, "async": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_within_workspace: allowed paths ──────────────────────────

    #[test]
    fn within_workspace_subpath() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_str().unwrap();
        let sub = tmp.path().join("src/main.rs");
        std::fs::create_dir_all(sub.parent().unwrap()).unwrap();
        std::fs::write(&sub, "fn main() {}").unwrap();
        assert!(is_within_workspace(ws, sub.to_str().unwrap()));
    }

    #[test]
    fn within_workspace_new_file() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_str().unwrap();
        let new_file = tmp.path().join("new.txt");
        // File doesn't exist yet — parent does
        assert!(is_within_workspace(ws, new_file.to_str().unwrap()));
    }

    #[test]
    fn within_workspace_exact_root() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_str().unwrap();
        let root_file = tmp.path().join("README.md");
        std::fs::write(&root_file, "# hi").unwrap();
        assert!(is_within_workspace(ws, root_file.to_str().unwrap()));
    }

    #[test]
    fn within_workspace_deeply_nested() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_str().unwrap();
        let deep = tmp.path().join("a/b/c/d/e/f.txt");
        std::fs::create_dir_all(deep.parent().unwrap()).unwrap();
        std::fs::write(&deep, "deep").unwrap();
        assert!(is_within_workspace(ws, deep.to_str().unwrap()));
    }

    #[test]
    fn within_workspace_new_file_in_new_subdir() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path().to_str().unwrap();
        // Neither the file nor its parent dir exist, but grandparent (workspace) does
        let new_file = tmp.path().join("new-dir/file.txt");
        // Parent doesn't exist, grandparent does — falls through to false
        // This is correct: we can't verify the path is safe if the parent doesn't exist
        let result = is_within_workspace(ws, new_file.to_str().unwrap());
        // The parent dir doesn't exist so canonicalize fails — returns false (safe default)
        assert!(!result);
    }

    // ── is_within_workspace: blocked paths ──────────────────────────

    #[test]
    fn outside_workspace_sibling() {
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project-a");
        let sibling = parent.path().join("project-b").join("file.txt");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::create_dir_all(sibling.parent().unwrap()).unwrap();
        std::fs::write(&sibling, "secret").unwrap();
        assert!(!is_within_workspace(ws.to_str().unwrap(), sibling.to_str().unwrap()));
    }

    #[test]
    fn outside_workspace_dotdot_traversal() {
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project");
        std::fs::create_dir_all(&ws).unwrap();
        let escape = format!("{}/../secret.txt", ws.display());
        std::fs::write(parent.path().join("secret.txt"), "data").unwrap();
        assert!(!is_within_workspace(ws.to_str().unwrap(), &escape));
    }

    #[test]
    fn outside_workspace_parent_dir() {
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project");
        std::fs::create_dir_all(&ws).unwrap();
        let parent_file = parent.path().join("parent-secret.txt");
        std::fs::write(&parent_file, "secret").unwrap();
        assert!(!is_within_workspace(ws.to_str().unwrap(), parent_file.to_str().unwrap()));
    }

    #[test]
    fn outside_workspace_absolute_path() {
        let ws = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let other_file = other.path().join("file.txt");
        std::fs::write(&other_file, "other").unwrap();
        assert!(!is_within_workspace(ws.path().to_str().unwrap(), other_file.to_str().unwrap()));
    }

    #[test]
    fn outside_workspace_dotdot_in_middle() {
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project");
        let sibling = parent.path().join("other");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("secret.txt"), "data").unwrap();
        // project/src/../../other/secret.txt
        let escape = format!("{}/src/../../other/secret.txt", ws.display());
        std::fs::create_dir_all(ws.join("src")).unwrap();
        assert!(!is_within_workspace(ws.to_str().unwrap(), &escape));
    }

    // ── is_within_workspace: edge cases ─────────────────────────────

    #[test]
    fn empty_path_returns_false() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!is_within_workspace(tmp.path().to_str().unwrap(), ""));
    }

    #[test]
    fn nonexistent_workspace_falls_back_to_string_prefix() {
        // When workspace can't be canonicalized, falls back to starts_with
        assert!(is_within_workspace("/nonexistent/ws", "/nonexistent/ws/file.txt"));
        assert!(!is_within_workspace("/nonexistent/ws", "/other/file.txt"));
    }

    #[test]
    fn workspace_prefix_attack_blocked() {
        // /project-a-evil should NOT match /project-a
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project-a");
        let evil = parent.path().join("project-a-evil").join("file.txt");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::create_dir_all(evil.parent().unwrap()).unwrap();
        std::fs::write(&evil, "evil").unwrap();
        assert!(!is_within_workspace(ws.to_str().unwrap(), evil.to_str().unwrap()));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_blocked() {
        let parent = tempfile::tempdir().unwrap();
        let ws = parent.path().join("project");
        let secret_dir = parent.path().join("secrets");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::create_dir_all(&secret_dir).unwrap();
        std::fs::write(secret_dir.join("key.pem"), "private").unwrap();
        // Create a symlink inside workspace that points outside
        std::os::unix::fs::symlink(&secret_dir, ws.join("link")).unwrap();
        let via_symlink = ws.join("link/key.pem");
        assert!(!is_within_workspace(ws.to_str().unwrap(), via_symlink.to_str().unwrap()));
    }

    // ── extract_paths_from_message ──────────────────────────────────

    #[test]
    fn extract_absolute_path_from_message() {
        let paths = extract_paths_from_message("look at /Users/me/project/src/main.rs please");
        assert_eq!(paths, vec!["/Users/me/project/src/main.rs"]);
    }

    #[test]
    fn extract_multiple_paths() {
        let paths = extract_paths_from_message("compare /a/b/c.rs and /x/y/z.ts");
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"/a/b/c.rs".to_string()));
        assert!(paths.contains(&"/x/y/z.ts".to_string()));
    }

    #[test]
    fn extract_path_in_backticks() {
        let paths = extract_paths_from_message("read `/Users/me/project/file.txt`");
        assert_eq!(paths, vec!["/Users/me/project/file.txt"]);
    }

    #[test]
    fn extract_ignores_relative_paths() {
        let paths = extract_paths_from_message("look at src/main.rs and ./lib/utils.ts");
        assert!(paths.is_empty());
    }

    #[test]
    fn extract_ignores_single_slash() {
        let paths = extract_paths_from_message("use / as separator");
        assert!(paths.is_empty());
    }

    #[test]
    fn extract_ignores_url_paths() {
        // URLs have // after scheme, but individual path-like tokens should still work
        let paths = extract_paths_from_message("visit https://example.com/path");
        assert!(paths.is_empty());
    }

    #[test]
    fn extract_path_with_spaces_around() {
        let paths = extract_paths_from_message("  /home/user/project/file.rs  ");
        assert_eq!(paths, vec!["/home/user/project/file.rs"]);
    }

    #[test]
    fn extract_path_in_quotes() {
        let paths = extract_paths_from_message("read \"/Users/me/file.txt\"");
        assert_eq!(paths, vec!["/Users/me/file.txt"]);
    }

    // ── is_path_allowed ─────────────────────────────────────────────

    #[test]
    fn allowed_exact_match() {
        let mut allowed = std::collections::HashSet::new();
        allowed.insert("/Users/me/project/file.rs".to_string());
        assert!(is_path_allowed(&allowed, "/Users/me/project/file.rs"));
    }

    #[test]
    fn allowed_sibling_file_in_same_dir() {
        let mut allowed = std::collections::HashSet::new();
        allowed.insert("/Users/me/project/src/main.rs".to_string());
        // Another file in the same directory should be allowed
        assert!(is_path_allowed(&allowed, "/Users/me/project/src/lib.rs"));
    }

    #[test]
    fn allowed_file_under_mentioned_dir() {
        let mut allowed = std::collections::HashSet::new();
        allowed.insert("/Users/me/project/src".to_string());
        assert!(is_path_allowed(&allowed, "/Users/me/project/src/main.rs"));
    }

    #[test]
    fn not_allowed_unrelated_path() {
        let mut allowed = std::collections::HashSet::new();
        allowed.insert("/Users/me/project-a/file.rs".to_string());
        assert!(!is_path_allowed(&allowed, "/Users/me/project-b/file.rs"));
    }

    #[test]
    fn not_allowed_empty_set() {
        let allowed = std::collections::HashSet::new();
        assert!(!is_path_allowed(&allowed, "/Users/me/file.rs"));
    }

    #[test]
    fn allowed_parent_dir_of_mentioned_file() {
        let mut allowed = std::collections::HashSet::new();
        allowed.insert("/Users/me/project/src/deep/file.rs".to_string());
        // The parent directory of the mentioned file
        assert!(is_path_allowed(&allowed, "/Users/me/project/src/deep/other.rs"));
    }
}