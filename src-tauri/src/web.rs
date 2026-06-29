use std::collections::{BTreeSet, HashMap};
use std::io::{Read, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent_client_protocol as acp_proto;
use acp_proto::Agent as _;
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State as AxumState;
use axum::http::{header, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tower_http::services::{ServeDir, ServeFile};

use crate::commands::{
    acp as app_acp, diff_parse, fs_ops, fuzzy, git, git_history, git_pr, git_stack, highlight,
    kiro_config, markdown, pattern_extract, project_watcher, settings, streaming_diff, thread_db,
    vcs_status,
};

#[derive(Clone, Debug)]
pub struct ServeOptions {
    pub host: String,
    pub port: u16,
    pub token: Option<String>,
    pub dist: Option<PathBuf>,
    pub dev_ui: Option<String>,
}

impl Default for ServeOptions {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 9230,
            token: None,
            dist: None,
            dev_ui: None,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    Event { event: String, payload: Value },
}

struct WebPtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    _reader_thread: std::thread::JoinHandle<()>,
}

impl Drop for WebPtyInstance {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct WebRuntime {
    token: String,
    version: String,
    settings: settings::SettingsState,
    acp: app_acp::AcpState,
    thread_db: thread_db::ThreadDatabase,
    fuzzy: fuzzy::FuzzyState,
    store: Mutex<WebJsonStore>,
    ptys: Mutex<HashMap<String, WebPtyInstance>>,
    events: broadcast::Sender<ServerMessage>,
    dev_ui: Option<String>,
}

impl WebRuntime {
    fn new(token: String, dev_ui: Option<String>) -> Result<Arc<Self>, String> {
        let (events, _) = broadcast::channel(2048);
        Ok(Arc::new(Self {
            token,
            version: env!("CARGO_PKG_VERSION").to_string(),
            settings: settings::SettingsState::default(),
            acp: app_acp::AcpState::default(),
            thread_db: thread_db::ThreadDatabase::open(),
            fuzzy: fuzzy::FuzzyState::default(),
            store: Mutex::new(WebJsonStore::load()?),
            ptys: Mutex::new(HashMap::new()),
            events,
            dev_ui,
        }))
    }

    fn emit(&self, event: impl Into<String>, payload: impl Serialize) {
        let payload = serde_json::to_value(payload).unwrap_or(Value::Null);
        let _ = self.events.send(ServerMessage::Event {
            event: event.into(),
            payload,
        });
    }

    fn emit_store_changed(&self, file: impl Into<String>, key: Option<String>) {
        self.emit("store_changed", json!({
            "file": file.into(),
            "key": key,
        }));
    }
}

struct WebJsonStore {
    path: PathBuf,
    data: serde_json::Map<String, Value>,
}

impl WebJsonStore {
    fn load() -> Result<Self, String> {
        let dir = dirs::data_dir()
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("kirodex");
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
        let path = dir.join("history-web.json");
        let data = if path.exists() {
            let text = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read web store: {e}"))?;
            serde_json::from_str::<serde_json::Map<String, Value>>(&text).unwrap_or_default()
        } else {
            serde_json::Map::new()
        };
        Ok(Self { path, data })
    }

    fn save(&self) -> Result<(), String> {
        let text = serde_json::to_string_pretty(&self.data)
            .map_err(|e| format!("Failed to serialize web store: {e}"))?;
        std::fs::write(&self.path, text).map_err(|e| format!("Failed to write web store: {e}"))
    }
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClientMessage {
    Request {
        id: Value,
        method: String,
        #[serde(default)]
        params: Value,
    },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ResponseMessage {
    Response {
        id: Value,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<RpcError>,
    },
}

#[derive(Serialize)]
struct RpcError {
    code: String,
    message: String,
}

pub async fn serve(options: ServeOptions) -> Result<(), String> {
    let token = options
        .token
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());
    if options.host == "0.0.0.0" && token.trim().is_empty() {
        return Err("--host 0.0.0.0 requires a non-empty --token".to_string());
    }

    let dist = if options.dev_ui.is_none() {
        Some(resolve_dist(options.dist.clone())?)
    } else {
        None
    };
    let runtime = WebRuntime::new(token.clone(), options.dev_ui.clone())?;
    let listen_host = options.host.clone();
    let listen_port = options.port;

    let mut app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/rpc", get(ws_handler));

    if let Some(dev_ui) = options.dev_ui.clone() {
        let rpc_host = listen_host.clone();
        let rpc_port = listen_port;
        app = app.fallback(get(move |AxumState(rt): AxumState<Arc<WebRuntime>>| async move {
            let url = format!(
                "{}{}kirodexRpc={}&token={}",
                dev_ui,
                if dev_ui.contains('?') { "&" } else { "?" },
                url_encode(&format!("ws://{}:{}/rpc", rpc_host, rpc_port)),
                url_encode(&rt.token),
            );
            Redirect::temporary(&url)
        }));
    } else if let Some(dist) = dist {
        let index = dist.join("index.html");
        app = app.fallback_service(
            ServeDir::new(&dist).not_found_service(ServeFile::new(index)),
        );
    }

    let app: Router<()> = app
        .layer(middleware::from_fn_with_state(
            runtime.clone(),
            auth_middleware,
        ))
        .with_state(runtime);

    let addr: SocketAddr = format!("{}:{}", listen_host, listen_port)
        .parse()
        .map_err(|e| format!("Invalid listen address: {e}"))?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind {addr}: {e}"))?;
    println!("Kirodex web server listening on http://{addr}");
    println!("Open http://{}:{}/?token={}", listen_host, listen_port, token);
    println!("Cloudflare Tunnel: cloudflared tunnel --url http://{addr}");
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| format!("Web server failed: {e}"))
}

fn resolve_dist(explicit: Option<PathBuf>) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(p) = explicit {
        candidates.push(p);
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("dist"));
            candidates.push(parent.join("../dist"));
        }
    }
    for candidate in candidates {
        if candidate.join("index.html").is_file() {
            return Ok(candidate);
        }
    }
    Err("Frontend bundle not found. Run `bun run build:renderer`, pass `--dist PATH`, or use `--dev-ui http://localhost:5174`.".to_string())
}

async fn auth_middleware(
    AxumState(runtime): AxumState<Arc<WebRuntime>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if req.uri().path() == "/healthz" {
        return next.run(req).await;
    }
    let query_token = query_token(req.uri().query());
    let has_valid_token = query_token.as_deref() == Some(runtime.token.as_str())
        || bearer_token(&req) == Some(runtime.token.as_str())
        || cookie_token(&req) == Some(runtime.token.as_str());
    if !has_valid_token {
        return (StatusCode::UNAUTHORIZED, "Missing or invalid Kirodex web token").into_response();
    }
    let should_set_cookie = query_token.as_deref() == Some(runtime.token.as_str());
    let mut response = next.run(req).await;
    if should_set_cookie {
        let cookie = format!("kirodex_token={}; HttpOnly; SameSite=Lax; Path=/", runtime.token);
        if let Ok(value) = header::HeaderValue::from_str(&cookie) {
            response.headers_mut().insert(header::SET_COOKIE, value);
        }
    }
    response
}

fn query_token(query: Option<&str>) -> Option<String> {
    query?.split('&').find_map(|part| {
        let (k, v) = part.split_once('=')?;
        (k == "token").then(|| v.to_string())
    })
}

fn bearer_token(req: &Request<Body>) -> Option<&str> {
    let value = req.headers().get(header::AUTHORIZATION)?.to_str().ok()?;
    value.strip_prefix("Bearer ")
}

fn cookie_token(req: &Request<Body>) -> Option<&str> {
    let value = req.headers().get(header::COOKIE)?.to_str().ok()?;
    value.split(';').find_map(|part| {
        let trimmed = part.trim();
        trimmed.strip_prefix("kirodex_token=")
    })
}

fn url_encode(input: &str) -> String {
    input
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![b as char]
            }
            _ => format!("%{b:02X}").chars().collect(),
        })
        .collect()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    AxumState(runtime): AxumState<Arc<WebRuntime>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, runtime))
}

