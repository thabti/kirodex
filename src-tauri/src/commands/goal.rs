use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::error::AppError;

// ── Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalConfig {
    pub objective: String,
    pub stop_condition: String,
    pub scope_constraint: String,
    pub max_iterations: u32,
    pub token_budget: u64,
    pub consecutive_failure_threshold: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalState {
    pub config: GoalConfig,
    pub status: String,
    pub iteration: u32,
    pub tokens_used: u64,
    pub messages_used: u32,
    pub consecutive_failures: u32,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub corrections: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalContinueResult {
    pub action: String, // "continue" | "complete" | "budget_limited" | "iteration_cap" | "paused"
    pub prompt: Option<String>,
    pub iteration: u32,
    pub tokens_used: u64,
}

// ── Embedded fallback templates ───────────────────────────────────

const FALLBACK_INITIAL: &str = include_str!("../../.kiro_goal_templates/initial.md");
const FALLBACK_CONTINUATION: &str = include_str!("../../.kiro_goal_templates/continuation.md");
const FALLBACK_BUDGET_LIMIT: &str = include_str!("../../.kiro_goal_templates/budget_limit.md");

// ── Template reading ──────────────────────────────────────────────

fn goal_dir(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".kiro").join("goal")
}

fn read_template(workspace: &str, name: &str) -> String {
    let path = goal_dir(workspace).join(name);
    std::fs::read_to_string(&path).unwrap_or_else(|_| match name {
        "initial.md" => FALLBACK_INITIAL.to_string(),
        "continuation.md" => FALLBACK_CONTINUATION.to_string(),
        "budget_limit.md" => FALLBACK_BUDGET_LIMIT.to_string(),
        _ => String::new(),
    })
}

// ── Template rendering ────────────────────────────────────────────

fn render_template(template: &str, state: &GoalState) -> String {
    let remaining = state.config.token_budget.saturating_sub(state.tokens_used);
    let corrections_text = if state.corrections.is_empty() {
        String::new()
    } else {
        state.corrections.iter().map(|c| format!("- {c}")).collect::<Vec<_>>().join("\n")
    };
    let mut result = template.to_string();
    result = result.replace("{{objective}}", &state.config.objective);
    result = result.replace("{{stop_condition}}", &state.config.stop_condition);
    result = result.replace("{{scope_constraint}}", &state.config.scope_constraint);
    result = result.replace("{{token_budget}}", &state.config.token_budget.to_string());
    result = result.replace("{{max_iterations}}", &state.config.max_iterations.to_string());
    result = result.replace("{{tokens_used}}", &state.tokens_used.to_string());
    result = result.replace("{{remaining_tokens}}", &remaining.to_string());
    result = result.replace("{{iteration}}", &state.iteration.to_string());
    result = result.replace("{{corrections}}", &corrections_text);
    // Handle conditional sections (simple mustache-like)
    result = handle_conditionals(&result, "scope_constraint", !state.config.scope_constraint.is_empty());
    result = handle_conditionals(&result, "corrections", !state.corrections.is_empty());
    result
}

fn handle_conditionals(template: &str, key: &str, present: bool) -> String {
    let open_tag = format!("{{{{#{key}}}}}");
    let close_tag = format!("{{{{/{key}}}}}");
    let neg_open_tag = format!("{{{{^{key}}}}}");
    let mut result = template.to_string();
    if present {
        // Remove the tags but keep content between them
        result = result.replace(&open_tag, "");
        result = result.replace(&close_tag, "");
        // Remove negative sections entirely
        while let Some(start) = result.find(&neg_open_tag) {
            if let Some(end) = result[start..].find(&close_tag) {
                result = format!("{}{}", &result[..start], &result[start + end + close_tag.len()..]);
            } else {
                break;
            }
        }
    } else {
        // Remove positive sections entirely
        while let Some(start) = result.find(&open_tag) {
            if let Some(end) = result[start..].find(&close_tag) {
                result = format!("{}{}", &result[..start], &result[start + end + close_tag.len()..]);
            } else {
                break;
            }
        }
        // Keep negative sections
        result = result.replace(&neg_open_tag, "");
        result = result.replace(&close_tag, "");
    }
    result
}

// ── Sentinel parsing ──────────────────────────────────────────────

pub fn parse_goal_sentinel(text: &str) -> Option<&str> {
    if text.contains("<goal_status>complete</goal_status>") {
        return Some("complete");
    }
    if text.contains("<goal_status>budget_limited</goal_status>") {
        return Some("budget_limited");
    }
    None
}

