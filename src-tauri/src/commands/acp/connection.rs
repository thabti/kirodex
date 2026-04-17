use std::collections::BTreeSet;
use std::sync::Arc;

use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

use agent_client_protocol as acp;
use acp::Agent as _; // Brings initialize, new_session, prompt, cancel, set_session_mode into scope
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use super::client::KirodexClient;
use super::sandbox::{extract_paths_from_message, friendly_prompt_error};
use super::types::{
    AcpCommand, AcpState, AttachmentData, ConnectionHandle, PendingPermission, PermissionOption, PermissionReply,
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

// ── Spawn a kiro-cli ACP connection on a dedicated thread ──────────────

pub(crate) fn spawn_connection(
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: bool,
    app: tauri::AppHandle,
    initial_mode_id: Option<String>,
    tight_sandbox: bool,
) -> Result<ConnectionHandle, String> {
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AcpCommand>();
    let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let alive_clone = alive.clone();
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
                    tight_sandbox,
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

    Ok(ConnectionHandle { cmd_tx, alive, auto_approve: auto_approve_flag })
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
    tight_sandbox: bool,
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

    // Process commands from the main thread.
    // Uses tokio::select! during prompt so Cancel/Kill are handled immediately
    // instead of queuing behind the blocking prompt future.
    let mut killed = false;
    while let Some(cmd) = cmd_rx.recv().await {
        match cmd {
            AcpCommand::Prompt(text, attachments) => {
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
                        AcpCommand::ForkSession(reply_tx) => {
                            let result = conn.fork_session(
                                acp::ForkSessionRequest::new(session_id.clone(), std::path::PathBuf::from(&workspace))
                            ).await;
                            match result {
                                Ok(resp) => { let _ = reply_tx.send(Ok(resp.session_id.0.to_string())); }
                                Err(e) => { let _ = reply_tx.send(Err(e.to_string())); }
                            }
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
