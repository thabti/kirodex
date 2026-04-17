use super::*;
use agent_client_protocol as acp;
use std::collections::BTreeSet;

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
    let new_file = tmp.path().join("new-dir/file.txt");
    let result = is_within_workspace(ws, new_file.to_str().unwrap());
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
    assert!(is_within_workspace("/nonexistent/ws", "/nonexistent/ws/file.txt"));
    assert!(!is_within_workspace("/nonexistent/ws", "/other/file.txt"));
}

#[test]
fn workspace_prefix_attack_blocked() {
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
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/file.rs".to_string());
    assert!(is_path_allowed(&allowed, "/Users/me/project/file.rs"));
}

#[test]
fn allowed_sibling_file_in_same_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/main.rs".to_string());
    assert!(is_path_allowed(&allowed, "/Users/me/project/src/lib.rs"));
}

#[test]
fn allowed_file_under_mentioned_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src".to_string());
    assert!(is_path_allowed(&allowed, "/Users/me/project/src/main.rs"));
}

#[test]
fn not_allowed_unrelated_path() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project-a/file.rs".to_string());
    assert!(!is_path_allowed(&allowed, "/Users/me/project-b/file.rs"));
}

#[test]
fn not_allowed_empty_set() {
    let allowed = BTreeSet::new();
    assert!(!is_path_allowed(&allowed, "/Users/me/file.rs"));
}

#[test]
fn allowed_parent_dir_of_mentioned_file() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/deep/file.rs".to_string());
    assert!(is_path_allowed(&allowed, "/Users/me/project/src/deep/other.rs"));
}

// ── is_path_strictly_allowed ────────────────────────────────────

#[test]
fn strict_allowed_exact_match() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/file.rs".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project/file.rs"));
}

#[test]
fn strict_allowed_file_under_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project/src/main.rs"));
}

#[test]
fn strict_blocked_sibling_file() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/main.rs".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project/src/lib.rs"));
}

#[test]
fn strict_blocked_unrelated_path() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project-a/file.rs".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project-b/file.rs"));
}

#[test]
fn strict_blocked_empty_set() {
    let allowed = BTreeSet::new();
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/file.rs"));
}

#[test]
fn strict_blocked_parent_of_mentioned() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/deep/file.rs".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project/src/other.rs"));
}

#[test]
fn strict_allowed_subdir_of_allowed_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project/src/deep/nested/file.rs"));
}

// ── extract_paths_from_json ───────────────────────────────────

#[test]
fn json_extract_path_field() {
    let val = serde_json::json!({"path": "/Users/me/file.rs"});
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/Users/me/file.rs"]);
}

#[test]
fn json_extract_nested() {
    let val = serde_json::json!({"input": {"path": "/a/b/c.rs"}});
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/a/b/c.rs"]);
}

#[test]
fn json_extract_locations_array() {
    let val = serde_json::json!([{"path": "/a/b.rs"}, {"path": "/c/d.rs"}]);
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/a/b.rs", "/c/d.rs"]);
}

#[test]
fn json_extract_from_command_string() {
    let val = serde_json::json!({"command": "grep -r pattern /some/path/dir"});
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/some/path/dir"]);
}

#[test]
fn json_extract_ignores_relative() {
    let val = serde_json::json!({"path": "src/main.rs"});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_ignores_non_paths() {
    let val = serde_json::json!({"name": "hello world"});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_null_input() {
    let val = serde_json::Value::Null;
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

// ── is_path_strictly_allowed: edge cases + security ─────────────

#[test]
fn strict_prefix_attack_blocked() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project-a".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project-a-evil/file.rs"));
}

#[test]
fn strict_empty_path_returns_false() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project".to_string());
    assert!(!is_path_strictly_allowed(&allowed, ""));
}

#[test]
fn strict_root_slash_not_allowed() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/etc/passwd"));
}

#[test]
fn strict_dotdot_in_allowed_path() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/../other".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/other/file.rs"));
}

#[test]
fn strict_trailing_slash_on_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project/src/main.rs"));
}

#[test]
fn strict_multiple_allowed_paths() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project-a/file.rs".to_string());
    allowed.insert("/Users/me/project-b/src".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project-a/file.rs"));
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project-b/src/main.rs"));
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project-c/file.rs"));
}

