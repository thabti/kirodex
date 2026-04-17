use std::collections::BTreeSet;

/// Check whether `path` is inside `workspace` after canonicalization.
/// Returns false for paths that escape via `..`, symlinks to outside, or sibling dirs.
pub(crate) fn is_within_workspace(workspace: &str, path: &str) -> bool {
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

/// Produce a user-friendly error message for common prompt/model errors.
pub(crate) fn friendly_prompt_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("accessdeniedexception") || lower.contains("access denied") {
        return format!("{raw}\n\nTip: Your AWS credentials may not have permission to invoke this model. Check that your IAM user/role has `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` permissions, and that the model is enabled in your AWS region.");
    }
    if lower.contains("unauthorizedexception") || lower.contains("unauthorized") || lower.contains("security token") || lower.contains("not authorized") {
        return format!("{raw}\n\nTip: Your AWS credentials appear to be invalid or expired. Try refreshing your credentials (e.g. `aws sso login`) or check your AWS_PROFILE environment variable.");
    }
    if lower.contains("throttlingexception") || lower.contains("throttling") || lower.contains("rate exceeded") || lower.contains("too many requests") {
        return format!("{raw}\n\nTip: You've hit a rate limit. Wait a moment and try again, or close unused sessions to reduce concurrent requests.");
    }
    if lower.contains("validationexception") {
        return format!("{raw}\n\nTip: This often means the prompt is too large or too many concurrent requests are active. Try closing unused sessions or trimming alwaysApply context rules to reduce per-request token usage.");
    }
    if lower.contains("resourcenotfoundexception") || lower.contains("model not found") {
        return format!("{raw}\n\nTip: The selected model may not be available in your AWS region, or you may need to request access to it in the AWS Bedrock console.");
    }
    if lower.contains("modelerrorexception") || lower.contains("model error") || lower.contains("internalservererror") || lower.contains("serviceexception") {
        return format!("{raw}\n\nTip: The model service returned an internal error. This is usually temporary — wait a moment and try again.");
    }
    raw.to_string()
}

/// Extract absolute file paths from user message text.
/// Matches tokens that start with `/` and look like file paths.
pub(crate) fn extract_paths_from_message(text: &str) -> Vec<String> {
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
/// Uses BTreeSet range queries for O(log n) lookups instead of O(n) iteration.
pub(crate) fn is_path_allowed(allowed: &BTreeSet<String>, path: &str) -> bool {
    if allowed.is_empty() || path.is_empty() {
        return false;
    }
    let p = std::path::Path::new(path);
    // Check if path is under any allowed path using range query.
    // The closest allowed prefix must be <= path lexicographically.
    for candidate in allowed.range(..=path.to_string()).rev() {
        let ap = std::path::Path::new(candidate.as_str());
        if p.starts_with(ap) || p == ap {
            return true;
        }
        // Also check parent directory of allowed path (sibling file access)
        if let Some(allowed_parent) = ap.parent() {
            if p.starts_with(allowed_parent) {
                return true;
            }
        }
        // If the candidate is lexicographically too far from path, stop early
        if !path.starts_with(candidate.split('/').next().unwrap_or("")) {
            break;
        }
    }
    // Check if any allowed path is under the requested path (forward scan)
    for candidate in allowed.range(path.to_string()..) {
        let ap = std::path::Path::new(candidate.as_str());
        if let Some(allowed_parent) = ap.parent() {
            if p.starts_with(allowed_parent) {
                return true;
            }
        }
        // Stop scanning once we're past the path's prefix
        if !candidate.starts_with(path) && !candidate.starts_with(&format!("{}/", path.trim_end_matches('/'))) {
            break;
        }
    }
    false
}

/// Strict version of `is_path_allowed` for tight sandbox mode.
/// Only allows exact matches or paths under an allowed directory.
/// Does NOT allow sibling files in the same directory as a mentioned file.
/// Uses BTreeSet range queries for O(log n) lookups instead of O(n) iteration.
pub(crate) fn is_path_strictly_allowed(allowed: &BTreeSet<String>, path: &str) -> bool {
    if allowed.is_empty() || path.is_empty() {
        return false;
    }
    let p = std::path::Path::new(path);
    // The allowed prefix that could contain `path` must be <= path lexicographically.
    for candidate in allowed.range(..=path.to_string()).rev() {
        let ap = std::path::Path::new(candidate.as_str());
        if p == ap || p.starts_with(ap) {
            return true;
        }
        // Once we've gone past any possible prefix, stop
        // A valid prefix must share the same leading path component
        if !path.starts_with(candidate.as_str().split('/').take(2).collect::<Vec<_>>().join("/").as_str()) {
            break;
        }
    }
    false
}

/// Extract absolute file paths from a JSON value (e.g., tool call rawInput / locations).
/// Recursively walks the JSON looking for strings that look like absolute paths.
pub(crate) fn extract_paths_from_json(val: &serde_json::Value) -> Vec<String> {
    let mut paths = Vec::new();
    extract_paths_from_json_inner(val, &mut paths);
    paths.sort();
    paths.dedup();
    paths
}

pub(crate) fn extract_paths_from_json_inner(val: &serde_json::Value, paths: &mut Vec<String>) {
    match val {
        serde_json::Value::String(s) => {
            // Check if the whole string is an absolute path
            let trimmed = s.trim();
            if trimmed.starts_with('/') && trimmed.len() > 1 {
                let segments: Vec<&str> = trimmed.split('/').filter(|seg| !seg.is_empty()).collect();
                if segments.len() >= 2 {
                    paths.push(trimmed.to_string());
                    return;
                }
            }
            // Check for embedded paths in command strings
            for p in extract_paths_from_message(trimmed) {
                paths.push(p);
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                extract_paths_from_json_inner(item, paths);
            }
        }
        serde_json::Value::Object(map) => {
            for v in map.values() {
                extract_paths_from_json_inner(v, paths);
            }
        }
        _ => {}
    }
}