async fn handle_socket(socket: WebSocket, runtime: Arc<WebRuntime>) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = runtime.events.subscribe();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let outbound = tokio::spawn(async move {
        while let Some(text) = out_rx.recv().await {
            if sender.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
    });
    let event_tx = out_tx.clone();
    let event_forwarder = tokio::spawn(async move {
        while let Ok(msg) = events.recv().await {
            let Ok(text) = serde_json::to_string(&msg) else { continue };
            if event_tx.send(text).is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        let Message::Text(text) = msg else { continue };
        let parsed = serde_json::from_str::<ClientMessage>(&text);
        let ClientMessage::Request { id, method, params } = match parsed {
            Ok(msg) => msg,
            Err(e) => {
                let response = ResponseMessage::Response {
                    id: Value::Null,
                    ok: false,
                    result: None,
                    error: Some(RpcError {
                        code: "bad_request".to_string(),
                        message: e.to_string(),
                    }),
                };
                if let Ok(text) = serde_json::to_string(&response) {
                    let _ = out_tx.send(text);
                }
                continue;
            }
        };
        let result = dispatch(runtime.clone(), &method, params).await;
        let response = match result {
            Ok(result) => ResponseMessage::Response {
                id,
                ok: true,
                result: Some(result),
                error: None,
            },
            Err(message) => ResponseMessage::Response {
                id,
                ok: false,
                result: None,
                error: Some(RpcError {
                    code: "command_failed".to_string(),
                    message,
                }),
            },
        };
        if let Ok(text) = serde_json::to_string(&response) {
            let _ = out_tx.send(text);
        }
    }
    event_forwarder.abort();
    outbound.abort();
}

fn get_param<T: DeserializeOwned>(params: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(
        params
            .get(key)
            .cloned()
            .ok_or_else(|| format!("Missing parameter `{key}`"))?,
    )
    .map_err(|e| format!("Invalid parameter `{key}`: {e}"))
}

fn opt_param<T: DeserializeOwned>(params: &Value, key: &str) -> Result<Option<T>, String> {
    match params.get(key) {
        Some(Value::Null) | None => Ok(None),
        Some(v) => serde_json::from_value(v.clone())
            .map(Some)
            .map_err(|e| format!("Invalid parameter `{key}`: {e}")),
    }
}

fn to_value<T: Serialize>(result: T) -> Result<Value, String> {
    serde_json::to_value(result).map_err(|e| e.to_string())
}

fn app_error(err: impl std::fmt::Display) -> String {
    err.to_string()
}

fn web_store_key(file: &str, key: &str) -> String {
    format!("{file}:{key}")
}

async fn dispatch(runtime: Arc<WebRuntime>, method: &str, params: Value) -> Result<Value, String> {
    match method {
        // Web/runtime helpers
        "web_runtime_info" => Ok(json!({
            "mode": "web",
            "version": runtime.version,
            "devUi": runtime.dev_ui,
        })),
        "web_store_get" => {
            let file: String = get_param(&params, "file")?;
            let key: String = get_param(&params, "key")?;
            let store_key = web_store_key(&file, &key);
            Ok(runtime.store.lock().data.get(&store_key).cloned().unwrap_or(Value::Null))
        }
        "web_store_set" => {
            let file: String = get_param(&params, "file")?;
            let key: String = get_param(&params, "key")?;
            let store_key = web_store_key(&file, &key);
            let value = params.get("value").cloned().unwrap_or(Value::Null);
            {
                let mut store = runtime.store.lock();
                store.data.insert(store_key, value);
                store.save()?;
            }
            runtime.emit_store_changed(file, Some(key));
            Ok(Value::Null)
        }
        "web_store_delete" => {
            let file: String = get_param(&params, "file")?;
            let key: String = get_param(&params, "key")?;
            let store_key = web_store_key(&file, &key);
            {
                let mut store = runtime.store.lock();
                store.data.remove(&store_key);
                store.save()?;
            }
            runtime.emit_store_changed(file, Some(key));
            Ok(Value::Null)
        }
        "web_store_clear" => {
            let file: String = get_param(&params, "file")?;
            let prefix = format!("{file}:");
            {
                let mut store = runtime.store.lock();
                store.data.retain(|key, _| !key.starts_with(&prefix));
                store.save()?;
            }
            runtime.emit_store_changed(file, None);
            Ok(Value::Null)
        }
        "web_store_flush" => {
            runtime.store.lock().save()?;
            Ok(Value::Null)
        }

        // ACP/task lifecycle
        "task_create" => {
            let task_params: app_acp::CreateTaskParams = get_param(&params, "params")?;
            to_value(web_task_create(runtime, task_params)?)
        }
        "task_list" => to_value(runtime.acp.tasks.lock().values().cloned().collect::<Vec<_>>()),
        "task_send_message" => {
            let task_id: String = get_param(&params, "taskId")?;
            let message: String = get_param(&params, "message")?;
            let attachments = opt_param::<Vec<app_acp::AttachmentData>>(&params, "attachments")?;
            to_value(web_task_send_message(runtime, task_id, message, attachments)?)
        }
        "task_pause" => {
            let task_id: String = get_param(&params, "taskId")?;
            to_value(web_task_pause(runtime, task_id)?)
        }
        "task_resume" => {
            let task_id: String = get_param(&params, "taskId")?;
            to_value(web_task_resume(runtime, task_id)?)
        }
        "task_cancel" => {
            let task_id: String = get_param(&params, "taskId")?;
            web_task_cancel(runtime, task_id)?;
            Ok(Value::Null)
        }
        "task_delete" => {
            let task_id: String = get_param(&params, "taskId")?;
            web_task_delete(runtime, task_id)?;
            Ok(Value::Null)
        }
        "task_fork" => {
            let fork_params: app_acp::ForkTaskParams = get_param(&params, "params")?;
            to_value(web_task_fork(runtime, fork_params).await?)
        }
        "task_allow_permission" => {
            let task_id: String = get_param(&params, "taskId")?;
            let request_id: String = get_param(&params, "requestId")?;
            let option_id = opt_param::<String>(&params, "optionId")?;
            web_task_permission(runtime, task_id, request_id, option_id, true)?;
            Ok(Value::Null)
        }
        "task_deny_permission" => {
            let task_id: String = get_param(&params, "taskId")?;
            let request_id: String = get_param(&params, "requestId")?;
            let option_id = opt_param::<String>(&params, "optionId")?;
            web_task_permission(runtime, task_id, request_id, option_id, false)?;
            Ok(Value::Null)
        }
        "task_set_auto_approve" => {
            let task_id: String = get_param(&params, "taskId")?;
            let auto_approve: bool = get_param(&params, "autoApprove")?;
            web_task_set_auto_approve(runtime, task_id, auto_approve)?;
            Ok(Value::Null)
        }
        "set_mode" => {
            let task_id: String = get_param(&params, "taskId")?;
            let mode_id: String = get_param(&params, "modeId")?;
            web_send_acp_command(&runtime, &task_id, app_acp::AcpCommand::SetMode(mode_id))?;
            Ok(Value::Null)
        }
        "set_model" => {
            let task_id: String = get_param(&params, "taskId")?;
            let model_id: String = get_param(&params, "modelId")?;
            if let Some(h) = runtime.acp.connections.lock().get(&task_id) {
                h.cmd_tx
                    .send(app_acp::AcpCommand::SetModel(model_id))
                    .map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
        "list_models" => {
            let kiro_bin = opt_param::<String>(&params, "kiroBin")?;
            web_list_models(runtime, kiro_bin).await
        }
        "probe_capabilities" => {
            web_probe_capabilities(runtime);
            Ok(json!({ "ok": true, "async": true }))
        }

        // Settings and native-ish no-ops
        "get_settings" => to_value(runtime.settings.0.lock().settings.clone()),
        "save_settings" => {
            let settings_value: settings::AppSettings = get_param(&params, "settings")?;
            {
                let mut store = runtime.settings.0.lock();
                store.settings = settings_value;
                settings::persist_store(&store).map_err(app_error)?;
            }
            Ok(Value::Null)
        }
        "get_recent_projects" => to_value(runtime.settings.0.lock().recent_projects.clone()),
        "add_recent_project" => {
            let path: String = get_param(&params, "path")?;
            let mut store = runtime.settings.0.lock();
            if store.recent_projects.first() != Some(&path) {
                store.recent_projects.retain(|p| p != &path);
                store.recent_projects.insert(0, path);
                store.recent_projects.truncate(10);
                settings::persist_store(&store).map_err(app_error)?;
            }
            Ok(Value::Null)
        }
        "clear_recent_projects" => {
            let mut store = runtime.settings.0.lock();
            store.recent_projects.clear();
            settings::persist_store(&store).map_err(app_error)?;
            Ok(Value::Null)
        }
        "rebuild_recent_menu" | "set_dock_icon" | "reset_dock_icon" | "set_relaunch_flag" => {
            Ok(Value::Null)
        }
        "reset_app_data" => {
            runtime.store.lock().data.clear();
            runtime.store.lock().save()?;
            Ok(Value::Null)
        }

        // File system and project tree
        "pick_folder" | "pick_image" => Err("Native file pickers are unavailable in browser mode. Enter a host path manually or use browser file upload where available.".to_string()),
        "detect_kiro_cli" => to_value(fs_ops::detect_kiro_cli()),
        "read_text_file" => to_value(fs_ops::read_text_file(get_param(&params, "path")?)),
        "read_file_base64" => to_value(fs_ops::read_file_base64(get_param(&params, "path")?)),
        "is_directory" => to_value(fs_ops::is_directory(get_param(&params, "path")?)),
        "list_project_files" => to_value(fs_ops::list_project_files(
            get_param(&params, "root")?,
            get_param(&params, "respectGitignore")?,
        ).map_err(app_error)?),
        "open_in_editor" => {
            fs_ops::open_in_editor(get_param(&params, "path")?, get_param(&params, "editor")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }
        "open_url" => {
            fs_ops::open_url(get_param(&params, "url")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "detect_editors" => to_value(fs_ops::detect_editors()),
        "detect_editors_background" => Ok(Value::Null),
        "kiro_whoami" => to_value(fs_ops::kiro_whoami(opt_param(&params, "kiroBin")?).map_err(app_error)?),
        "kiro_logout" => {
            fs_ops::kiro_logout(opt_param(&params, "kiroBin")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "open_terminal_with_command" => {
            fs_ops::open_terminal_with_command(get_param(&params, "command")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "detect_project_icon" => to_value(fs_ops::detect_project_icon(get_param(&params, "cwd")?)),
        "list_small_images" => to_value(fs_ops::list_small_images(
            get_param(&params, "cwd")?,
            get_param(&params, "maxSize")?,
        )),
        "watch_project_tree" | "unwatch_project_tree" | "watch_kiro_path" | "unwatch_kiro_path" => Ok(Value::Null),
        "scan_root" => to_value(project_watcher::scan_root(
            get_param(&params, "workspace")?,
            get_param(&params, "respectGitignore")?,
        ).map_err(app_error)?),
        "scan_directory" => to_value(project_watcher::scan_directory(
            get_param(&params, "workspace")?,
            get_param(&params, "relPath")?,
            get_param(&params, "respectGitignore")?,
        ).map_err(app_error)?),
        "create_file" => to_value(project_watcher::create_file(
            get_param(&params, "workspace")?,
            get_param(&params, "relPath")?,
        ).map_err(app_error)?),
        "create_directory" => to_value(project_watcher::create_directory(
            get_param(&params, "workspace")?,
            get_param(&params, "relPath")?,
        ).map_err(app_error)?),
        "delete_entry" => {
            project_watcher::delete_entry(
                get_param(&params, "workspace")?,
                get_param(&params, "relPath")?,
                get_param(&params, "permanent")?,
            ).map_err(app_error)?;
            Ok(Value::Null)
        }
        "rename_entry" => to_value(project_watcher::rename_entry(
            get_param(&params, "workspace")?,
            get_param(&params, "oldRelPath")?,
            get_param(&params, "newRelPath")?,
        ).map_err(app_error)?),
        "copy_entry" => to_value(project_watcher::copy_entry(
            get_param(&params, "workspace")?,
            get_param(&params, "srcRelPath")?,
            get_param(&params, "destRelPath")?,
        ).map_err(app_error)?),
        "duplicate_entry" => to_value(project_watcher::duplicate_entry(
            get_param(&params, "workspace")?,
            get_param(&params, "relPath")?,
        ).map_err(app_error)?),
        "copy_entry_path" => to_value(project_watcher::copy_entry_path(
            get_param(&params, "workspace")?,
            get_param(&params, "relPath")?,
            get_param(&params, "relative")?,
        )),
        "reveal_in_finder" => {
            project_watcher::reveal_in_finder(get_param(&params, "workspace")?, get_param(&params, "relPath")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }
        "open_finder_search" => {
            project_watcher::open_finder_search(get_param(&params, "path")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }
        "open_in_default_app" => {
            project_watcher::open_in_default_app(get_param(&params, "workspace")?, get_param(&params, "relPath")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }
        "open_terminal_at" => {
            project_watcher::open_terminal_at(get_param(&params, "workspace")?, get_param(&params, "relPath")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }
        "add_to_gitignore" => {
            project_watcher::add_to_gitignore(get_param(&params, "workspace")?, get_param(&params, "relPath")?)
                .map_err(app_error)?;
            Ok(Value::Null)
        }

        // Git and diffs
        "git_detect" => to_value(git::git_detect(get_param(&params, "path")?)),
        "git_init" => {
            git::git_init(get_param(&params, "path")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_clone" => to_value(git::git_clone(get_param(&params, "url")?, get_param(&params, "targetDir")?).await.map_err(app_error)?),
        "git_list_branches" => to_value(git::git_list_branches(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_checkout" => to_value(git::git_checkout(get_param(&params, "cwd")?, get_param(&params, "branch")?, opt_param(&params, "force")?).map_err(app_error)?),
        "git_checkout_remote" => to_value(git::git_checkout_remote(get_param(&params, "cwd")?, get_param(&params, "remoteRef")?, opt_param(&params, "force")?).map_err(app_error)?),
        "git_create_branch" => to_value(git::git_create_branch(get_param(&params, "cwd")?, get_param(&params, "branch")?).map_err(app_error)?),
        "git_delete_branch" => to_value(git::git_delete_branch(get_param(&params, "cwd")?, get_param(&params, "branch")?).map_err(app_error)?),
        "git_diff" => to_value(git::git_diff(get_param(&params, "cwd")?).map_err(app_error)?),
        "task_diff" => {
            let task_id: String = get_param(&params, "taskId")?;
            to_value(git::git_diff(web_task_workspace(&runtime, &task_id)?).map_err(app_error)?)
        }
        "git_diff_file" => to_value(web_git_diff_file(&runtime, get_param(&params, "taskId")?, get_param(&params, "filePath")?)?),
        "git_diff_stats" => to_value(git::git_diff_stats(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_staged_stats" => to_value(git::git_staged_stats(get_param(&params, "cwd")?).map_err(app_error)?),
        "task_diff_stats" => {
            let task_id: String = get_param(&params, "taskId")?;
            to_value(git::git_diff_stats(web_task_workspace(&runtime, &task_id)?).map_err(app_error)?)
        }
        "git_remote_url" => to_value(git::git_remote_url(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_changed_files" => to_value(git::git_changed_files(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_stage_files" => {
            git::git_stage_files(get_param(&params, "cwd")?, get_param(&params, "filePaths")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_stage" => {
            web_git_task_file(&runtime, get_param(&params, "taskId")?, get_param(&params, "filePath")?, "add")?;
            Ok(Value::Null)
        }
        "git_revert" => {
            web_git_task_file(&runtime, get_param(&params, "taskId")?, get_param(&params, "filePath")?, "checkout")?;
            Ok(Value::Null)
        }
        "git_commit" => to_value(web_git_commit(&runtime, get_param(&params, "cwd")?, get_param(&params, "message")?)?),
        "git_push" => to_value(git::git_push(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_pull" => to_value(git::git_pull(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_fetch" => to_value(git::git_fetch(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_worktree_create" => to_value(git::git_worktree_create(get_param(&params, "cwd")?, get_param(&params, "slug")?).map_err(app_error)?),
        "git_worktree_remove" => {
            git::git_worktree_remove(get_param(&params, "cwd")?, get_param(&params, "worktreePath")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_worktree_has_changes" => to_value(git::git_worktree_has_changes(get_param(&params, "worktreePath")?).map_err(app_error)?),
        "git_worktree_setup" => to_value(git::git_worktree_setup(get_param(&params, "cwd")?, get_param(&params, "worktreePath")?, get_param(&params, "symlinkDirs")?).map_err(app_error)?),
        "git_create_and_checkout_branch" => to_value(git::git_create_and_checkout_branch(get_param(&params, "cwd")?, get_param(&params, "branch")?).map_err(app_error)?),
        "git_add_remote" => {
            git::git_add_remote(get_param(&params, "cwd")?, get_param(&params, "name")?, get_param(&params, "url")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_vcs_status" => to_value(vcs_status::git_vcs_status(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_list_stack" => to_value(git_stack::git_list_stack(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_stacked_push" => to_value(git_stack::git_stacked_push(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_commit_history" => to_value(git_history::git_commit_history(
            get_param(&params, "cwd")?,
            opt_param(&params, "limit")?,
            opt_param(&params, "skip")?,
            opt_param(&params, "includeStats")?,
        ).map_err(app_error)?),
        "git_commit_diff" => to_value(git_history::git_commit_diff(get_param(&params, "cwd")?, get_param(&params, "oid")?).map_err(app_error)?),
        "git_commit_stats" => to_value(git_history::git_commit_stats(get_param(&params, "cwd")?, get_param(&params, "oids")?).map_err(app_error)?),
        "git_stash_list" => to_value(git_history::git_stash_list(get_param(&params, "cwd")?).map_err(app_error)?),
        "git_stash_pop" => {
            git_history::git_stash_pop(get_param(&params, "cwd")?, opt_param(&params, "index")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_stash_drop" => {
            git_history::git_stash_drop(get_param(&params, "cwd")?, opt_param(&params, "index")?).map_err(app_error)?;
            Ok(Value::Null)
        }
        "git_stash_save" => to_value(git_history::git_stash_save(get_param(&params, "cwd")?, opt_param(&params, "message")?).map_err(app_error)?),
        "git_detect_provider" => to_value(git_pr::git_detect_provider(get_param(&params, "cwd")?).await.map_err(app_error)?),
        "git_create_pr" => to_value(git_pr::git_create_pr(
            get_param(&params, "cwd")?,
            get_param(&params, "title")?,
            get_param(&params, "body")?,
            get_param(&params, "base")?,
            opt_param(&params, "draft")?,
        ).await.map_err(app_error)?),
        "git_pr_status" => to_value(git_pr::git_pr_status(get_param(&params, "cwd")?).await.map_err(app_error)?),
        "git_pr_open_in_browser" => {
            git_pr::git_pr_open_in_browser(get_param(&params, "cwd")?).await.map_err(app_error)?;
            Ok(Value::Null)
        }

        // Parsing, highlighting, search
        "compute_diff" => to_value(streaming_diff::compute_diff(get_param(&params, "oldText")?, get_param(&params, "newText")?)),
        "compute_line_diff" => to_value(streaming_diff::compute_line_diff(get_param(&params, "oldText")?, get_param(&params, "newText")?)),
        "git_diff_structured" => to_value(diff_parse::git_diff_structured(get_param(&params, "cwd")?).map_err(app_error)?),
        "task_diff_structured" => Err("Structured task diffs are unavailable in web mode; use git_diff_structured with a workspace path.".to_string()),
        "parse_markdown" => to_value(markdown::parse_markdown(get_param(&params, "text")?)),
        "highlight_code" => to_value(highlight::highlight_code_uncached(
            get_param(&params, "text")?,
            get_param(&params, "lang")?,
            opt_param(&params, "theme")?,
        ).map_err(app_error)?),
        "highlight_supported_languages" => to_value(highlight::highlight_supported_languages()),
        "fuzzy_match" => to_value(fuzzy::fuzzy_match_core(
            &runtime.fuzzy,
            get_param(&params, "query")?,
            get_param(&params, "candidates")?,
            opt_param(&params, "limit")?,
        )),
        "extract_patterns" => to_value(pattern_extract::extract_patterns(get_param(&params, "filePath")?).map_err(app_error)?),
        "extract_patterns_batch" => to_value(pattern_extract::extract_patterns_batch(get_param(&params, "filePaths")?).map_err(app_error)?),

        // Kiro config
        "get_kiro_config" => to_value(kiro_config::get_kiro_config(opt_param(&params, "projectPath")?)),
        "save_mcp_server_config" => {
            kiro_config::save_mcp_server_config(
                get_param(&params, "filePath")?,
                get_param(&params, "serverName")?,
                get_param(&params, "patch")?,
            ).map_err(app_error)?;
            Ok(Value::Null)
        }
        "mcp_add_server" => to_value(kiro_config::mcp_add_server(
            get_param(&params, "request")?,
            opt_param(&params, "workspace")?,
            opt_param(&params, "kiroBin")?,
        ).await.map_err(app_error)?),
        "mcp_remove_server" => to_value(kiro_config::mcp_remove_server(
            get_param(&params, "request")?,
            opt_param(&params, "workspace")?,
            opt_param(&params, "kiroBin")?,
        ).await.map_err(app_error)?),

        // Thread DB
        "thread_db_list" => to_value(runtime.thread_db.list_threads().await.map_err(app_error)?),
        "thread_db_load" => to_value(runtime.thread_db.load_thread(&get_param::<String>(&params, "threadId")?).await.map_err(app_error)?),
        "thread_db_save" => {
            let thread: thread_db::DbThread = get_param(&params, "thread")?;
            runtime.thread_db.save_thread(&thread).await.map_err(app_error)?;
            Ok(Value::Null)
        }
        "thread_db_delete" => {
            runtime.thread_db.delete_thread(&get_param::<String>(&params, "threadId")?).await.map_err(app_error)?;
            Ok(Value::Null)
        }
        "thread_db_messages" => to_value(runtime.thread_db.load_messages(&get_param::<String>(&params, "threadId")?).await.map_err(app_error)?),
        "thread_db_save_message" => {
            let message: thread_db::DbMessage = get_param(&params, "message")?;
            to_value(runtime.thread_db.save_message(&message).await.map_err(app_error)?)
        }
        "thread_db_search" => to_value(runtime.thread_db.search_messages(
            &get_param::<String>(&params, "query")?,
            opt_param::<u32>(&params, "limit")?.unwrap_or(20),
        ).await.map_err(app_error)?),
        "thread_db_stats" => to_value(runtime.thread_db.stats().await.map_err(app_error)?),
        "thread_db_clear_all" => {
            runtime.thread_db.clear_all().await.map_err(app_error)?;
            Ok(Value::Null)
        }
        "thread_db_auto_archive" => to_value(runtime.thread_db.auto_archive_stale(get_param(&params, "days")?).await.map_err(app_error)?),

        // PTY
        "pty_create" => {
            web_pty_create(runtime, get_param(&params, "id")?, get_param(&params, "cwd")?, opt_param(&params, "cols")?, opt_param(&params, "rows")?)?;
            Ok(Value::Null)
        }
        "pty_write" => {
            web_pty_write(&runtime, get_param(&params, "id")?, get_param(&params, "data")?)?;
            Ok(Value::Null)
        }
        "pty_resize" => {
            web_pty_resize(&runtime, get_param(&params, "id")?, get_param(&params, "cols")?, get_param(&params, "rows")?)?;
            Ok(Value::Null)
        }
        "pty_kill" => {
            web_pty_kill(&runtime, get_param(&params, "id")?)?;
            Ok(Value::Null)
        }
        "pty_count" => to_value(runtime.ptys.lock().len() as u32),

        // Explicitly unsupported in standalone web v1
        "generate_thread_title" | "generate_branch_name" | "rename_worktree_branch" | "generate_pr_content"
        | "git_generate_commit_message" | "mcp_transport_test" | "trace_read_recent" | "trace_file_location"
        | "trace_clear" | "list_child_processes" | "signal_process" | "checkpoint_create"
        | "checkpoint_list" | "checkpoint_diff" | "checkpoint_revert" | "checkpoint_cleanup" => {
            Err(format!("{method} is not available in browser mode yet"))
        }
        "analytics_save" | "analytics_clear" => Ok(Value::Null),
        "analytics_load" => Ok(Value::Array(vec![])),
        "analytics_db_size" => Ok(Value::from(0)),
        "analytics_coding_hours_by_day" | "analytics_messages_by_day" | "analytics_tokens_by_day"
        | "analytics_diff_stats_by_day" | "analytics_model_popularity" | "analytics_tool_call_breakdown"
        | "analytics_mode_usage" | "analytics_project_stats" => Ok(Value::Array(vec![])),
        "analytics_totals" => Ok(json!({
            "codingHours": 0,
            "messagesSent": 0,
            "messagesReceived": 0,
            "tokens": 0,
            "diffAdditions": 0,
            "diffDeletions": 0,
            "filesEdited": 0,
            "toolCalls": 0
        })),
        other => Err(format!("Unknown command `{other}`")),
    }
}

fn web_task_create(
    runtime: Arc<WebRuntime>,
    params: app_acp::CreateTaskParams,
) -> Result<app_acp::Task, String> {
    let id = params
        .existing_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = now_rfc3339();
    let settings_guard = runtime.settings.0.lock();
    let auto_approve = params
        .auto_approve
        .unwrap_or(settings_guard.settings.auto_approve);
    let kiro_bin = settings_guard.settings.kiro_bin.clone();
    let co_author = settings_guard.settings.co_author;
    let co_author_json_report = settings_guard.settings.co_author_json_report;
    let tight_sandbox = settings_guard
        .settings
        .project_prefs
        .as_ref()
        .and_then(|p| p.get(&params.workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
    let initial_model_id =
        app_acp::resolve_initial_model(params.model_id.clone(), &params.workspace, &settings_guard.settings);
    drop(settings_guard);

    if let Some(stale) = runtime.acp.connections.lock().remove(&id) {
        let _ = stale.cmd_tx.send(app_acp::AcpCommand::Kill);
    }

    let mut messages = params.existing_messages.clone().unwrap_or_default();
    let prompt_is_empty = params.prompt.trim().is_empty();
    if !prompt_is_empty {
        messages.push(app_acp::TaskMessage {
            role: "user".to_string(),
            content: params.prompt.clone(),
            timestamp: now.clone(),
            tool_calls: None,
            thinking: None,
        });
    }
    let defer_spawn = params.defer_spawn || prompt_is_empty;
    let task = app_acp::Task {
        id: id.clone(),
        name: params.name,
        workspace: params.workspace.clone(),
        status: if defer_spawn { "paused" } else { "running" }.to_string(),
        created_at: now,
        messages,
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(auto_approve),
        user_paused: None,
        parent_task_id: None,
    };
    runtime.acp.tasks.lock().insert(id.clone(), task.clone());
    runtime.emit("task_update", task.clone());

    if defer_spawn {
        return Ok(task);
    }

    let handle = spawn_web_connection(
        runtime.clone(),
        id.clone(),
        params.workspace,
        kiro_bin,
        auto_approve,
        params.mode_id,
        initial_model_id,
        tight_sandbox,
        None,
    )?;
    let full_prompt = build_system_prompt(
        co_author,
        co_author_json_report,
        &task,
        &params.prompt,
        "Resumed conversation",
        "You are resuming an earlier conversation in this workspace. The transcript below is for context only.",
    );
    let _ = handle
        .cmd_tx
        .send(app_acp::AcpCommand::Prompt(full_prompt, params.attachments.unwrap_or_default()));
    runtime.acp.connections.lock().insert(id, handle);
    Ok(task)
}

fn build_system_prompt(
    co_author: bool,
    co_author_json_report: bool,
    task: &app_acp::Task,
    prompt: &str,
    header: &str,
    intro: &str,
) -> String {
    let mut system_prefix = String::from(concat!(
        "## Asking the user clarifying questions\n\n",
        "Default to action. Most of the time you should NOT ask. Make a reasonable assumption, state it briefly, and proceed.\n\n",
        "---\n\n",
    ));
    if co_author {
        system_prefix.push_str(concat!(
            "## Commits\n\n",
            "Every git commit must include the co-author trailer:\n\n",
            "```\nCo-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>\n```\n\n",
            "Use conventional commit format: `type(scope): description`.\n\n---\n\n",
        ));
    }
    let prior_messages: &[app_acp::TaskMessage] = task
        .messages
        .split_last()
        .map(|(_, prior)| prior)
        .unwrap_or(&[]);
    let preamble = app_acp::build_resumption_preamble(prior_messages, header, intro);
    let report = if co_author_json_report {
        "\n\n## Completion report\n\nWhen you finish, append a single `kirodex-report` JSON block with status, summary, filesChanged, linesAdded, and linesRemoved."
    } else {
        ""
    };
    format!("{system_prefix}{preamble}{prompt}{report}")
}

fn web_task_send_message(
    runtime: Arc<WebRuntime>,
    task_id: String,
    message: String,
    attachments: Option<Vec<app_acp::AttachmentData>>,
) -> Result<app_acp::Task, String> {
    {
        let mut tasks = runtime.acp.tasks.lock();
        let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
        task.messages.push(app_acp::TaskMessage {
            role: "user".to_string(),
            content: message.clone(),
            timestamp: now_rfc3339(),
            tool_calls: None,
            thinking: None,
        });
        task.status = "running".to_string();
        runtime.emit("task_update", task.clone());
    }

    let needs_spawn = {
        let conns = runtime.acp.connections.lock();
        conns
            .get(&task_id)
            .map(|h| !h.alive.load(std::sync::atomic::Ordering::SeqCst))
            .unwrap_or(true)
    };
    if needs_spawn {
        let settings_guard = runtime.settings.0.lock();
        let kiro_bin = settings_guard.settings.kiro_bin.clone();
        let global_auto_approve = settings_guard.settings.auto_approve;
        let (workspace, task_auto_approve) = {
            let tasks = runtime.acp.tasks.lock();
            let task = tasks.get(&task_id).ok_or("Task not found")?;
            (task.workspace.clone(), task.auto_approve.unwrap_or(global_auto_approve))
        };
        let tight_sandbox = settings_guard
            .settings
            .project_prefs
            .as_ref()
            .and_then(|p| p.get(&workspace))
            .and_then(|pp| pp.tight_sandbox)
            .unwrap_or(true);
        let initial_model_id =
            app_acp::resolve_initial_model(None, &workspace, &settings_guard.settings);
        drop(settings_guard);
        if let Some(old) = runtime.acp.connections.lock().remove(&task_id) {
            let _ = old.cmd_tx.send(app_acp::AcpCommand::Kill);
        }
        let handle = spawn_web_connection(
            runtime.clone(),
            task_id.clone(),
            workspace,
            kiro_bin,
            task_auto_approve,
            None,
            initial_model_id,
            tight_sandbox,
            None,
        )?;
        let _ = handle
            .cmd_tx
            .send(app_acp::AcpCommand::Prompt(message, attachments.unwrap_or_default()));
        runtime.acp.connections.lock().insert(task_id.clone(), handle);
    } else {
        web_send_acp_command(
            &runtime,
            &task_id,
            app_acp::AcpCommand::Prompt(message, attachments.unwrap_or_default()),
        )?;
    }
    runtime
        .acp
        .tasks
        .lock()
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "Task not found".to_string())
}

fn web_task_pause(runtime: Arc<WebRuntime>, task_id: String) -> Result<app_acp::Task, String> {
    if let Some(h) = runtime.acp.connections.lock().get(&task_id) {
        let _ = h.cmd_tx.send(app_acp::AcpCommand::Cancel);
    }
    let mut tasks = runtime.acp.tasks.lock();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = "paused".to_string();
    task.user_paused = Some(true);
    runtime.emit("task_update", task.clone());
    Ok(task.clone())
}

fn web_task_resume(runtime: Arc<WebRuntime>, task_id: String) -> Result<app_acp::Task, String> {
    if let Some(h) = runtime.acp.connections.lock().get(&task_id) {
        let _ = h
            .cmd_tx
            .send(app_acp::AcpCommand::Prompt("continue".to_string(), vec![]));
    }
    let mut tasks = runtime.acp.tasks.lock();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = "running".to_string();
    task.user_paused = Some(false);
    runtime.emit("task_update", task.clone());
    Ok(task.clone())
}

fn web_task_cancel(runtime: Arc<WebRuntime>, task_id: String) -> Result<(), String> {
    if let Some(h) = runtime.acp.connections.lock().remove(&task_id) {
        let _ = h.cmd_tx.send(app_acp::AcpCommand::Kill);
    }
    let mut tasks = runtime.acp.tasks.lock();
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "cancelled".to_string();
        runtime.emit("task_update", task.clone());
    }
    tasks.remove(&task_id);
    Ok(())
}

fn web_task_delete(runtime: Arc<WebRuntime>, task_id: String) -> Result<(), String> {
    if let Some(h) = runtime.acp.connections.lock().remove(&task_id) {
        let _ = h.cmd_tx.send(app_acp::AcpCommand::Kill);
    }
    runtime.acp.tasks.lock().remove(&task_id);
    Ok(())
}

async fn web_task_fork(
    runtime: Arc<WebRuntime>,
    params: app_acp::ForkTaskParams,
) -> Result<app_acp::Task, String> {
    let parent = runtime.acp.tasks.lock().get(&params.task_id).cloned();
    let workspace = parent
        .as_ref()
        .map(|p| p.workspace.clone())
        .or(params.workspace)
        .ok_or("No workspace found for task")?;
    let parent_name = parent
        .as_ref()
        .map(|p| p.name.clone())
        .or(params.parent_name)
        .unwrap_or_else(|| "thread".to_string());
    let mut parent_messages = parent.as_ref().map(|p| p.messages.clone()).unwrap_or_default();
    app_acp::sanitize_forked_messages(&mut parent_messages);
    let parent_auto_approve = parent.as_ref().and_then(|p| p.auto_approve);
    let new_id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let settings_guard = runtime.settings.0.lock();
    let auto_approve = parent_auto_approve.unwrap_or(settings_guard.settings.auto_approve);
    let kiro_bin = settings_guard.settings.kiro_bin.clone();
    let tight_sandbox = settings_guard
        .settings
        .project_prefs
        .as_ref()
        .and_then(|p| p.get(&workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
    let initial_model_id =
        app_acp::resolve_initial_model(None, &workspace, &settings_guard.settings);
    drop(settings_guard);
    let pending_preamble = app_acp::build_resumption_preamble(
        &parent_messages,
        "Forked conversation",
        "This thread was forked from an earlier conversation. The transcript below is for context only.",
    );
    let fork_task = app_acp::Task {
        id: new_id.clone(),
        name: format!("fork: {parent_name}"),
        workspace: workspace.clone(),
        status: "paused".to_string(),
        created_at: now.clone(),
        messages: {
            let mut msgs = parent_messages;
            msgs.push(app_acp::TaskMessage {
                role: "system".to_string(),
                content: format!("Forked from: {parent_name}"),
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
        parent_task_id: Some(params.task_id),
    };
    runtime.acp.tasks.lock().insert(new_id.clone(), fork_task.clone());
    let handle = spawn_web_connection(
        runtime.clone(),
        new_id.clone(),
        workspace,
        kiro_bin,
        auto_approve,
        None,
        initial_model_id,
        tight_sandbox,
        (!pending_preamble.is_empty()).then_some(pending_preamble),
    )?;
    runtime.acp.connections.lock().insert(new_id, handle);
    Ok(fork_task)
}

fn web_task_permission(
    runtime: Arc<WebRuntime>,
    task_id: String,
    request_id: String,
    option_id: Option<String>,
    allow: bool,
) -> Result<(), String> {
    let resolved = option_id.unwrap_or_else(|| {
        let tasks = runtime.acp.tasks.lock();
        tasks
            .get(&task_id)
            .and_then(|t| t.pending_permission.as_ref())
            .and_then(|pp| {
                let preferred = if allow { "allow_once" } else { "reject_once" };
                pp.options
                    .iter()
                    .find(|o| o.kind == preferred)
                    .or_else(|| pp.options.first())
            })
            .map(|o| o.option_id.clone())
            .unwrap_or_else(|| if allow { "allow" } else { "reject" }.to_string())
    });
    if let Some(tx) = runtime.acp.permission_resolvers.lock().remove(&request_id) {
        let _ = tx.send(app_acp::PermissionReply { option_id: resolved });
    }
    let mut tasks = runtime.acp.tasks.lock();
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "running".to_string();
        task.pending_permission = None;
        runtime.emit("task_update", task.clone());
    }
    Ok(())
}

fn web_task_set_auto_approve(
    runtime: Arc<WebRuntime>,
    task_id: String,
    auto_approve: bool,
) -> Result<(), String> {
    if let Some(h) = runtime.acp.connections.lock().get(&task_id) {
        h.auto_approve
            .store(auto_approve, std::sync::atomic::Ordering::SeqCst);
    }
    let mut tasks = runtime.acp.tasks.lock();
    if let Some(task) = tasks.get_mut(&task_id) {
        task.auto_approve = Some(auto_approve);
        runtime.emit("task_update", task.clone());
    }
    Ok(())
}

fn web_send_acp_command(
    runtime: &WebRuntime,
    task_id: &str,
    cmd: app_acp::AcpCommand,
) -> Result<(), String> {
    let conns = runtime.acp.connections.lock();
    let h = conns.get(task_id).ok_or("No connection for task")?;
    h.cmd_tx.send(cmd).map_err(|e| e.to_string())
}

fn web_task_workspace(runtime: &WebRuntime, task_id: &str) -> Result<String, String> {
    runtime
        .acp
        .tasks
        .lock()
        .get(task_id)
        .map(|t| t.workspace.clone())
        .ok_or_else(|| format!("Task not found: {task_id}"))
}

fn now_rfc3339() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    format!("{}", chrono_free_rfc3339(secs))
}

fn chrono_free_rfc3339(secs: u64) -> String {
    let days = secs / 86_400;
    let sod = secs % 86_400;
    let (y, m, d) = days_to_ymd(days);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", sod / 3600, (sod % 3600) / 60, sod % 60)
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

fn web_git_diff_file(
    runtime: &WebRuntime,
    task_id: String,
    file_path: String,
) -> Result<String, String> {
    let cwd = web_task_workspace(runtime, &task_id)?;
    run_git_output(&cwd, &["diff", "--", &file_path])
}

fn web_git_task_file(
    runtime: &WebRuntime,
    task_id: String,
    file_path: String,
    op: &str,
) -> Result<(), String> {
    let cwd = web_task_workspace(runtime, &task_id)?;
    let args = if op == "add" {
        vec!["add", "--", file_path.as_str()]
    } else {
        vec!["checkout", "--", file_path.as_str()]
    };
    run_git_output(&cwd, &args).map(|_| ())
}

fn web_git_commit(runtime: &WebRuntime, cwd: String, message: String) -> Result<String, String> {
    let co_author = runtime.settings.0.lock().settings.co_author;
    let message = if co_author {
        format!("{message}\n\nCo-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>")
    } else {
        message
    };
    run_git_output(&cwd, &["add", "-A"])?;
    run_git_output(&cwd, &["commit", "-m", &message])
}

fn run_git_output(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn web_pty_create(
    runtime: Arc<WebRuntime>,
    id: String,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    if !Path::new(&cwd).is_dir() {
        return Err(format!("PTY cwd is not a directory: {cwd}"));
    }
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            "/bin/zsh".to_string()
        }
    });
    let mut cmd = CommandBuilder::new(&shell);
    if !cfg!(target_os = "windows") {
        cmd.arg("-l");
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let event_id = id.clone();
    let rt = runtime.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut buf = [0u8; 16_384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    rt.emit("pty_exit", json!({ "id": event_id }));
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    rt.emit("pty_data", json!({ "id": event_id, "data": data }));
                }
                Err(_) => {
                    rt.emit("pty_exit", json!({ "id": event_id }));
                    break;
                }
            }
        }
    });
    runtime.ptys.lock().insert(
        id,
        WebPtyInstance {
            master: pair.master,
            writer,
            child,
            _reader_thread: reader_thread,
        },
    );
    Ok(())
}

fn web_pty_write(runtime: &WebRuntime, id: String, data: String) -> Result<(), String> {
    let mut ptys = runtime.ptys.lock();
    let pty = ptys.get_mut(&id).ok_or("PTY not found")?;
    pty.writer
        .write_all(data.as_bytes())
        .and_then(|_| pty.writer.flush())
        .map_err(|e| e.to_string())
}

fn web_pty_resize(runtime: &WebRuntime, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let ptys = runtime.ptys.lock();
    let pty = ptys.get(&id).ok_or("PTY not found")?;
    pty.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

fn web_pty_kill(runtime: &WebRuntime, id: String) -> Result<(), String> {
    runtime
        .ptys
        .lock()
        .remove(&id)
        .map(|_| ())
        .ok_or_else(|| "PTY not found".to_string())
}

fn spawn_web_connection(
    runtime: Arc<WebRuntime>,
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: bool,
    initial_mode_id: Option<String>,
    initial_model_id: Option<String>,
    tight_sandbox: bool,
    pending_preamble: Option<String>,
) -> Result<app_acp::ConnectionHandle, String> {
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<app_acp::AcpCommand>();
    let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let alive_clone = alive.clone();
    let auto_approve_flag = Arc::new(std::sync::atomic::AtomicBool::new(auto_approve));
    let auto_approve_for_client = auto_approve_flag.clone();
    let (perm_tx, mut perm_rx) = mpsc::unbounded_channel::<(
        String,
        acp_proto::RequestPermissionRequest,
        oneshot::Sender<app_acp::PermissionReply>,
    )>();

    let permission_runtime = runtime.clone();
    let permission_task_id = task_id.clone();
    tokio::spawn(async move {
        while let Some((request_id, req, reply_tx)) = perm_rx.recv().await {
            let val = serde_json::to_value(&req).unwrap_or_default();
            let tool_call = val.get("toolCall");
            let tool_name = tool_call
                .and_then(|tc| tc.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let options = val
                .get("options")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|o| {
                            Some(app_acp::PermissionOption {
                                option_id: o.get("optionId")?.as_str()?.to_string(),
                                name: o.get("name")?.as_str()?.to_string(),
                                kind: o.get("kind")?.as_str()?.to_string(),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let description = if tool_name != "unknown" {
                format!("{tool_name} requires permission")
            } else {
                "Permission requested".to_string()
            };
            {
                let mut tasks = permission_runtime.acp.tasks.lock();
                if let Some(task) = tasks.get_mut(&permission_task_id) {
                    task.status = "pending_permission".to_string();
                    task.pending_permission = Some(app_acp::PendingPermission {
                        request_id: request_id.clone(),
                        tool_name,
                        description,
                        options,
                    });
                    permission_runtime.emit("task_update", task.clone());
                }
            }
            permission_runtime
                .acp
                .permission_resolvers
                .lock()
                .insert(request_id, reply_tx);
        }
    });

    let thread_runtime = runtime.clone();
    let panic_runtime = runtime.clone();
    let panic_task_id = task_id.clone();
    let alive_for_panic = alive.clone();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for ACP");
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async move {
                let result = run_web_acp_connection(
                    thread_runtime.clone(),
                    task_id.clone(),
                    workspace,
                    kiro_bin,
                    auto_approve_for_client,
                    perm_tx,
                    &mut cmd_rx,
                    initial_mode_id,
                    initial_model_id,
                    tight_sandbox,
                    pending_preamble,
                )
                .await;
                alive_clone.store(false, std::sync::atomic::Ordering::SeqCst);
                if let Err(e) = result {
                    thread_runtime.emit(
                        "debug_log",
                        json!({
                            "direction": "in",
                            "category": "error",
                            "type": "connection-error",
                            "taskId": task_id,
                            "summary": e,
                            "payload": { "error": e },
                            "isError": true
                        }),
                    );
                }
            });
        }));
        if result.is_err() {
            alive_for_panic.store(false, std::sync::atomic::Ordering::SeqCst);
            panic_runtime.emit(
                "turn_end",
                json!({ "taskId": panic_task_id, "stopReason": "connection_lost" }),
            );
        }
    });

    Ok(app_acp::ConnectionHandle {
        cmd_tx,
        alive,
        auto_approve: auto_approve_flag,
    })
}

struct WebKirodexClient {
    task_id: String,
    workspace: String,
    runtime: Arc<WebRuntime>,
    auto_approve: Arc<std::sync::atomic::AtomicBool>,
    perm_tx: mpsc::UnboundedSender<(
        String,
        acp_proto::RequestPermissionRequest,
        oneshot::Sender<app_acp::PermissionReply>,
    )>,
    allowed_paths: Arc<Mutex<BTreeSet<String>>>,
    tight_sandbox: bool,
}

#[async_trait::async_trait(?Send)]
impl acp_proto::Client for WebKirodexClient {
    async fn session_notification(&self, args: acp_proto::SessionNotification) -> acp_proto::Result<()> {
        let tid = &self.task_id;
        let val = serde_json::to_value(&args).unwrap_or_default();
        let update = val.get("update").unwrap_or(&val);
        let update_type = update
            .get("sessionUpdate")
            .and_then(Value::as_str)
            .unwrap_or("");
        match update_type {
            "agent_message_chunk" => {
                let text = update
                    .get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !text.is_empty() && !text.starts_with("Agent changed to ") {
                    self.runtime
                        .emit("message_chunk", json!({ "taskId": tid, "chunk": text }));
                }
            }
            "agent_thought_chunk" => {
                let text = update
                    .get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !text.is_empty() {
                    self.runtime
                        .emit("thinking_chunk", json!({ "taskId": tid, "chunk": text }));
                }
            }
            "tool_call" => {
                let mut payload = update.clone();
                crate::commands::diff_stats::annotate_diff_content(&mut payload);
                self.runtime
                    .emit("tool_call", json!({ "taskId": tid, "toolCall": payload }));
            }
            "tool_call_update" => {
                let mut payload = update.clone();
                crate::commands::diff_stats::annotate_diff_content(&mut payload);
                self.runtime
                    .emit("tool_call_update", json!({ "taskId": tid, "toolCall": payload }));
            }
            "plan" => self
                .runtime
                .emit("plan_update", json!({ "taskId": tid, "plan": update.get("entries") })),
            "usage_update" => self.runtime.emit(
                "usage_update",
                json!({
                    "taskId": tid,
                    "used": update.get("used").and_then(Value::as_u64).unwrap_or(0),
                    "size": update.get("size").and_then(Value::as_u64).unwrap_or(0)
                }),
            ),
            _ => {}
        }
        self.runtime.emit(
            "debug_log",
            json!({
                "direction": "in",
                "category": "notification",
                "type": update_type,
                "taskId": tid,
                "summary": update_type,
                "payload": update,
                "isError": false
            }),
        );
        Ok(())
    }

    async fn request_permission(
        &self,
        args: acp_proto::RequestPermissionRequest,
    ) -> acp_proto::Result<acp_proto::RequestPermissionResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();
        let options: Vec<app_acp::PermissionOption> = val
            .get("options")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|o| {
                        Some(app_acp::PermissionOption {
                            option_id: o.get("optionId")?.as_str()?.to_string(),
                            name: o.get("name")?.as_str()?.to_string(),
                            kind: o.get("kind")?.as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        if self.tight_sandbox {
            if let Some(tc) = val.get("toolCall") {
                let tool_paths = app_acp::extract_paths_from_json(tc);
                let allowed = self.allowed_paths.lock();
                for tp in &tool_paths {
                    if !app_acp::is_within_workspace(&self.workspace, tp)
                        && !app_acp::is_path_strictly_allowed(&allowed, tp)
                    {
                        return Ok(acp_proto::RequestPermissionResponse::new(
                            acp_proto::RequestPermissionOutcome::Cancelled,
                        ));
                    }
                }
            }
        }

        if self.auto_approve.load(std::sync::atomic::Ordering::SeqCst) {
            let allow_opt = options
                .iter()
                .find(|o| o.kind == "allow_once")
                .or_else(|| options.iter().find(|o| o.kind == "allow_always"))
                .or_else(|| options.first());
            if let Some(opt) = allow_opt {
                return Ok(acp_proto::RequestPermissionResponse::new(
                    acp_proto::RequestPermissionOutcome::Selected(
                        acp_proto::SelectedPermissionOutcome::new(opt.option_id.clone()),
                    ),
                ));
            }
        }

        let (reply_tx, reply_rx) = oneshot::channel();
        let request_id = format!(
            "perm-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );
        let _ = self.perm_tx.send((request_id, args, reply_tx));
        match tokio::time::timeout(std::time::Duration::from_secs(300), reply_rx).await {
            Ok(Ok(reply)) => Ok(acp_proto::RequestPermissionResponse::new(
                acp_proto::RequestPermissionOutcome::Selected(
                    acp_proto::SelectedPermissionOutcome::new(reply.option_id),
                ),
            )),
            _ => Ok(acp_proto::RequestPermissionResponse::new(
                acp_proto::RequestPermissionOutcome::Cancelled,
            )),
        }
    }

    async fn ext_notification(&self, args: acp_proto::ExtNotification) -> acp_proto::Result<()> {
        let method = args.method.as_ref();
        let params = serde_json::to_value(&args).unwrap_or_default();
        let method_normalized = method.strip_prefix('_').unwrap_or(method);
        if method_normalized == "kiro.dev/mcp/server_initialized" {
            if let Some(name) = params.get("serverName").and_then(Value::as_str) {
                self.runtime
                    .emit("mcp_update", json!({ "serverName": name, "status": "ready" }));
            }
        }
        if method_normalized == "kiro.dev/mcp/oauth_request" {
            if let Some(name) = params.get("serverName").and_then(Value::as_str) {
                self.runtime.emit(
                    "mcp_update",
                    json!({
                        "serverName": name,
                        "status": "needs-auth",
                        "oauthUrl": params.get("oauthUrl")
                    }),
                );
            }
        }
        if method_normalized == "kiro.dev/commands/available" {
            self.runtime.emit(
                "commands_update",
                json!({
                    "taskId": self.task_id,
                    "commands": params.get("commands").cloned().unwrap_or(Value::Array(vec![])),
                    "mcpServers": params.get("mcpServers").cloned().unwrap_or(Value::Array(vec![]))
                }),
            );
        }
        if method_normalized == "kiro.dev/compaction/status" {
            let status_type = params
                .get("status")
                .and_then(|s| s.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            self.runtime.emit(
                "compaction_status",
                json!({
                    "taskId": self.task_id,
                    "status": status_type,
                    "summary": params.get("summary").cloned().unwrap_or(Value::Null)
                }),
            );
        }
        if method_normalized == "kiro.dev/subagent/list_update" {
            self.runtime.emit(
                "subagent_update",
                json!({
                    "taskId": self.task_id,
                    "subagents": params.get("subagents").cloned().unwrap_or(Value::Array(vec![])),
                    "pendingStages": params.get("pendingStages").cloned().unwrap_or(Value::Array(vec![]))
                }),
            );
        }
        self.runtime.emit(
            "debug_log",
            json!({
                "direction": "in",
                "category": "notification",
                "type": format!("ext:{method}"),
                "taskId": self.task_id,
                "summary": format!("kiro notification: {method}"),
                "payload": params,
                "isError": false
            }),
        );
        Ok(())
    }

    async fn read_text_file(
        &self,
        args: acp_proto::ReadTextFileRequest,
    ) -> acp_proto::Result<acp_proto::ReadTextFileResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();
        let path = val.get("path").and_then(Value::as_str).unwrap_or("");
        if !path.is_empty() && !app_acp::is_within_workspace(&self.workspace, path) {
            let allowed = self.allowed_paths.lock();
            let path_ok = if self.tight_sandbox {
                app_acp::is_path_strictly_allowed(&allowed, path)
            } else {
                app_acp::is_path_allowed(&allowed, path)
            };
            if !path_ok {
                return Err(acp_proto::Error::invalid_params().data(json!({
                    "path": path,
                    "workspace": self.workspace,
                    "reason": "Path is outside the project workspace and was not mentioned by the user"
                })));
            }
        }
        match std::fs::read_to_string(path) {
            Ok(content) => Ok(serde_json::from_value(json!({ "content": content })).unwrap()),
            Err(_) => Ok(serde_json::from_value(json!({ "content": "" })).unwrap()),
        }
    }

    async fn write_text_file(
        &self,
        args: acp_proto::WriteTextFileRequest,
    ) -> acp_proto::Result<acp_proto::WriteTextFileResponse> {
        let val = serde_json::to_value(&args).unwrap_or_default();
        let path = val.get("path").and_then(Value::as_str).unwrap_or("");
        let content = val.get("content").and_then(Value::as_str).unwrap_or("");
        if !path.is_empty() && !app_acp::is_within_workspace(&self.workspace, path) {
            let allowed = self.allowed_paths.lock();
            let path_ok = if self.tight_sandbox {
                app_acp::is_path_strictly_allowed(&allowed, path)
            } else {
                app_acp::is_path_allowed(&allowed, path)
            };
            if !path_ok {
                return Err(acp_proto::Error::invalid_params().data(json!({
                    "path": path,
                    "workspace": self.workspace,
                    "reason": "Path is outside the project workspace and was not mentioned by the user"
                })));
            }
        }
        let _ = std::fs::write(path, content);
        Ok(serde_json::from_value(json!({})).unwrap())
    }

    async fn ext_method(&self, _args: acp_proto::ExtRequest) -> acp_proto::Result<acp_proto::ExtResponse> {
        Err(acp_proto::Error::method_not_found())
    }
}

async fn run_web_acp_connection(
    runtime: Arc<WebRuntime>,
    task_id: String,
    workspace: String,
    kiro_bin: String,
    auto_approve: Arc<std::sync::atomic::AtomicBool>,
    perm_tx: mpsc::UnboundedSender<(
        String,
        acp_proto::RequestPermissionRequest,
        oneshot::Sender<app_acp::PermissionReply>,
    )>,
    cmd_rx: &mut mpsc::UnboundedReceiver<app_acp::AcpCommand>,
    initial_mode_id: Option<String>,
    initial_model_id: Option<String>,
    tight_sandbox: bool,
    mut pending_preamble: Option<String>,
) -> Result<(), String> {
    let mut child = tokio::process::Command::new(&kiro_bin)
        .arg("acp")
        .current_dir(&workspace)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .env(
            "PATH",
            format!(
                "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
                std::env::var("PATH").unwrap_or_default()
            ),
        )
        .spawn()
        .map_err(|e| format!("Failed to spawn kiro-cli: {e}"))?;
    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    let stderr_runtime = runtime.clone();
    let stderr_task = task_id.clone();
    tokio::task::spawn_local(async move {
        use tokio::io::AsyncReadExt;
        let mut stderr = stderr;
        let mut buf = vec![0u8; 4096];
        loop {
            match stderr.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    stderr_runtime.emit(
                        "debug_log",
                        json!({
                            "direction": "in",
                            "category": "stderr",
                            "type": "stderr",
                            "taskId": stderr_task,
                            "summary": &text[..text.len().min(120)],
                            "payload": text,
                            "isError": false
                        }),
                    );
                }
                Err(_) => break,
            }
        }
    });

    let allowed_paths = Arc::new(Mutex::new(BTreeSet::new()));
    let client = WebKirodexClient {
        task_id: task_id.clone(),
        workspace: workspace.clone(),
        runtime: runtime.clone(),
        auto_approve,
        perm_tx,
        allowed_paths: allowed_paths.clone(),
        tight_sandbox,
    };
    let (conn, io_future) = acp_proto::ClientSideConnection::new(
        client,
        stdin.compat_write(),
        stdout.compat(),
        |fut| {
            tokio::task::spawn_local(fut);
        },
    );
    tokio::task::spawn_local(async move {
        if let Err(e) = io_future.await {
            log::error!("[ACP:web] IO error: {e}");
        }
    });
    conn.initialize(
        acp_proto::InitializeRequest::new(acp_proto::ProtocolVersion::V1)
            .client_info(acp_proto::Implementation::new("kirodex", env!("CARGO_PKG_VERSION")).title("Kirodex")),
    )
    .await
    .map_err(|e| format!("Initialize failed: {e}"))?;
    let session = conn
        .new_session(acp_proto::NewSessionRequest::new(PathBuf::from(&workspace)))
        .await
        .map_err(|e| format!("New session failed: {e}"))?;
    let session_id = session.session_id.clone();
    let session_val = serde_json::to_value(&session).unwrap_or_default();
    runtime.emit(
        "session_init",
        json!({
            "taskId": task_id,
            "sessionId": session_id,
            "models": session_val.get("models"),
            "modes": session_val.get("modes"),
            "configOptions": session_val.get("configOptions"),
        }),
    );
    runtime.emit("mcp_connecting", Value::Null);
    if let Some(mode_id) = initial_mode_id {
        let _ = conn
            .set_session_mode(acp_proto::SetSessionModeRequest::new(session_id.clone(), mode_id))
            .await;
    }
    if let Some(model_id) = initial_model_id {
        let _ = conn
            .set_session_model(acp_proto::SetSessionModelRequest::new(session_id.clone(), model_id))
            .await;
    }

    let mut killed = false;
    while let Some(cmd) = cmd_rx.recv().await {
        match cmd {
            app_acp::AcpCommand::Prompt(text, attachments) => {
                let text = pending_preamble.take().map_or(text.clone(), |p| format!("{p}{text}"));
                let external_paths = app_acp::extract_paths_from_message(&text);
                if !external_paths.is_empty() {
                    let mut allowed = allowed_paths.lock();
                    for p in external_paths {
                        allowed.insert(p);
                    }
                }
                let prompt_req = acp_proto::PromptRequest::new(
                    session_id.clone(),
                    app_acp::build_content_blocks(text, &attachments),
                );
                let prompt_fut = conn.prompt(prompt_req);
                tokio::pin!(prompt_fut);
                let mut deferred = Vec::new();
                let prompt_result = loop {
                    tokio::select! {
                        result = &mut prompt_fut => break Some(result),
                        maybe_cmd = cmd_rx.recv() => {
                            match maybe_cmd {
                                Some(app_acp::AcpCommand::Cancel) => {
                                    let _ = conn.cancel(acp_proto::CancelNotification::new(session_id.clone())).await;
                                }
                                Some(app_acp::AcpCommand::Kill) => {
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
                if killed {
                    break;
                }
                match prompt_result {
                    Some(Ok(result)) => {
                        let result_val = serde_json::to_value(&result).unwrap_or_default();
                        let stop_reason = result_val
                            .get("stopReason")
                            .and_then(Value::as_str)
                            .unwrap_or("end_turn")
                            .to_string();
                        runtime.emit("turn_end", json!({ "taskId": task_id, "stopReason": stop_reason }));
                        runtime.emit(
                            "debug_log",
                            json!({
                                "direction": "in",
                                "category": "response",
                                "type": "turn-end",
                                "taskId": task_id,
                                "summary": format!("turn ended: {stop_reason}"),
                                "payload": result_val,
                                "isError": false
                            }),
                        );
                    }
                    Some(Err(e)) => {
                        let err_str = e.to_string();
                        let message = app_acp::friendly_prompt_error(&err_str);
                        runtime.emit("task_error", json!({ "taskId": task_id, "message": message }));
                        runtime.emit(
                            "debug_log",
                            json!({
                                "direction": "in",
                                "category": "error",
                                "type": "prompt-error",
                                "taskId": task_id,
                                "summary": err_str,
                                "payload": { "error": err_str },
                                "isError": true
                            }),
                        );
                    }
                    None => {}
                }
                for deferred_cmd in deferred {
                    match deferred_cmd {
                        app_acp::AcpCommand::SetMode(mode_id) => {
                            let _ = conn
                                .set_session_mode(acp_proto::SetSessionModeRequest::new(session_id.clone(), mode_id))
                                .await;
                        }
                        app_acp::AcpCommand::SetModel(model_id) => {
                            let _ = conn
                                .set_session_model(acp_proto::SetSessionModelRequest::new(session_id.clone(), model_id))
                                .await;
                        }
                        app_acp::AcpCommand::Cancel => {
                            let _ = conn.cancel(acp_proto::CancelNotification::new(session_id.clone())).await;
                        }
                        app_acp::AcpCommand::Kill => killed = true,
                        app_acp::AcpCommand::Prompt(..) => {}
                    }
                }
                if killed {
                    break;
                }
            }
            app_acp::AcpCommand::Cancel => {
                let _ = conn.cancel(acp_proto::CancelNotification::new(session_id.clone())).await;
            }
            app_acp::AcpCommand::SetMode(mode_id) => {
                let _ = conn
                    .set_session_mode(acp_proto::SetSessionModeRequest::new(session_id.clone(), mode_id))
                    .await;
            }
            app_acp::AcpCommand::SetModel(model_id) => {
                let _ = conn
                    .set_session_model(acp_proto::SetSessionModelRequest::new(session_id.clone(), model_id))
                    .await;
            }
            app_acp::AcpCommand::Kill => break,
        }
    }
    let _ = child.kill().await;
    Ok(())
}

async fn web_list_models(runtime: Arc<WebRuntime>, kiro_bin: Option<String>) -> Result<Value, String> {
    let bin = kiro_bin.unwrap_or_else(|| runtime.settings.0.lock().settings.kiro_bin.clone());
    run_minimal_acp_probe(bin, false).await
}

fn web_probe_capabilities(runtime: Arc<WebRuntime>) {
    if runtime
        .acp
        .probe_running
        .swap(true, std::sync::atomic::Ordering::SeqCst)
    {
        return;
    }
    let bin = runtime.settings.0.lock().settings.kiro_bin.clone();
    let rt = runtime.clone();
    tokio::spawn(async move {
        match run_minimal_acp_probe(bin, true).await {
            Ok(session_val) => {
                rt.emit(
                    "session_init",
                    json!({
                        "taskId": "__probe__",
                        "models": session_val.get("models"),
                        "modes": session_val.get("modes"),
                        "configOptions": session_val.get("configOptions"),
                    }),
                );
            }
            Err(e) => {
                rt.emit(
                    "debug_log",
                    json!({
                        "direction": "in",
                        "category": "error",
                        "type": "probe-error",
                        "summary": e,
                        "payload": { "error": e },
                        "isError": true
                    }),
                );
            }
        }
        rt.acp
            .probe_running
            .store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

async fn run_minimal_acp_probe(bin: String, emit_full: bool) -> Result<Value, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for model probe");
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async move {
                let mut child = tokio::process::Command::new(&bin)
                    .arg("acp")
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null())
                    .env(
                        "PATH",
                        format!(
                            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
                            std::env::var("PATH").unwrap_or_default()
                        ),
                    )
                    .spawn()
                    .map_err(|e| format!("Failed to spawn: {e}"))?;
                let stdin = child.stdin.take().ok_or("No stdin")?;
                let stdout = child.stdout.take().ok_or("No stdout")?;
                struct MinimalClient;
                #[async_trait::async_trait(?Send)]
                impl acp_proto::Client for MinimalClient {
                    async fn session_notification(&self, _: acp_proto::SessionNotification) -> acp_proto::Result<()> { Ok(()) }
                    async fn request_permission(&self, _: acp_proto::RequestPermissionRequest) -> acp_proto::Result<acp_proto::RequestPermissionResponse> {
                        Ok(acp_proto::RequestPermissionResponse::new(acp_proto::RequestPermissionOutcome::Cancelled))
                    }
                    async fn ext_notification(&self, _: acp_proto::ExtNotification) -> acp_proto::Result<()> { Ok(()) }
                }
                let (conn, io_future) = acp_proto::ClientSideConnection::new(
                    MinimalClient,
                    stdin.compat_write(),
                    stdout.compat(),
                    |fut| {
                        tokio::task::spawn_local(fut);
                    },
                );
                tokio::task::spawn_local(async { let _ = io_future.await; });
                conn.initialize(
                    acp_proto::InitializeRequest::new(acp_proto::ProtocolVersion::V1)
                        .client_info(acp_proto::Implementation::new("kirodex", env!("CARGO_PKG_VERSION"))),
                )
                .await
                .map_err(|e| format!("Init failed: {e}"))?;
                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
                let session = conn
                    .new_session(acp_proto::NewSessionRequest::new(PathBuf::from(home)))
                    .await
                    .map_err(|e| format!("Session failed: {e}"))?;
                let session_val = serde_json::to_value(&session).unwrap_or_default();
                let _ = child.kill().await;
                if emit_full {
                    Ok(session_val)
                } else {
                    let models = session_val.get("models").cloned().unwrap_or(Value::Null);
                    Ok(json!({
                        "availableModels": models.get("availableModels").cloned().unwrap_or(Value::Array(vec![])),
                        "currentModelId": models.get("currentModelId").cloned().unwrap_or(Value::Null)
                    }))
                }
            })
        }));
        let _ = tx.send(match result {
            Ok(inner) => inner,
            Err(_) => Err("model probe thread panicked".to_string()),
        });
    });
    tokio::task::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|e| format!("model probe timed out or channel closed: {e}"))?
    })
    .await
    .map_err(|e| format!("model probe task panicked: {e}"))?
}