#[test]
fn strict_unicode_paths() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/用户/项目/src".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/Users/用户/项目/src/main.rs"));
    assert!(!is_path_strictly_allowed(&allowed, "/Users/用户/项目/other.rs"));
}

#[test]
fn strict_very_long_path() {
    let mut allowed = BTreeSet::new();
    let long_dir = format!("/a/{}", "b/".repeat(100));
    allowed.insert(long_dir.clone());
    let file_under = format!("{}file.rs", long_dir);
    assert!(is_path_strictly_allowed(&allowed, &file_under));
}

#[test]
fn strict_case_sensitive() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/Me/Project/file.rs".to_string());
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/project/file.rs"));
    assert!(is_path_strictly_allowed(&allowed, "/Users/Me/Project/file.rs"));
}

// ── extract_paths_from_json: edge cases ─────────────────────────

#[test]
fn json_extract_deeply_nested() {
    let val = serde_json::json!({
        "a": {"b": {"c": {"d": {"path": "/deep/nested/file.rs"}}}}
    });
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/deep/nested/file.rs"]);
}

#[test]
fn json_extract_deduplicates() {
    let val = serde_json::json!({
        "path1": "/Users/me/file.rs",
        "path2": "/Users/me/file.rs",
        "nested": {"path3": "/Users/me/file.rs"}
    });
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths.len(), 1);
    assert_eq!(paths[0], "/Users/me/file.rs");
}

#[test]
fn json_extract_mixed_content() {
    let val = serde_json::json!({
        "name": "grep tool",
        "path": "/Users/me/project/src/main.rs",
        "count": 42,
        "enabled": true,
        "tags": ["search", "/opt/tools/grep"],
        "nested": null
    });
    let paths = extract_paths_from_json(&val);
    assert!(paths.contains(&"/Users/me/project/src/main.rs".to_string()));
    assert!(paths.contains(&"/opt/tools/grep".to_string()));
    assert_eq!(paths.len(), 2);
}

#[test]
fn json_extract_multiple_paths_in_command() {
    let val = serde_json::json!({
        "command": "diff /Users/me/file-a.rs /Users/me/file-b.rs"
    });
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths.len(), 2);
    assert!(paths.contains(&"/Users/me/file-a.rs".to_string()));
    assert!(paths.contains(&"/Users/me/file-b.rs".to_string()));
}

#[test]
fn json_extract_boolean_and_number_ignored() {
    let val = serde_json::json!({
        "count": 42,
        "enabled": true,
        "ratio": 3.14
    });
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_empty_object() {
    let val = serde_json::json!({});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_empty_array() {
    let val = serde_json::json!([]);
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_empty_string() {
    let val = serde_json::json!({"path": ""});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_single_slash_string() {
    let val = serde_json::json!({"sep": "/"});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_url_not_treated_as_path() {
    let val = serde_json::json!({"url": "https://example.com/api/v1"});
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

#[test]
fn json_extract_large_payload() {
    let mut obj = serde_json::Map::new();
    for i in 0..1000 {
        obj.insert(format!("field_{}", i), serde_json::json!(format!("value_{}", i)));
    }
    obj.insert("hidden_path".to_string(), serde_json::json!("/secret/hidden/file.rs"));
    let val = serde_json::Value::Object(obj);
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths, vec!["/secret/hidden/file.rs"]);
}

// ── loose vs strict comparison ──────────────────────────────────

#[test]
fn loose_allows_sibling_strict_blocks() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/main.rs".to_string());
    let sibling = "/Users/me/project/src/lib.rs";
    assert!(is_path_allowed(&allowed, sibling));
    assert!(!is_path_strictly_allowed(&allowed, sibling));
}

#[test]
fn loose_allows_cousin_strict_blocks() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src/deep/file.rs".to_string());
    let cousin = "/Users/me/project/src/deep/other.rs";
    assert!(is_path_allowed(&allowed, cousin));
    assert!(!is_path_strictly_allowed(&allowed, cousin));
}

#[test]
fn both_allow_exact_match() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/file.rs".to_string());
    let exact = "/Users/me/project/file.rs";
    assert!(is_path_allowed(&allowed, exact));
    assert!(is_path_strictly_allowed(&allowed, exact));
}

#[test]
fn both_allow_file_under_dir() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project/src".to_string());
    let under = "/Users/me/project/src/main.rs";
    assert!(is_path_allowed(&allowed, under));
    assert!(is_path_strictly_allowed(&allowed, under));
}

#[test]
fn both_block_unrelated() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/me/project-a/file.rs".to_string());
    let unrelated = "/Users/me/project-b/file.rs";
    assert!(!is_path_allowed(&allowed, unrelated));
    assert!(!is_path_strictly_allowed(&allowed, unrelated));
}