// ── Correction extraction ─────────────────────────────────────────

pub fn extract_corrections(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("CORRECTION:") {
                Some(trimmed.strip_prefix("CORRECTION:").unwrap_or("").trim().to_string())
            } else {
                None
            }
        })
        .filter(|c| !c.is_empty())
        .collect()
}

// ── State persistence ─────────────────────────────────────────────

fn state_path(workspace: &str, task_id: &str) -> PathBuf {
    goal_dir(workspace).join(format!("state-{task_id}.json"))
}

fn persist_state(workspace: &str, task_id: &str, state: &GoalState) -> Result<(), AppError> {
    let dir = goal_dir(workspace);
    std::fs::create_dir_all(&dir)?;
    let path = state_path(workspace, task_id);
    let json = serde_json::to_string_pretty(state)?;
    std::fs::write(&path, json)?;
    Ok(())
}

fn load_state(workspace: &str, task_id: &str) -> Option<GoalState> {
    let path = state_path(workspace, task_id);
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn remove_state(workspace: &str, task_id: &str) {
    let path = state_path(workspace, task_id);
    let _ = std::fs::remove_file(path);
}

/// Append a progress entry to .kiro/goal/progress.md
fn append_progress(workspace: &str, state: &GoalState, summary: &str) {
    let dir = goal_dir(workspace);
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("progress.md");
    let mut content = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        "# Goal Progress Log\n\n## Corrections\n\n(None yet)\n\n---\n\n".to_string()
    });
    // Update corrections section
    if !state.corrections.is_empty() {
        let corrections_header = "## Corrections\n\n";
        if let Some(pos) = content.find(corrections_header) {
            let after = pos + corrections_header.len();
            // Find the next section (---) to replace the corrections block
            let end = content[after..].find("\n---").map(|p| after + p).unwrap_or(content.len());
            let corrections_text = state.corrections.iter()
                .map(|c| format!("- ❌ {c}"))
                .collect::<Vec<_>>()
                .join("\n");
            content = format!("{}{}\n{}", &content[..after], corrections_text, &content[end..]);
        }
    }
    // Append progress entry
    let entry = format!(
        "\n## Iteration {} — {}\n\n{}\n\n---\n",
        state.iteration,
        &state.started_at[..10], // date only
        summary.lines().take(5).collect::<Vec<_>>().join("\n"),
    );
    content.push_str(&entry);
    let _ = std::fs::write(&path, content);
}

// ── Tauri Commands ────────────────────────────────────────────────

#[tauri::command]
pub fn goal_start(
    workspace: String,
    task_id: String,
    config: GoalConfig,
) -> Result<String, AppError> {
    let state = GoalState {
        config: config.clone(),
        status: "active".to_string(),
        iteration: 0,
        tokens_used: 0,
        messages_used: 0,
        consecutive_failures: 0,
        started_at: chrono_now(),
        completed_at: None,
        corrections: Vec::new(),
    };
    persist_state(&workspace, &task_id, &state)?;
    let template = read_template(&workspace, "initial.md");
    let prompt = render_template(&template, &state);
    Ok(prompt)
}

