use std::collections::BTreeSet;
use std::sync::Arc;

use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

use agent_client_protocol as acp;
use acp::Agent as _; // Brings initialize, new_session, prompt, cancel, set_session_mode, set_session_model into scope
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use super::client::KirodexClient;
use super::sandbox::{extract_paths_from_message, friendly_prompt_error};
use super::types::{
    AcpCommand, AcpState, AttachmentData, ConnectionHandle, PendingPermission, PermissionOption,
    PermissionReply, ReasoningEffort,
};

/// Strip embedded `<image src="data:..." />` tags and their `[Attached image: ...]` prefixes
/// from the text so the model doesn't receive raw base64 in the text content block.
pub(crate) fn strip_image_tags(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    let bytes = text.as_bytes();
    while i < bytes.len() {
        // Try to match [Attached image: ...]\n<image src="data:..." />
        if bytes[i] == b'[' && text[i..].starts_with("[Attached image: ") {
            if let Some(bracket_end) = text[i..].find("]\n<image src=\"data:") {
                let tag_start = i + bracket_end + 1; // skip past ']'
                if text[tag_start..].starts_with("\n<image src=\"data:") {
                    if let Some(tag_end) = text[tag_start..].find(" />") {
                        i = tag_start + tag_end + 3; // skip past ' />'
                        // Skip trailing newlines
                        while i < bytes.len() && bytes[i] == b'\n' { i += 1; }
                        continue;
                    }
                }
            }
        }
        // Try to match standalone <image src="data:..." />
        if bytes[i] == b'<' && text[i..].starts_with("<image src=\"data:") {
            if let Some(tag_end) = text[i..].find(" />") {
                i += tag_end + 3;
                while i < bytes.len() && bytes[i] == b'\n' { i += 1; }
                continue;
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    // Collapse multiple consecutive newlines into at most two
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }
    result.trim().to_string()
}

/// Build the content blocks for a PromptRequest: text (with image tags stripped) + image blocks.
pub(crate) fn build_content_blocks(text: String, attachments: &[AttachmentData]) -> Vec<acp::ContentBlock> {
    let clean_text = if attachments.is_empty() { text } else { strip_image_tags(&text) };
    let mut blocks: Vec<acp::ContentBlock> = vec![clean_text.into()];
    for att in attachments {
        blocks.push(acp::ContentBlock::Image(
            acp::ImageContent::new(&att.base64, &att.mime_type),
        ));
    }
    blocks
}

/// Build Kiro CLI's live effort-change extension request. ACP automatically
/// prefixes extension method names with `_` on the wire.
pub(crate) fn build_effort_command_request(
    session_id: &acp::SessionId,
    effort: ReasoningEffort,
) -> Result<acp::ExtRequest, String> {
    let params = serde_json::value::to_raw_value(&serde_json::json!({
        "sessionId": session_id,
        "command": {
            "command": "effort",
            "args": { "value": effort.as_str() },
        },
    }))
    .map(Arc::from)
    .map_err(|error| format!("Failed to encode reasoning effort request: {error}"))?;

    Ok(acp::ExtRequest::new("kiro.dev/commands/execute", params))
}

pub(crate) fn parse_effort_command_result(result: &Value) -> Result<(), String> {
    if result.get("success").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }

    Err(result
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("Kiro CLI could not change reasoning effort for the selected model")
        .to_string())
}

pub(crate) fn build_effort_options_request(
    session_id: &acp::SessionId,
) -> Result<acp::ExtRequest, String> {
    let params = serde_json::value::to_raw_value(&serde_json::json!({
        "sessionId": session_id,
        "command": "effort",
        "partial": "",
    }))
    .map(Arc::from)
    .map_err(|error| format!("Failed to encode reasoning effort options request: {error}"))?;

    Ok(acp::ExtRequest::new("kiro.dev/commands/options", params))
}

pub(crate) fn parse_effort_options_result(result: &Value) -> Result<Vec<ReasoningEffort>, String> {
    let options = result
        .get("options")
        .and_then(Value::as_array)
        .ok_or_else(|| "Kiro CLI returned an invalid effort options response".to_string())?;

    Ok(options
        .iter()
        .filter_map(|option| option.get("value").and_then(Value::as_str))
        .filter_map(ReasoningEffort::from_str)
        .collect())
}

pub(crate) async fn execute_effort_command<A: acp::Agent + ?Sized>(
    conn: &A,
    session_id: &acp::SessionId,
    effort: ReasoningEffort,
) -> Result<(), String> {
    let request = build_effort_command_request(session_id, effort)?;
    let response = conn
        .ext_method(request)
        .await
        .map_err(|error| format!("Kiro CLI rejected the reasoning effort change: {error}"))?;
    let result = serde_json::to_value(response)
        .map_err(|error| format!("Failed to read Kiro CLI's effort response: {error}"))?;
    parse_effort_command_result(&result)
}

pub(crate) async fn fetch_effort_options<A: acp::Agent + ?Sized>(
    conn: &A,
    session_id: &acp::SessionId,
) -> Result<Vec<ReasoningEffort>, String> {
    let request = build_effort_options_request(session_id)?;
    let response = conn
        .ext_method(request)
        .await
        .map_err(|error| format!("Kiro CLI could not list reasoning effort levels: {error}"))?;
    let result = serde_json::to_value(response)
        .map_err(|error| format!("Failed to read Kiro CLI's effort options: {error}"))?;
    parse_effort_options_result(&result)
}

// ── Spawn a kiro-cli ACP connection on a dedicated thread ──────────────

/// Configuration for spawning a new ACP connection. Groups the many
/// parameters that `spawn_connection` previously accepted positionally,
/// making call sites easier to read and extend.
pub(crate) struct ConnectionConfig {
    pub task_id: String,
    pub workspace: String,
    pub kiro_bin: String,
    pub auto_approve: bool,
    pub app: tauri::AppHandle,
    pub initial_mode_id: Option<String>,
    pub initial_model_id: Option<String>,
    pub initial_effort: Option<ReasoningEffort>,
    pub tight_sandbox: bool,
    pub pending_preamble: Option<String>,
}

pub(crate) fn spawn_connection(mut config: ConnectionConfig) -> Result<ConnectionHandle, String> {
    config.pending_preamble = None;
    spawn_connection_with_preamble(config)
}

/// Spawn a connection and stash a one-shot preamble that will be prepended to
/// the very first `Prompt` command this connection receives. Used by
/// `task_fork` and effort changes so a fresh `kiro-cli` subprocess inherits
/// the existing thread's transcript when the user sends their next message.
pub(crate) fn spawn_connection_with_preamble(config: ConnectionConfig) -> Result<ConnectionHandle, String> {
    let ConnectionConfig {
        task_id,
        workspace,
        kiro_bin,
        auto_approve,
        app,
        initial_mode_id,
        initial_model_id,
        initial_effort,
        tight_sandbox,
        pending_preamble,
    } = config;
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AcpCommand>();
    let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let alive_clone = alive.clone();
    let ready = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ready_for_connection = ready.clone();
    let auto_approve_flag = Arc::new(std::sync::atomic::AtomicBool::new(auto_approve));
    let auto_approve_for_client = auto_approve_flag.clone();

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
                {
                    let mut tasks = managed_state.tasks.lock();
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
                {
                    let mut resolvers = managed_state.permission_resolvers.lock();
                    resolvers.insert(request_id, reply_tx);
                }
            }
        }
    });

    // Spawn the ACP connection on a dedicated OS thread with its own single-threaded runtime.
    // Wrapped in catch_unwind to prevent silent thread death from orphaning channels.
    let app3 = app.clone();
    let tid3 = task_id.clone();
    // Extra clones for the panic path — the closure moves app3/tid3 in.
    let app3_panic = app3.clone();
    let tid3_panic = tid3.clone();
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
                    tid3.clone(), workspace, kiro_bin, auto_approve_for_client,
                    app3.clone(), perm_tx, &mut cmd_rx, initial_mode_id,
                    initial_model_id, initial_effort, tight_sandbox, pending_preamble,
                    ready_for_connection,
                ).await;

                alive_clone.store(false, std::sync::atomic::Ordering::SeqCst);

                // If the connection died while the task was still running, the
                // frontend never receives a `turn_end` event and the spinner gets
                // stuck forever. Emit a synthetic `turn_end` with stopReason
                // "connection_lost" so the frontend can clear the working row.
                use tauri::Manager;
                if let Some(managed_state) = app3.try_state::<AcpState>() {
                    let task_was_running = {
                        let tasks = managed_state.tasks.lock();
                        tasks.get(&tid3)
                            .map(|t| t.status == "running" || t.status == "pending_permission")
                            .unwrap_or(false)
                    };
                    if task_was_running {
                        {
                            let mut tasks = managed_state.tasks.lock();
                            if let Some(task) = tasks.get_mut(&tid3) {
                                task.status = "paused".to_string();
                                task.pending_permission = None;
                            }
                        }
                        use tauri::Emitter;
                        let _ = app3.emit("turn_end", serde_json::json!({
                            "taskId": tid3,
                            "stopReason": "connection_lost"
                        }));
                        log::warn!("[ACP] Connection for task {} died while running — emitted synthetic turn_end", tid3);
                    }
                }

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
            // Panic path: also emit synthetic turn_end so the spinner clears
            use tauri::Manager;
            if let Some(managed_state) = app3_panic.try_state::<AcpState>() {
                let task_was_running = {
                    let tasks = managed_state.tasks.lock();
                    tasks.get(&tid3_panic)
                        .map(|t| t.status == "running" || t.status == "pending_permission")
                        .unwrap_or(false)
                };
                if task_was_running {
                    {
                        let mut tasks = managed_state.tasks.lock();
                        if let Some(task) = tasks.get_mut(&tid3_panic) {
                            task.status = "paused".to_string();
                            task.pending_permission = None;
                        }
                    }
                    use tauri::Emitter;
                    let _ = app3_panic.emit("turn_end", serde_json::json!({
                        "taskId": &tid3_panic,
                        "stopReason": "connection_lost"
                    }));
                    log::warn!("[ACP] Connection thread panicked for task {} — emitted synthetic turn_end", tid3_panic);
                }
            }
        }
    });

    Ok(ConnectionHandle { cmd_tx, alive, ready, auto_approve: auto_approve_flag })
}

