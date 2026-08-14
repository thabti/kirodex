mod client;
mod commands;
mod connection;
mod sandbox;
pub mod types;

#[cfg(test)]
mod tests;

// Re-export public API so `crate::commands::acp::*` still resolves
pub use commands::*;
pub use types::*;

// Re-export connection helpers for testing
pub(crate) use connection::{
    build_content_blocks, build_effort_command_request, build_effort_options_request,
    execute_effort_command, fetch_effort_options, parse_effort_command_result,
    parse_effort_options_result, strip_image_tags,
};

// Re-export sandbox functions for crate-internal use
pub(crate) use sandbox::{
    extract_paths_from_json, extract_paths_from_json_inner, extract_paths_from_message,
    friendly_prompt_error, is_path_allowed, is_path_strictly_allowed, is_within_workspace,
};

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

// ── Resumption preamble shared by task_create and task_fork ────────────
//
// Both `task_create` (for stateless thread resumption) and `task_fork` need
// to replay an earlier transcript into a freshly spawned kiro-cli subprocess
// so the model has the conversational context the previous process held.
// Centralizing the preamble construction here keeps the two code paths in
// sync and makes the cap/format easy to test.
//
// Cap: ~60 KB (~15k tokens, conservative across model context windows) and
// 40 messages. We walk newest-first so the most recent context is preserved
// when truncation kicks in, then render in chronological order.

pub(crate) const RESUMPTION_BYTE_BUDGET: usize = 60_000;
pub(crate) const RESUMPTION_MAX_MESSAGES: usize = 40;

/// Build a transcript-replay preamble from `prior_messages`.
///
/// Returns an empty string when there is nothing to replay so callers can
/// concatenate unconditionally. `header` and `intro` let `task_create`
/// (resumption) and `task_fork` use distinct wording while sharing the
/// truncation, ordering, and rendering logic.
pub(crate) fn build_resumption_preamble(
    prior_messages: &[types::TaskMessage],
    header: &str,
    intro: &str,
) -> String {
    if prior_messages.is_empty() {
        return String::new();
    }
    let mut included_from: usize = prior_messages.len();
    let mut running_bytes: usize = 0;
    for (idx, m) in prior_messages.iter().enumerate().rev() {
        if prior_messages.len() - idx > RESUMPTION_MAX_MESSAGES {
            break;
        }
        let msg_bytes = m.content.len() + m.role.len() + 4;
        if running_bytes + msg_bytes > RESUMPTION_BYTE_BUDGET && included_from < prior_messages.len() {
            break;
        }
        running_bytes += msg_bytes;
        included_from = idx;
    }
    let kept = &prior_messages[included_from..];
    let truncated = included_from > 0;

    // Render the transcript body first so we can bail out when no message
    // survives the role/content filter — otherwise the function emits a
    // header with an empty ```transcript``` block, which is wasteful and
    // potentially confusing to the model.
    let mut transcript_body = String::new();
    for m in kept {
        if m.content.trim().is_empty() {
            continue;
        }
        let role = match m.role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            _ => continue,
        };
        transcript_body.push_str(role);
        transcript_body.push_str(": ");
        transcript_body.push_str(m.content.trim());
        transcript_body.push_str("\n\n");
    }
    if transcript_body.is_empty() {
        return String::new();
    }

    let mut buf = String::new();
    buf.push_str("## ");
    buf.push_str(header);
    buf.push_str("\n\n");
    buf.push_str(intro);
    buf.push_str("\n\n");
    if truncated {
        buf.push_str(&format!(
            "_Note: showing the last {} of {} prior messages (older context omitted to fit context window)._\n\n",
            kept.len(),
            prior_messages.len(),
        ));
    }
    buf.push_str("```transcript\n");
    buf.push_str(&transcript_body);
    buf.push_str("```\n\n---\n\n## New message\n\n");
    buf
}

/// Sanitize messages cloned from a parent thread before they're stored on a
/// fork. Tool calls captured mid-stream may have non-terminal statuses
/// (`pending`, `in_progress`) which would render in the fork timeline as if
/// work were ongoing. Normalize them to `cancelled` so the fork starts in a
/// quiescent state without losing the call's title or output for context.
pub(crate) fn sanitize_forked_messages(messages: &mut [types::TaskMessage]) {
    for m in messages.iter_mut() {
        if let Some(calls) = m.tool_calls.as_mut() {
            for c in calls.iter_mut() {
                match c.status.as_str() {
                    "completed" | "failed" | "cancelled" | "rejected" => {}
                    _ => c.status = "cancelled".to_string(),
                }
            }
        }
    }
}