#[tauri::command]
pub fn goal_continue(
    workspace: String,
    task_id: String,
    last_assistant_message: String,
    tokens_this_turn: u64,
) -> Result<GoalContinueResult, AppError> {
    let mut state = load_state(&workspace, &task_id)
        .ok_or_else(|| AppError::Other(format!("No goal state for task {task_id}")))?;
    if state.status != "active" {
        return Ok(GoalContinueResult {
            action: "paused".to_string(),
            prompt: None,
            iteration: state.iteration,
            tokens_used: state.tokens_used,
        });
    }
    // Update counters
    state.iteration += 1;
    state.tokens_used += tokens_this_turn;
    state.messages_used += 1;
    // Extract corrections from the assistant's response
    let new_corrections = extract_corrections(&last_assistant_message);
    for c in &new_corrections {
        if !state.corrections.contains(c) {
            state.corrections.push(c.clone());
        }
    }
    // Check sentinel
    if let Some(sentinel) = parse_goal_sentinel(&last_assistant_message) {
        state.status = sentinel.to_string();
        state.completed_at = Some(chrono_now());
        append_progress(&workspace, &state, &last_assistant_message);
        persist_state(&workspace, &task_id, &state)?;
        return Ok(GoalContinueResult {
            action: sentinel.to_string(),
            prompt: None,
            iteration: state.iteration,
            tokens_used: state.tokens_used,
        });
    }
    // Check budget
    if state.tokens_used >= state.config.token_budget {
        let template = read_template(&workspace, "budget_limit.md");
        let prompt = render_template(&template, &state);
        state.status = "budget_limited".to_string();
        state.completed_at = Some(chrono_now());
        persist_state(&workspace, &task_id, &state)?;
        return Ok(GoalContinueResult {
            action: "budget_limited".to_string(),
            prompt: Some(prompt),
            iteration: state.iteration,
            tokens_used: state.tokens_used,
        });
    }
    // Check iteration cap
    if state.iteration >= state.config.max_iterations {
        let template = read_template(&workspace, "budget_limit.md");
        let prompt = render_template(&template, &state);
        state.status = "budget_limited".to_string();
        state.completed_at = Some(chrono_now());
        persist_state(&workspace, &task_id, &state)?;
        return Ok(GoalContinueResult {
            action: "iteration_cap".to_string(),
            prompt: Some(prompt),
            iteration: state.iteration,
            tokens_used: state.tokens_used,
        });
    }
    // Continue: render continuation template
    let template = read_template(&workspace, "continuation.md");
    let prompt = render_template(&template, &state);
    append_progress(&workspace, &state, &last_assistant_message);
    persist_state(&workspace, &task_id, &state)?;
    Ok(GoalContinueResult {
        action: "continue".to_string(),
        prompt: Some(prompt),
        iteration: state.iteration,
        tokens_used: state.tokens_used,
    })
}

#[tauri::command]
pub fn goal_status(workspace: String, task_id: String) -> Result<Option<GoalState>, AppError> {
    Ok(load_state(&workspace, &task_id))
}

#[tauri::command]
pub fn goal_pause(workspace: String, task_id: String) -> Result<(), AppError> {
    let mut state = load_state(&workspace, &task_id)
        .ok_or_else(|| AppError::Other(format!("No goal state for task {task_id}")))?;
    if state.status == "active" {
        state.status = "paused".to_string();
        persist_state(&workspace, &task_id, &state)?;
    }
    Ok(())
}

#[tauri::command]
pub fn goal_resume(workspace: String, task_id: String) -> Result<(), AppError> {
    let mut state = load_state(&workspace, &task_id)
        .ok_or_else(|| AppError::Other(format!("No goal state for task {task_id}")))?;
    if state.status == "paused" {
        state.status = "active".to_string();
        persist_state(&workspace, &task_id, &state)?;
    }
    Ok(())
}

#[tauri::command]
pub fn goal_clear(workspace: String, task_id: String) -> Result<(), AppError> {
    remove_state(&workspace, &task_id);
    Ok(())
}

#[tauri::command]
pub fn goal_read_template(workspace: String, template_name: String) -> Result<String, AppError> {
    Ok(read_template(&workspace, &template_name))
}