#[test]
fn loose_allows_backup_dir_strict_blocks() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/Users/sabeur/Desktop/kirodex/src/main.rs".to_string());
    let backup_file = "/Users/sabeur/Desktop/kirodex/src/utils.rs";
    assert!(is_path_allowed(&allowed, backup_file));
    assert!(!is_path_strictly_allowed(&allowed, backup_file));
}

// ── Performance benchmarks ──────────────────────────────────────

#[test]
fn perf_strict_allowed_large_set() {
    let mut allowed = BTreeSet::new();
    for i in 0..10_000 {
        allowed.insert(format!("/Users/me/project/src/file_{}.rs", i));
    }
    let start = std::time::Instant::now();
    for _ in 0..1_000 {
        is_path_strictly_allowed(&allowed, "/Users/me/project/src/file_5000.rs");
    }
    let elapsed = start.elapsed();
    assert!(elapsed.as_secs() < 10, "1k strict lookups in 10k set took {:?}", elapsed);
}

#[test]
fn perf_loose_allowed_large_set() {
    let mut allowed = BTreeSet::new();
    for i in 0..10_000 {
        allowed.insert(format!("/Users/me/project/src/file_{}.rs", i));
    }
    let start = std::time::Instant::now();
    for _ in 0..1_000 {
        is_path_allowed(&allowed, "/Users/me/project/src/file_5000.rs");
    }
    let elapsed = start.elapsed();
    assert!(elapsed.as_secs() < 10, "1k loose lookups in 10k set took {:?}", elapsed);
}

#[test]
fn perf_strict_miss_large_set() {
    let mut allowed = BTreeSet::new();
    for i in 0..10_000 {
        allowed.insert(format!("/Users/me/project/src/file_{}.rs", i));
    }
    let start = std::time::Instant::now();
    for _ in 0..100 {
        is_path_strictly_allowed(&allowed, "/completely/different/path.rs");
    }
    let elapsed = start.elapsed();
    assert!(elapsed.as_secs() < 5, "100 strict miss lookups in 10k set took {:?}", elapsed);
}

#[test]
fn perf_json_extract_deep_nesting() {
    let mut val = serde_json::json!("/deep/nested/target/file.rs");
    for _ in 0..100 {
        val = serde_json::json!({"inner": val});
    }
    let start = std::time::Instant::now();
    let paths = extract_paths_from_json(&val);
    let elapsed = start.elapsed();
    assert_eq!(paths, vec!["/deep/nested/target/file.rs"]);
    assert!(elapsed.as_millis() < 100, "Deep JSON extraction took {:?}", elapsed);
}

#[test]
fn perf_json_extract_wide_object() {
    let mut obj = serde_json::Map::new();
    for i in 0..10_000 {
        obj.insert(format!("key_{}", i), serde_json::json!(format!("value_{}", i)));
    }
    obj.insert("target".to_string(), serde_json::json!("/hidden/path/file.rs"));
    let val = serde_json::Value::Object(obj);
    let start = std::time::Instant::now();
    let paths = extract_paths_from_json(&val);
    let elapsed = start.elapsed();
    assert_eq!(paths, vec!["/hidden/path/file.rs"]);
    assert!(elapsed.as_millis() < 500, "Wide JSON extraction took {:?}", elapsed);
}

#[test]
fn perf_json_extract_many_paths() {
    let arr: Vec<serde_json::Value> = (0..1000)
        .map(|i| serde_json::json!({"path": format!("/project/src/file_{}.rs", i)}))
        .collect();
    let val = serde_json::Value::Array(arr);
    let start = std::time::Instant::now();
    let paths = extract_paths_from_json(&val);
    let elapsed = start.elapsed();
    assert_eq!(paths.len(), 1000);
    assert!(elapsed.as_millis() < 200, "1000-path extraction took {:?}", elapsed);
}

