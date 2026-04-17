use std::collections::BTreeSet;
use std::sync::Arc;

use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

use agent_client_protocol as acp;

use super::sandbox::{
    extract_paths_from_json, extract_paths_from_message, is_path_allowed,
    is_path_strictly_allowed, is_within_workspace,
};
use super::types::{AcpState, PendingPermission, PermissionOption, PermissionReply};
use super::now_millis;

pub(crate) struct KirodexClient {
    pub(crate) task_id: String,
    pub(crate) workspace: String,
    pub(crate) app: tauri::AppHandle,
    pub(crate) auto_approve: Arc<std::sync::atomic::AtomicBool>,
    pub(crate) perm_tx: mpsc::UnboundedSender<(String, acp::RequestPermissionRequest, oneshot::Sender<PermissionReply>)>,
    /// Paths outside the workspace that the user explicitly mentioned in messages.
    /// These are allowed through the sandbox.
    pub(crate) allowed_paths: Arc<parking_lot::Mutex<BTreeSet<String>>>,
    /// When true, use strict path checking (no sibling-directory expansion).
    pub(crate) tight_sandbox: bool,
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
                // Filter out agent-switch system messages — these are not real assistant content
                if !text.is_empty() && !text.starts_with("Agent changed to ") {
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

        // Tight sandbox: inspect tool call for outside paths and auto-deny
        if self.tight_sandbox {
            if let Some(tc) = val.get("toolCall") {
                let tool_paths = extract_paths_from_json(tc);
                let allowed = self.allowed_paths.lock();
                for tp in &tool_paths {
                    if !is_within_workspace(&self.workspace, tp) && !is_path_strictly_allowed(&allowed, tp) {
                        log::warn!("[ACP] tight_sandbox denied permission: '{}' is outside workspace '{}'", tp, self.workspace);
                        return Ok(acp::RequestPermissionResponse::new(
                            acp::RequestPermissionOutcome::Cancelled,
                        ));
                    }
                }
            }
        }

        // Auto-approve logic (matches Electron)
        if self.auto_approve.load(std::sync::atomic::Ordering::SeqCst) {
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
            let allowed = self.allowed_paths.lock();
            let path_ok = if self.tight_sandbox {
                is_path_strictly_allowed(&allowed, path)
            } else {
                is_path_allowed(&allowed, path)
            };
            if !path_ok {
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
            let allowed = self.allowed_paths.lock();
            let path_ok = if self.tight_sandbox {
                is_path_strictly_allowed(&allowed, path)
            } else {
                is_path_allowed(&allowed, path)
            };
            if !path_ok {
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