/// Ensure the .kiro/goal/ directory exists for a project workspace.
/// Creates the directory and writes default templates if they don't exist.
/// Called when a project is opened so users can customize templates.
#[tauri::command]
pub fn goal_ensure_dir(workspace: String) -> Result<(), AppError> {
    let dir = goal_dir(&workspace);
    std::fs::create_dir_all(&dir)?;
    // Write default templates if they don't exist
    let templates: &[(&str, &str)] = &[
        ("initial.md", FALLBACK_INITIAL),
        ("continuation.md", FALLBACK_CONTINUATION),
        ("budget_limit.md", FALLBACK_BUDGET_LIMIT),
    ];
    for (name, content) in templates {
        let path = dir.join(name);
        if !path.exists() {
            std::fs::write(&path, content)?;
        }
    }
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────

fn chrono_now() -> String {
    // Simple UTC timestamp without chrono dependency
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;
    let (y, mo, day) = days_to_ymd(days);
    format!("{y:04}-{mo:02}-{day:02}T{h:02}:{m:02}:{s:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
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

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_goal_sentinel_complete() {
        let text = "I've finished everything.\n<goal_status>complete</goal_status>";
        assert_eq!(parse_goal_sentinel(text), Some("complete"));
    }

    #[test]
    fn parse_goal_sentinel_budget_limited() {
        let text = "Cannot proceed.\n<goal_status>budget_limited</goal_status>";
        assert_eq!(parse_goal_sentinel(text), Some("budget_limited"));
    }

    #[test]
    fn parse_goal_sentinel_none() {
        let text = "Still working on it. Made progress on auth module.";
        assert_eq!(parse_goal_sentinel(text), None);
    }

    #[test]
    fn parse_goal_sentinel_partial_tag_ignored() {
        let text = "The <goal_status> tag is incomplete";
        assert_eq!(parse_goal_sentinel(text), None);
    }

    #[test]
    fn extract_corrections_finds_prefixed_lines() {
        let text = "I fixed the issue.\nCORRECTION: Use `npm run test:unit` not `npm test`\nDone.";
        let corrections = extract_corrections(text);
        assert_eq!(corrections, vec!["Use `npm run test:unit` not `npm test`"]);
    }

    #[test]
    fn extract_corrections_multiple() {
        let text = "CORRECTION: Fix A\nSome text\nCORRECTION: Fix B";
        let corrections = extract_corrections(text);
        assert_eq!(corrections, vec!["Fix A", "Fix B"]);
    }

    #[test]
    fn extract_corrections_empty_line_ignored() {
        let text = "CORRECTION: \nCORRECTION: Valid fix";
        let corrections = extract_corrections(text);
        assert_eq!(corrections, vec!["Valid fix"]);
    }

    #[test]
    fn render_template_substitutes_variables() {
        let template = "Objective: {{objective}}\nBudget: {{token_budget}}";
        let state = GoalState {
            config: GoalConfig {
                objective: "Build auth".to_string(),
                stop_condition: "Tests pass".to_string(),
                scope_constraint: "src/auth/".to_string(),
                max_iterations: 10,
                token_budget: 100000,
                consecutive_failure_threshold: 3,
            },
            status: "active".to_string(),
            iteration: 2,
            tokens_used: 5000,
            messages_used: 2,
            consecutive_failures: 0,
            started_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: None,
            corrections: vec!["Fix A".to_string()],
        };
        let result = render_template(template, &state);
        assert!(result.contains("Build auth"));
        assert!(result.contains("100000"));
    }

    #[test]
    fn handle_conditionals_present() {
        let template = "Before\n{{#scope_constraint}}Scope: yes{{/scope_constraint}}\nAfter";
        let result = handle_conditionals(template, "scope_constraint", true);
        assert!(result.contains("Scope: yes"));
    }

    #[test]
    fn handle_conditionals_absent() {
        let template = "Before\n{{#scope_constraint}}Scope: yes{{/scope_constraint}}\nAfter";
        let result = handle_conditionals(template, "scope_constraint", false);
        assert!(!result.contains("Scope: yes"));
        assert!(result.contains("Before"));
        assert!(result.contains("After"));
    }

    #[test]
    fn chrono_now_produces_valid_timestamp() {
        let ts = chrono_now();
        assert!(ts.contains("T"));
        assert!(ts.ends_with("Z"));
        assert_eq!(ts.len(), 20);
    }

    #[test]
    fn goal_ensure_dir_creates_directory_and_templates() {
        let tmp = std::env::temp_dir().join(format!("kirodex_test_{}", std::process::id()));
        let ws = tmp.to_str().unwrap().to_string();
        // Clean up from any previous run
        let _ = std::fs::remove_dir_all(&tmp);
        let result = goal_ensure_dir(ws.clone());
        assert!(result.is_ok());
        let dir = goal_dir(&ws);
        assert!(dir.exists());
        assert!(dir.join("initial.md").exists());
        assert!(dir.join("continuation.md").exists());
        assert!(dir.join("budget_limit.md").exists());
        // Verify content matches fallback
        let content = std::fs::read_to_string(dir.join("initial.md")).unwrap();
        assert!(content.contains("goal mode"));
        // Clean up
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn goal_ensure_dir_does_not_overwrite_existing_templates() {
        let tmp = std::env::temp_dir().join(format!("kirodex_test_no_overwrite_{}", std::process::id()));
        let ws = tmp.to_str().unwrap().to_string();
        let _ = std::fs::remove_dir_all(&tmp);
        let dir = goal_dir(&ws);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("initial.md"), "custom template").unwrap();
        let result = goal_ensure_dir(ws.clone());
        assert!(result.is_ok());
        let content = std::fs::read_to_string(dir.join("initial.md")).unwrap();
        assert_eq!(content, "custom template");
        // Other templates should still be created
        assert!(dir.join("continuation.md").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