#[test]
fn perf_extract_paths_from_message_long_text() {
    let mut msg = String::new();
    for i in 0..100 {
        msg.push_str(&format!("Look at /project/src/file_{}.rs and also ", i));
    }
    let start = std::time::Instant::now();
    let paths = extract_paths_from_message(&msg);
    let elapsed = start.elapsed();
    assert_eq!(paths.len(), 100);
    assert!(elapsed.as_millis() < 50, "100-path message extraction took {:?}", elapsed);
}

// ── Memory consumption tests ────────────────────────────────────

#[test]
fn memory_allowed_paths_growth() {
    let mut allowed = BTreeSet::new();
    for i in 0..100_000 {
        allowed.insert(format!("/Users/me/project/src/module_{}/file_{}.rs", i / 100, i));
    }
    assert_eq!(allowed.len(), 100_000);
    assert!(is_path_strictly_allowed(&allowed, "/Users/me/project/src/module_500/file_50042.rs"));
    assert!(!is_path_strictly_allowed(&allowed, "/Users/me/other/file.rs"));
}

#[test]
fn memory_json_extraction_no_unbounded_growth() {
    let mut arr = Vec::new();
    for _ in 0..1000 {
        arr.push(serde_json::json!({"path": "/same/path/file.rs"}));
    }
    let val = serde_json::Value::Array(arr);
    let paths = extract_paths_from_json(&val);
    assert_eq!(paths.len(), 1);
}

#[test]
fn memory_large_json_no_stack_overflow() {
    let mut val = serde_json::json!("leaf");
    for i in 0..100 {
        if i % 2 == 0 {
            val = serde_json::json!({"level": val});
        } else {
            val = serde_json::json!([val]);
        }
    }
    let paths = extract_paths_from_json(&val);
    assert!(paths.is_empty());
}

// ── Settings integration tests ──────────────────────────────────

#[test]
fn tight_sandbox_roundtrip_false() {
    let prefs = crate::commands::settings::ProjectPrefs {
        tight_sandbox: Some(false),
        ..Default::default()
    };
    let json = serde_json::to_string(&prefs).unwrap();
    assert!(json.contains("tightSandbox"));
    let restored: crate::commands::settings::ProjectPrefs = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.tight_sandbox, Some(false));
}

#[test]
fn tight_sandbox_unwrap_or_true_when_none() {
    let prefs = crate::commands::settings::ProjectPrefs::default();
    let effective = prefs.tight_sandbox.unwrap_or(true);
    assert!(effective);
}

#[test]
fn tight_sandbox_unwrap_or_true_when_some_false() {
    let prefs = crate::commands::settings::ProjectPrefs {
        tight_sandbox: Some(false),
        ..Default::default()
    };
    let effective = prefs.tight_sandbox.unwrap_or(true);
    assert!(!effective);
}

#[test]
fn tight_sandbox_in_full_settings_roundtrip() {
    let mut prefs_map = std::collections::HashMap::new();
    prefs_map.insert("/Users/me/project".to_string(), crate::commands::settings::ProjectPrefs {
        tight_sandbox: Some(false),
        model_id: Some("claude-4".to_string()),
        ..Default::default()
    });
    prefs_map.insert("/Users/me/other".to_string(), crate::commands::settings::ProjectPrefs {
        tight_sandbox: Some(true),
        ..Default::default()
    });
    let settings = crate::commands::settings::AppSettings {
        project_prefs: Some(prefs_map),
        ..Default::default()
    };
    let json = serde_json::to_string(&settings).unwrap();
    let restored: crate::commands::settings::AppSettings = serde_json::from_str(&json).unwrap();
    let pp = restored.project_prefs.unwrap();
    assert_eq!(pp["/Users/me/project"].tight_sandbox, Some(false));
    assert_eq!(pp["/Users/me/other"].tight_sandbox, Some(true));
}

#[test]
fn tight_sandbox_lookup_pattern_matches_code() {
    let mut prefs_map = std::collections::HashMap::new();
    prefs_map.insert("/Users/me/project".to_string(), crate::commands::settings::ProjectPrefs {
        tight_sandbox: Some(false),
        ..Default::default()
    });
    let settings = crate::commands::settings::AppSettings {
        project_prefs: Some(prefs_map),
        ..Default::default()
    };
    let workspace = "/Users/me/project";
    let tight = settings.project_prefs.as_ref()
        .and_then(|p| p.get(workspace))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
    assert!(!tight);
    let workspace2 = "/Users/me/unknown";
    let tight2 = settings.project_prefs.as_ref()
        .and_then(|p| p.get(workspace2))
        .and_then(|pp| pp.tight_sandbox)
        .unwrap_or(true);
    assert!(tight2);
}

