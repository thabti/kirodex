use serde_json::Value;
use uuid::Uuid;

use agent_client_protocol as acp;
use acp::Agent as _;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use super::connection::spawn_connection;
use super::types::*;
use super::now_rfc3339;

/// Resolve the model id that should be applied to a freshly spawned ACP
/// session. Order: explicit param → project-pref → global `defaultModel`.
/// Returns `None` when no preference is set, in which case the CLI subprocess
/// boots with its own built-in default model.
pub(crate) fn resolve_initial_model(
    explicit: Option<String>,
    workspace: &str,
    settings: &crate::commands::settings::AppSettings,
) -> Option<String> {
    if let Some(m) = explicit.filter(|s| !s.trim().is_empty()) {
        return Some(m);
    }
    if let Some(prefs) = settings.project_prefs.as_ref().and_then(|p| p.get(workspace)) {
        if let Some(m) = prefs.model_id.clone().filter(|s| !s.trim().is_empty()) {
            return Some(m);
        }
    }
    settings.default_model.clone().filter(|s| !s.trim().is_empty())
}

// ── Tauri Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn task_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, crate::commands::settings::SettingsState>,
    params: CreateTaskParams,
) -> Result<Task, String> {
    // Stateless resumption: when the frontend supplies an
    // `existing_id`, reuse that id and replay the historical messages into the
    // backend's in-memory task map. The fresh kiro-cli subprocess provides a
    // brand-new ACP session; the message history travels to the model via the
    // user's next prompt rather than via any session-level resume capability.
    let id = params.existing_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
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
    let initial_model_id = resolve_initial_model(
        params.model_id.clone(),
        &params.workspace,
        &settings.settings,
    );
    drop(settings);

    // Seed the task with prior messages (if resuming).
    let mut messages: Vec<TaskMessage> = params.existing_messages.unwrap_or_default();
    let prompt_is_empty = params.prompt.trim().is_empty();
    if !prompt_is_empty {
        messages.push(TaskMessage {
            role: "user".to_string(),
            content: params.prompt.clone(),
            timestamp: now.clone(),
            tool_calls: None,
            thinking: None,
        });
    }

    // Empty prompt or explicit defer => deferred-spawn. The task is registered
    // but the kiro-cli subprocess is not started until the user sends a real
    // message via `task_send_message`. Avoids spawning a process that would
    // immediately receive only the system prefix and confuse the model.
    let defer_spawn = params.defer_spawn || prompt_is_empty;
    let initial_status = if defer_spawn { "paused" } else { "running" };

    let task = Task {
        id: id.clone(),
        name: params.name,
        workspace: params.workspace.clone(),
        status: initial_status.to_string(),
        created_at: now,
        messages,
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(auto_approve),
        user_paused: None,
        parent_task_id: None,
    };

    // If a stale connection somehow lingers for this id, terminate it before
    // spawning a fresh one so the new subprocess owns the channel cleanly.
    // We drop the sender after Kill so the old thread's recv loop exits, then
    // yield briefly to let the OS reclaim the subprocess resources.
    if let Some(stale) = state.connections.lock().remove(&id) {
        let _ = stale.cmd_tx.send(AcpCommand::Kill);
        drop(stale);
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    state.tasks.lock().insert(id.clone(), task.clone());

    let _is_plan_mode = params.mode_id.as_deref() == Some("kiro_planner");

    // Deferred-spawn: register the task and return without launching kiro-cli.
    // The first call to `task_send_message` will detect there is no connection
    // and spawn one on demand via the existing reconnect path.
    if defer_spawn {
        return Ok(task);
    }

    let handle = spawn_connection(
        id.clone(),
        params.workspace,
        kiro_bin,
        auto_approve,
        app.clone(),
        params.mode_id,
        initial_model_id,
        tight_sandbox,
    )?;

    // Send initial prompt with UI formatting rules prepended (not shown in UI)
    let mut system_prefix = String::from(concat!(
        "## Asking the user clarifying questions\n\n",
        "Default to action. Most of the time you should NOT ask. Make a reasonable ",
        "assumption, state it in one line, and proceed. Only escalate to a question ",
        "when you genuinely cannot decide and the choice would materially change the work.\n\n",
        "**Ask ONLY for:**\n",
        "- Architectural decisions with non-trivial tradeoffs (e.g. REST vs. gRPC, monolith vs. service split, sync vs. event-driven).\n",
        "- Tech-stack or framework picks where multiple options are defensible (e.g. Postgres vs. SQLite, Zustand vs. Redux).\n",
        "- External dependencies where alternatives differ meaningfully on license, size, maintenance, or lock-in.\n",
        "- Ambiguous scope where two reasonable interpretations of the request would lead to materially different implementations.\n",
        "- Irreversible or hard-to-reverse changes (data deletion, schema migrations, public API breaks, force-push, prod config).\n\n",
        "**Do NOT ask for:**\n",
        "- Status updates, progress notes, or \"FYI\" — write those as plain prose.\n",
        "- Confirmations of an obvious next step you should just take.\n",
        "- Trivial wording, naming, formatting, or styling choices — pick a sensible default.\n",
        "- Anything answerable by reading the codebase, running a tool, or web search.\n",
        "- Open-ended \"what do you think?\" prompts — those belong in plain prose, not `[N]:`.\n\n",
        "**Format (required for the UI to render an interactive card):**\n\n",
        "[1]: Concise question ending in a question mark?\n",
        "a. **Short label** — One-line description of the tradeoff.\n",
        "b. **Short label** — One-line description of the tradeoff.\n",
        "c. **Other** — Describe your preference.\n\n",
        "**Rules — strict:**\n",
        "- Use the `[N]:` bracket-number format only. Never use bold (`**1.`) or numbered lists for questions.\n",
        "- Every `[N]:` question MUST have 2–4 concrete options as `a.`, `b.`, `c.`, ... (lowercase). A `[N]:` line without options will not render as a card and will confuse the user — write open-ended thoughts as plain prose instead.\n",
        "- Cap each turn at **1–3 questions total**. If more decisions exist, pick the highest-leverage ones and state your default for the rest in plain prose (\"Assuming X unless you say otherwise\").\n",
        "- One question per distinct decision. Do not split a single decision across multiple questions or restate the same choice in different words.\n",
        "- Place each question and its options on consecutive lines.\n",
        "- A short lead-in sentence is optional.\n\n",
        "When in doubt: don't ask. Decide, state the assumption, and proceed.\n\n",
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
    // Resumption preamble: when a thread is being resumed, the fresh kiro-cli
    // subprocess has no memory of the prior conversation. Replay the transcript
    // as context so the agent can follow up coherently. The messages live in
    // the user's first prompt instead of an in-process model session.
    //
    // The transcript is capped to keep the resumption preamble well under any
    // model's input window. Logic lives in `build_resumption_preamble` so
    // `task_fork` can share the same cap/format.
    let prior_messages: &[TaskMessage] = task
        .messages
        .split_last()
        .map(|(_new, prior)| prior)
        .unwrap_or(&[]);
    let resumption_preamble = super::build_resumption_preamble(
        prior_messages,
        "Resumed conversation",
        "You are resuming an earlier conversation in this workspace. \
         The transcript below is for context only — do not repeat prior work \
         or re-execute completed tool calls. The user's new message follows \
         after the transcript.",
    );
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
    let full_prompt = format!("{system_prefix}{resumption_preamble}{}{json_report_suffix}", params.prompt);
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
        let initial_model_id = resolve_initial_model(None, &workspace, &settings.settings);
        drop(settings);

        // Destroy old connection
        if let Some(old) = state.connections.lock().remove(&task_id) {
            let _ = old.cmd_tx.send(AcpCommand::Kill);
        }

        let handle = spawn_connection(
            task_id.clone(), workspace, kiro_bin, task_auto_approve,
            app.clone(), None, initial_model_id, tight_sandbox,
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
    // Purge from in-memory map — the frontend owns thread persistence via
    // its own store. Keeping cancelled tasks here leaks memory indefinitely.
    tasks.remove(&task_id);
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
    let mut parent_messages = parent.as_ref().map(|p| p.messages.clone()).unwrap_or_default();
    let parent_auto_approve = parent.as_ref().and_then(|p| p.auto_approve);

    // Normalize tool-call statuses on the cloned messages. The parent may be
    // mid-stream when forked; non-terminal statuses (`pending`, `in_progress`)
    // would render in the fork as if work were ongoing. Fix this on the data
    // before storing it on the new task.
    //
    // Note: there's a benign race here — the parent may complete a tool call
    // between our clone and this sanitize. The fork is a point-in-time snapshot
    // and the user can always see the parent's live state in its own thread.
    super::sanitize_forked_messages(&mut parent_messages);

    let new_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings = settings_state.0.lock();
    let auto_approve = parent_auto_approve.unwrap_or(settings.settings.auto_approve);
    let kiro_bin = settings.settings.kiro_bin.clone();
    let tight_sandbox = settings.settings.project_prefs.as_ref()
        .and_then(|p| p.get(&workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
    let initial_model_id = resolve_initial_model(None, &workspace, &settings.settings);
    drop(settings);

    // Build the transcript-replay preamble from the parent's messages. The
    // freshly spawned kiro-cli subprocess has no memory of the parent's
    // conversation, so we ship the transcript on the user's *next* prompt.
    // Stored on the connection handle and consumed on the first Prompt — the
    // fork lands in `paused` state with no model traffic until the user sends.
    let pending_preamble = super::build_resumption_preamble(
        &parent_messages,
        "Forked conversation",
        "This thread was forked from an earlier conversation. The transcript \
         below is for context only — do not repeat prior work or re-execute \
         completed tool calls. The user's new message follows after the \
         transcript and may diverge from the original direction.",
    );

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
    let preamble_opt = if pending_preamble.is_empty() { None } else { Some(pending_preamble) };
    let handle = super::connection::spawn_connection_with_preamble(
        new_id.clone(),
        workspace,
        kiro_bin,
        auto_approve,
        app,
        None,
        initial_model_id,
        tight_sandbox,
        preamble_opt,
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

/// Apply a model selection to the live ACP session for `task_id`. The change
/// is delivered as an `AcpCommand::SetModel`, which the connection loop
/// translates into a `session/set_model` request to kiro-cli. Returns
/// `Ok(())` even when the task has no live connection (e.g. deferred-spawn
/// thread) — the model preference is still persisted in `projectPrefs`/
/// `defaultModel` by the frontend, and the next spawn will pick it up via
/// `resolve_initial_model`.
#[tauri::command]
pub fn set_model(
    state: tauri::State<'_, AcpState>,
    task_id: String,
    model_id: String,
) -> Result<(), String> {
    let conns = state.connections.lock();
    if let Some(h) = conns.get(&task_id) {
        h.cmd_tx.send(AcpCommand::SetModel(model_id)).map_err(|e| e.to_string())?;
    }
    Ok(())
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
                    acp::NewSessionRequest::new(std::path::PathBuf::from(
                        std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
                    ))
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
