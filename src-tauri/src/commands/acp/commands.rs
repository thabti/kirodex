use serde_json::Value;
use tokio::sync::oneshot;
use uuid::Uuid;

use agent_client_protocol as acp;
use acp::Agent as _;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use super::connection::spawn_connection;
use super::types::*;
use super::now_rfc3339;

// ── Tauri Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn task_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    params: CreateTaskParams,
) -> Result<Task, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings = settings_state.0.lock();
    let auto_approve = params.auto_approve.unwrap_or(settings.settings.auto_approve);
    let kiro_bin = settings.settings.kiro_bin.clone();
    let co_author = settings.settings.co_author;
    let co_author_json_report = settings.settings.co_author_json_report;
    let tight_sandbox = settings.settings.project_prefs.as_ref()
        .and_then(|p| p.get(&params.workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
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

    state.tasks.lock().insert(id.clone(), task.clone());

    let _is_plan_mode = params.mode_id.as_deref() == Some("kiro_planner");

    let handle = spawn_connection(
        id.clone(),
        params.workspace,
        kiro_bin,
        auto_approve,
        app.clone(),
        params.mode_id,
        tight_sandbox,
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
    let _ = handle.cmd_tx.send(AcpCommand::Prompt(full_prompt, params.attachments.unwrap_or_default()));

    state.connections.lock().insert(id, handle);

    Ok(task)
}

#[tauri::command]
pub fn task_list(state: tauri::State<'_, AcpState>) -> Result<Vec<Task>, String> {
    let tasks = state.tasks.lock();
    Ok(tasks.values().cloned().collect())
}

#[tauri::command]
pub fn task_send_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    task_id: String,
    message: String,
    attachments: Option<Vec<AttachmentData>>,
) -> Result<Task, String> {
    // Push user message
    {
        let mut tasks = state.tasks.lock();
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
        let conns = state.connections.lock();
        match conns.get(&task_id) {
            Some(h) => !h.alive.load(std::sync::atomic::Ordering::SeqCst),
            None => true,
        }
    };

    if need_reconnect {
        let settings = settings_state.0.lock();
        let kiro_bin = settings.settings.kiro_bin.clone();
        let global_auto_approve = settings.settings.auto_approve;

        let (workspace, task_auto_approve) = {
            let tasks = state.tasks.lock();
            let t = tasks.get(&task_id).ok_or("Task not found")?;
            (t.workspace.clone(), t.auto_approve.unwrap_or(global_auto_approve))
        };

        let tight_sandbox = settings.settings.project_prefs.as_ref()
            .and_then(|p| p.get(&workspace))
            .and_then(|pp| pp.tight_sandbox)
            .unwrap_or(true);
        drop(settings);

        // Destroy old connection
        if let Some(old) = state.connections.lock().remove(&task_id) {
            let _ = old.cmd_tx.send(AcpCommand::Kill);
        }

        let handle = spawn_connection(
            task_id.clone(), workspace, kiro_bin, task_auto_approve,
            app.clone(), None, tight_sandbox,
        )?;
        let _ = handle.cmd_tx.send(AcpCommand::Prompt(message, attachments.unwrap_or_default()));
        state.connections.lock().insert(task_id.clone(), handle);
    } else {
        let conns = state.connections.lock();
        if let Some(h) = conns.get(&task_id) {
            let _ = h.cmd_tx.send(AcpCommand::Prompt(message, attachments.unwrap_or_default()));
        }
    }

    let tasks = state.tasks.lock();
    tasks.get(&task_id).cloned().ok_or_else(|| "Task not found".to_string())
}

#[tauri::command]
pub fn task_pause(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<Task, String> {
    if let Some(h) = state.connections.lock().get(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Cancel);
    }
    let mut tasks = state.tasks.lock();
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
    if let Some(h) = state.connections.lock().get(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Prompt("continue".to_string(), vec![]));
    }
    let mut tasks = state.tasks.lock();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = "running".to_string();
    task.user_paused = Some(false);
    use tauri::Emitter;
    let _ = app.emit("task_update", task.clone());
    Ok(task.clone())
}

#[tauri::command]
pub fn task_set_auto_approve(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
    auto_approve: bool,
) -> Result<(), String> {
    if let Some(h) = state.connections.lock().get(&task_id) {
        h.auto_approve.store(auto_approve, std::sync::atomic::Ordering::SeqCst);
    }
    let mut tasks = state.tasks.lock();
    if let Some(task) = tasks.get_mut(&task_id) {
        task.auto_approve = Some(auto_approve);
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn task_cancel(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<(), String> {
    if let Some(h) = state.connections.lock().remove(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Kill);
    }
    let mut tasks = state.tasks.lock();
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "cancelled".to_string();
        use tauri::Emitter;
        let _ = app.emit("task_update", task.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn task_delete(state: tauri::State<'_, AcpState>, task_id: String) -> Result<(), String> {
    if let Some(h) = state.connections.lock().remove(&task_id) {
        let _ = h.cmd_tx.send(AcpCommand::Kill);
    }
    state.tasks.lock().remove(&task_id);
    Ok(())
}

#[tauri::command]
pub async fn task_fork(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    params: ForkTaskParams,
) -> Result<Task, String> {
    let task_id = &params.task_id;
    let parent = {
        let tasks = state.tasks.lock();
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
    let has_live_connection = {
        let conns = state.connections.lock();
        conns.get(task_id)
            .map(|h| h.alive.load(std::sync::atomic::Ordering::SeqCst))
            .unwrap_or(false)
    };
    if has_live_connection {
        let (reply_tx, reply_rx) = oneshot::channel();
        {
            let conns = state.connections.lock();
            if let Some(handle) = conns.get(task_id) {
                let _ = handle.cmd_tx.send(AcpCommand::ForkSession(reply_tx));
            }
        }
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            reply_rx,
        ).await;
    }
    let new_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings = settings_state.0.lock();
    let auto_approve = parent_auto_approve.unwrap_or(settings.settings.auto_approve);
    let kiro_bin = settings.settings.kiro_bin.clone();
    let tight_sandbox = settings.settings.project_prefs.as_ref()
        .and_then(|p| p.get(&workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
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
    state.tasks.lock().insert(new_id.clone(), fork_task.clone());
    let handle = spawn_connection(
        new_id.clone(),
        workspace,
        kiro_bin,
        auto_approve,
        app,
        None,
        tight_sandbox,
    )?;
    state.connections.lock().insert(new_id, handle);
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
        let tasks = state.tasks.lock();
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

    if let Some(tx) = state.permission_resolvers.lock().remove(&request_id) {
        let _ = tx.send(PermissionReply { option_id: resolved_id });
    }

    let mut tasks = state.tasks.lock();
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
        let tasks = state.tasks.lock();
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

    if let Some(tx) = state.permission_resolvers.lock().remove(&request_id) {
        let _ = tx.send(PermissionReply { option_id: resolved_id });
    }

    let mut tasks = state.tasks.lock();
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
    let conns = state.connections.lock();
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
        None => settings_state.0.lock().settings.kiro_bin.clone(),
    };

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

    let bin = settings_state.0.lock().settings.kiro_bin.clone();
    log::info!("[ACP] probe_capabilities starting with bin={}", bin);

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