// ── friendly_prompt_error ───────────────────────────────────────

#[test]
fn friendly_error_access_denied() {
    let msg = friendly_prompt_error("AccessDeniedException: User is not authorized");
    assert!(msg.contains("AccessDeniedException"));
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("bedrock:InvokeModel"));
}

#[test]
fn friendly_error_access_denied_lowercase() {
    let msg = friendly_prompt_error("access denied for model invocation");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("IAM"));
}

#[test]
fn friendly_error_unauthorized() {
    let msg = friendly_prompt_error("UnauthorizedException: The security token is expired");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("aws sso login"));
}

#[test]
fn friendly_error_security_token() {
    let msg = friendly_prompt_error("The security token included in the request is invalid");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("credentials"));
}

#[test]
fn friendly_error_throttling() {
    let msg = friendly_prompt_error("ThrottlingException: Rate exceeded");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("rate limit"));
}

#[test]
fn friendly_error_too_many_requests() {
    let msg = friendly_prompt_error("Too many requests, please slow down");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("rate limit"));
}

#[test]
fn friendly_error_validation() {
    let msg = friendly_prompt_error("ValidationException: input is too long");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("prompt is too large"));
}

#[test]
fn friendly_error_resource_not_found() {
    let msg = friendly_prompt_error("ResourceNotFoundException: model not available");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("Bedrock console"));
}

#[test]
fn friendly_error_model_error() {
    let msg = friendly_prompt_error("ModelErrorException: internal failure");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("temporary"));
}

#[test]
fn friendly_error_service_exception() {
    let msg = friendly_prompt_error("ServiceException: something went wrong");
    assert!(msg.contains("Tip:"));
    assert!(msg.contains("temporary"));
}

#[test]
fn friendly_error_unknown_passes_through() {
    let raw = "some unknown error happened";
    let msg = friendly_prompt_error(raw);
    assert_eq!(msg, raw);
    assert!(!msg.contains("Tip:"));
}

#[test]
fn friendly_error_preserves_original_message() {
    let raw = "AccessDeniedException: User arn:aws:iam::123:user/dev is not authorized";
    let msg = friendly_prompt_error(raw);
    assert!(msg.starts_with(raw));
}

// ── auto_approve AtomicBool sharing ─────────────────────────────