pub(crate) async fn run_acp_connection(
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: Arc<std::sync::atomic::AtomicBool>,
    app: tauri::AppHandle,
    perm_tx: mpsc::UnboundedSender<(String, acp::RequestPermissionRequest, oneshot::Sender<PermissionReply>)>,
    cmd_rx: &mut mpsc::UnboundedReceiver<AcpCommand>,
    initial_mode_id: Option<String>,
    initial_model_id: Option<String>,
    initial_effort: Option<ReasoningEffort>,
    tight_sandbox: bool,
    mut pending_preamble: Option<String>,
    ready: Arc<std::sync::atomic::AtomicBool>,
) -> Result<(), String> {
    let mut command = tokio::process::Command::new(&kiro_bin);
    command.arg("acp");
    let mut child = command
        .current_dir(&workspace)
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

    let allowed_paths = Arc::new(parking_lot::Mutex::new(BTreeSet::new()));

    let client = KirodexClient {
        task_id: task_id.clone(),
        workspace: workspace.clone(),
        app: app.clone(),
        auto_approve,
        perm_tx,
        allowed_paths: allowed_paths.clone(),
        tight_sandbox,
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
            "sessionId": session_id,
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

    // Apply initial model if provided. This is the bridge between kirodex's
    // per-project / global model preference and the freshly spawned kiro-cli
    // subprocess — without it the picker is purely cosmetic and the agent
    // keeps using whatever it booted with.
    if let Some(model_id) = initial_model_id {
        if let Err(e) = conn.set_session_model(
            acp::SetSessionModelRequest::new(session_id.clone(), model_id.clone())
        ).await {
            log::warn!("[ACP] set_session_model({model_id}) failed for task={task_id}: {e}");
        }
    }

    // Effort is model-specific, so apply it only after the selected model is
    // active. Kiro exposes this through its commands/execute ACP extension.
    if let Some(effort) = initial_effort {
        if let Err(error) = execute_effort_command(&conn, &session_id, effort).await {
            log::warn!(
                "[ACP] Initial effort {} failed for task={task_id}: {error}",
                effort.as_str()
            );
        }
    }

    ready.store(true, std::sync::atomic::Ordering::Release);

    // Process commands from the main thread.
    // Uses tokio::select! during prompt so Cancel/Kill are handled immediately
    // instead of queuing behind the blocking prompt future.
    let mut killed = false;
    while let Some(cmd) = cmd_rx.recv().await {
        match cmd {
            AcpCommand::Prompt(text, attachments) => {
                // On the very first prompt of a forked or resumed connection,
                // prepend the parent thread's transcript so the freshly spawned
                // kiro-cli subprocess has the necessary context. Consumed once.
                let text = if let Some(preamble) = pending_preamble.take() {
                    format!("{preamble}{text}")
                } else {
                    text
                };
                // Extract absolute paths from user message to allow through the sandbox
                let external_paths = extract_paths_from_message(&text);
                if !external_paths.is_empty() {
                    let mut allowed = allowed_paths.lock();
                    for p in &external_paths {
                        allowed.insert(p.clone());
                    }
                }
                let prompt_req = acp::PromptRequest::new(
                    session_id.clone(),
                    build_content_blocks(text, &attachments),
                );
                // Race the prompt against incoming commands so Cancel arrives immediately
                let prompt_fut = conn.prompt(prompt_req);
                tokio::pin!(prompt_fut);
                let mut deferred: Vec<AcpCommand> = Vec::new();
                let prompt_result = loop {
                    tokio::select! {
                        result = &mut prompt_fut => {
                            break Some(result);
                        }
                        maybe_cmd = cmd_rx.recv() => {
                            match maybe_cmd {
                                Some(AcpCommand::Cancel) => {
                                    let _ = conn.cancel(acp::CancelNotification::new(session_id.clone())).await;
                                    // Let prompt_fut resolve with the cancelled result
                                }
                                Some(AcpCommand::Kill) => {
                                    killed = true;
                                    break None;
                                }
                                Some(other) => deferred.push(other),
                                None => {
                                    killed = true;
                                    break None;
                                }
                            }
                        }
                    }
                };
                if killed { break; }
                // Handle the prompt result
                match prompt_result {
                    Some(Ok(result)) => {
                        let result_val = serde_json::to_value(&result).unwrap_or_default();
                        let stop_reason = result_val.get("stopReason")
                            .and_then(|v| v.as_str())
                            .unwrap_or("end_turn")
                            .to_string();
                        use tauri::Manager;
                        if let Some(state) = app.try_state::<AcpState>() {
                            if let Some(task) = state.tasks.lock().get_mut(&task_id) {
                                task.status = if task.user_paused == Some(true) {
                                    "paused".to_string()
                                } else {
                                    "completed".to_string()
                                };
                                task.pending_permission = None;
                            }
                        }
                        use tauri::Emitter;
                        let _ = app.emit("turn_end", serde_json::json!({ "taskId": task_id, "stopReason": stop_reason }));
                        let _ = app.emit("debug_log", serde_json::json!({
                            "direction": "in", "category": "response", "type": "turn-end",
                            "taskId": task_id, "summary": format!("turn ended: {stop_reason}"),
                            "payload": result_val, "isError": false
                        }));
                    }
                    Some(Err(e)) => {
                        use tauri::Emitter;
                        let err_str = e.to_string();
                        let message = friendly_prompt_error(&err_str);
                        use tauri::Manager;
                        if let Some(state) = app.try_state::<AcpState>() {
                            if let Some(task) = state.tasks.lock().get_mut(&task_id) {
                                task.status = "error".to_string();
                                task.pending_permission = None;
                            }
                        }
                        let _ = app.emit("task_error", serde_json::json!({
                            "taskId": task_id, "message": message
                        }));
                        let _ = app.emit("debug_log", serde_json::json!({
                            "direction": "in", "category": "error", "type": "prompt-error",
                            "taskId": task_id, "summary": err_str,
                            "payload": { "error": err_str }, "isError": true
                        }));
                    }
                    None => {} // killed during prompt
                }
                // Process any commands that arrived during the prompt
                for deferred_cmd in deferred {
                    match deferred_cmd {
                        AcpCommand::SetMode(mode_id) => {
                            let _ = conn.set_session_mode(
                                acp::SetSessionModeRequest::new(session_id.clone(), mode_id)
                            ).await;
                        }
                        AcpCommand::SetModel(model_id) => {
                            if let Err(e) = conn.set_session_model(
                                acp::SetSessionModelRequest::new(session_id.clone(), model_id.clone())
                            ).await {
                                log::warn!("[ACP] deferred set_session_model({model_id}) failed: {e}");
                            }
                        }
                        AcpCommand::SetEffort(effort, reply_tx) => {
                            let result = execute_effort_command(&conn, &session_id, effort).await;
                            let _ = reply_tx.send(result);
                        }
                        AcpCommand::ListEffortOptions(reply_tx) => {
                            let result = fetch_effort_options(&conn, &session_id).await;
                            let _ = reply_tx.send(result);
                        }
                        AcpCommand::Cancel => {
                            let _ = conn.cancel(acp::CancelNotification::new(session_id.clone())).await;
                        }
                        AcpCommand::Prompt(..) => {} // discard stale prompts during active prompt
                        AcpCommand::Kill => { killed = true; }
                    }
                }
                if killed { break; }
            }
            AcpCommand::Cancel => {
                let _ = conn.cancel(acp::CancelNotification::new(session_id.clone())).await;
            }
            AcpCommand::SetMode(mode_id) => {
                let _ = conn.set_session_mode(
                    acp::SetSessionModeRequest::new(session_id.clone(), mode_id)
                ).await;
            }
            AcpCommand::SetModel(model_id) => {
                if let Err(e) = conn.set_session_model(
                    acp::SetSessionModelRequest::new(session_id.clone(), model_id.clone())
                ).await {
                    log::warn!("[ACP] set_session_model({model_id}) failed: {e}");
                }
            }
            AcpCommand::SetEffort(effort, reply_tx) => {
                let result = execute_effort_command(&conn, &session_id, effort).await;
                let _ = reply_tx.send(result);
            }
            AcpCommand::ListEffortOptions(reply_tx) => {
                let result = fetch_effort_options(&conn, &session_id).await;
                let _ = reply_tx.send(result);
            }
            AcpCommand::Kill => break,
        }
    }

    // Kill subprocess
    let _ = child.kill().await;
    Ok(())
}