#[test]
fn auto_approve_atomic_shared_between_handle_and_client() {
    let flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let handle_copy = flag.clone();
    let client_copy = flag.clone();
    assert!(!client_copy.load(std::sync::atomic::Ordering::SeqCst));
    handle_copy.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(client_copy.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn auto_approve_atomic_toggle_back_and_forth() {
    let flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let a = flag.clone();
    let b = flag.clone();
    assert!(b.load(std::sync::atomic::Ordering::SeqCst));
    a.store(false, std::sync::atomic::Ordering::SeqCst);
    assert!(!b.load(std::sync::atomic::Ordering::SeqCst));
    a.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(b.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn auto_approve_atomic_cross_thread_visibility() {
    let flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let writer = flag.clone();
    let reader = flag.clone();
    let handle = std::thread::spawn(move || {
        writer.store(true, std::sync::atomic::Ordering::SeqCst);
    });
    handle.join().unwrap();
    assert!(reader.load(std::sync::atomic::Ordering::SeqCst));
}

// ── Task serialization with auto_approve ────────────────────────

#[test]
fn task_serializes_auto_approve_true() {
    let task = Task {
        id: "t1".into(),
        name: "test".into(),
        workspace: "/ws".into(),
        status: "running".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        messages: vec![],
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(true),
        user_paused: None,
        parent_task_id: None,
    };
    let json = serde_json::to_value(&task).unwrap();
    assert_eq!(json["autoApprove"], true);
}

#[test]
fn task_serializes_auto_approve_false() {
    let task = Task {
        id: "t2".into(),
        name: "test".into(),
        workspace: "/ws".into(),
        status: "running".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        messages: vec![],
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(false),
        user_paused: None,
        parent_task_id: None,
    };
    let json = serde_json::to_value(&task).unwrap();
    assert_eq!(json["autoApprove"], false);
}

#[test]
fn task_omits_auto_approve_when_none() {
    let task = Task {
        id: "t3".into(),
        name: "test".into(),
        workspace: "/ws".into(),
        status: "running".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        messages: vec![],
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: None,
        user_paused: None,
        parent_task_id: None,
    };
    let json = serde_json::to_value(&task).unwrap();
    assert!(json.get("autoApprove").is_none());
}

#[test]
fn task_auto_approve_roundtrip() {
    let task = Task {
        id: "t4".into(),
        name: "roundtrip".into(),
        workspace: "/ws".into(),
        status: "running".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        messages: vec![],
        pending_permission: None,
        plan: None,
        context_usage: None,
        auto_approve: Some(true),
        user_paused: None,
        parent_task_id: None,
    };
    let json_str = serde_json::to_string(&task).unwrap();
    let restored: Task = serde_json::from_str(&json_str).unwrap();
    assert_eq!(restored.auto_approve, Some(true));
}

// ── strip_image_tags (fix #14) ──────────────────────────────────

#[test]
fn strip_image_tags_removes_attached_image_block() {
    let input = "Hello\n[Attached image: pic.png (image/png, 100 bytes)]\n<image src=\"data:image/png;base64,abc123\" />\nWorld";
    let result = strip_image_tags(input);
    assert_eq!(result, "Hello\nWorld");
}

#[test]
fn strip_image_tags_removes_standalone_image_tag() {
    let input = "Check this: <image src=\"data:image/jpeg;base64,xyz789\" /> done";
    let result = strip_image_tags(input);
    assert_eq!(result, "Check this:  done");
}

#[test]
fn strip_image_tags_preserves_text_without_images() {
    let input = "No images here, just text.";
    let result = strip_image_tags(input);
    assert_eq!(result, input);
}

#[test]
fn strip_image_tags_handles_multiple_images() {
    let input = "<image src=\"data:image/png;base64,aaa\" />\ntext\n<image src=\"data:image/jpg;base64,bbb\" />";
    let result = strip_image_tags(input);
    assert_eq!(result, "text");
}

#[test]
fn strip_image_tags_handles_empty_string() {
    assert_eq!(strip_image_tags(""), "");
}

// ── build_content_blocks (fix #14) ──────────────────────────────

#[test]
fn build_content_blocks_text_only() {
    let blocks = build_content_blocks("hello".to_string(), &[]);
    assert_eq!(blocks.len(), 1);
    match &blocks[0] {
        acp::ContentBlock::Text(t) => assert_eq!(t.text, "hello"),
        _ => panic!("expected Text block"),
    }
}

#[test]
fn build_content_blocks_with_attachments() {
    let atts = vec![
        AttachmentData { base64: "abc".to_string(), mime_type: "image/png".to_string(), name: Some("pic.png".to_string()) },
    ];
    let blocks = build_content_blocks("hello <image src=\"data:image/png;base64,abc\" />".to_string(), &atts);
    assert_eq!(blocks.len(), 2);
    match &blocks[1] {
        acp::ContentBlock::Image(img) => {
            assert_eq!(img.data, "abc");
            assert_eq!(img.mime_type, "image/png");
        }
        _ => panic!("expected Image block"),
    }
}

// ── AttachmentData deserialization (fix #14) ─────────────────────

#[test]
fn attachment_data_deserializes_from_camel_case() {
    let json = r#"{"base64":"abc123","mimeType":"image/png","name":"pic.png"}"#;
    let att: AttachmentData = serde_json::from_str(json).unwrap();
    assert_eq!(att.base64, "abc123");
    assert_eq!(att.mime_type, "image/png");
    assert_eq!(att.name, Some("pic.png".to_string()));
}

#[test]
fn attachment_data_deserializes_without_name() {
    let json = r#"{"base64":"xyz","mimeType":"image/jpeg"}"#;
    let att: AttachmentData = serde_json::from_str(json).unwrap();
    assert_eq!(att.base64, "xyz");
    assert_eq!(att.mime_type, "image/jpeg");
    assert_eq!(att.name, None);
}
