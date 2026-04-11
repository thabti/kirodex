use std::path::{Path, PathBuf};
use git2::{Repository, StatusOptions};
use ignore::WalkBuilder;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

use super::error::AppError;

#[tauri::command]
pub fn detect_kiro_cli() -> Option<String> {
    let candidates = [
        dirs::home_dir().map(|h| h.join(".local/bin/kiro-cli")),
        Some(PathBuf::from("/usr/local/bin/kiro-cli")),
        dirs::home_dir().map(|h| h.join(".kiro/bin/kiro-cli")),
        Some(PathBuf::from("/opt/homebrew/bin/kiro-cli")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    which::which("kiro-cli")
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Option<String> {
    use base64::Engine;
    let bytes = std::fs::read(path).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|f| f.to_string()));
    });
    rx.await.ok().flatten()
}

#[tauri::command]
pub fn open_in_editor(path: String, editor: String) -> Result<(), AppError> {
    // Finder / file manager: reveal the path
    if editor == "finder" {
        #[cfg(target_os = "macos")]
        std::process::Command::new("open").arg(&path).spawn()
            .map_err(|e| AppError::Other(format!("Failed to open Finder: {e}")))?;
        #[cfg(not(target_os = "macos"))]
        std::process::Command::new("xdg-open").arg(&path).spawn()
            .map_err(|e| AppError::Other(format!("Failed to open file manager: {e}")))?;
        return Ok(());
    }

    // Terminal editors: cd to the path and open the editor
    const TERMINAL_EDITORS: &[&str] = &["vim", "vi", "nvim", "nano", "emacs"];
    if TERMINAL_EDITORS.iter().any(|&e| editor == e) {
        let escaped = path.replace('\\', "\\\\").replace('\'', "'\\''").replace('"', "\\\"");
        #[cfg(target_os = "macos")]
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Terminal\"\n  activate\n  do script \"cd '{escaped}'\"\nend tell"
            ))
            .output()
            .map_err(|e| AppError::Other(format!("Failed to open Terminal: {e}")))?;
        #[cfg(not(target_os = "macos"))]
        std::process::Command::new("xterm")
            .arg("-e").arg("sh").arg("-c")
            .arg(format!("cd '{}' && {}", path.replace('\'', "'\\''"), editor))
            .spawn()
            .map_err(|e| AppError::Other(format!("Failed to open {editor}: {e}")))?;
        return Ok(());
    }

    // GUI editors: try CLI binary first, then macOS `open -a` for .app bundles
    #[cfg(target_os = "macos")]
    {
        const APP_MAP: &[(&str, &str)] = &[
            ("zed", "Zed"), ("cursor", "Cursor"), ("code", "Visual Studio Code"),
            ("kiro", "Kiro"), ("trae", "Trae"),
        ];
        if let Some((_, app_name)) = APP_MAP.iter().find(|(bin, _)| *bin == editor) {
            if which::which(&editor).is_ok() {
                std::process::Command::new(&editor).arg(&path).spawn()
                    .map_err(|e| AppError::Other(format!("Failed to open {editor}: {e}")))?;
            } else {
                std::process::Command::new("open").arg("-a").arg(app_name).arg(&path).spawn()
                    .map_err(|e| AppError::Other(format!("Failed to open {app_name}: {e}")))?;
            }
            return Ok(());
        }
    }

    // Generic fallback
    std::process::Command::new(&editor).arg(&path).spawn()
        .map_err(|e| AppError::Other(format!("Failed to open '{editor}': {e}")))?;
    Ok(())
}

/// Detect which code editors are installed on the system.
/// Checks CLI binaries in PATH and macOS .app bundles.
#[tauri::command]
pub fn detect_editors() -> Vec<String> {
    let mut found = Vec::new();

    // GUI editors: check CLI in PATH first
    for bin in ["cursor", "kiro", "trae", "code", "zed"] {
        if which::which(bin).is_ok() {
            found.push(bin.to_string());
        }
    }

    // macOS: also check for .app bundles (user may not have CLI shim)
    #[cfg(target_os = "macos")]
    {
        const APP_CHECKS: &[(&str, &[&str])] = &[
            ("zed", &["/Applications/Zed.app", "/Applications/Zed Preview.app"]),
            ("cursor", &["/Applications/Cursor.app"]),
            ("code", &["/Applications/Visual Studio Code.app"]),
            ("kiro", &["/Applications/Kiro.app"]),
            ("trae", &["/Applications/Trae.app"]),
        ];
        for (bin, paths) in APP_CHECKS {
            if !found.contains(&bin.to_string()) && paths.iter().any(|p| std::path::Path::new(p).exists()) {
                found.push(bin.to_string());
            }
        }
    }

    // Terminal editors (lower priority — vim opens a terminal, not an app window)
    if which::which("nvim").is_ok() {
        found.push("nvim".to_string());
    } else if which::which("vim").is_ok() {
        found.push("vim".to_string());
    }

    // Finder is always available
    found.push("finder".to_string());

    found
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), AppError> {
    open::that(&url).map_err(|e| AppError::Io(e))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub path: String,
    pub name: String,
    pub dir: String,
    pub is_dir: bool,
    pub ext: String,
    /// Git status: "M" modified, "A" added/new, "D" deleted, "R" renamed, "" clean/untracked
    #[serde(skip_serializing_if = "String::is_empty")]
    pub git_status: String,
    /// Lines added (0 if unchanged or unavailable)
    #[serde(skip_serializing_if = "is_zero")]
    pub lines_added: u32,
    /// Lines deleted (0 if unchanged or unavailable)
    #[serde(skip_serializing_if = "is_zero")]
    pub lines_deleted: u32,
    /// File modification time as Unix epoch seconds (0 if unavailable)
    pub modified_at: i64,
}

fn is_zero(v: &u32) -> bool { *v == 0 }

const MAX_FILES: usize = 25_000;

const IGNORED_DIRS: &[&str] = &[
    ".git", "node_modules", ".next", ".turbo", "dist", "build", "out",
    ".cache", "target", "__pycache__", ".venv", "venv", ".tox",
    ".eggs", "*.egg-info", ".mypy_cache", ".pytest_cache",
    "coverage", ".nyc_output", ".parcel-cache", ".svelte-kit",
    ".nuxt", ".output", ".vercel", ".netlify",
];

fn is_ignored_dir(name: &str) -> bool {
    IGNORED_DIRS.iter().any(|&d| d == name)
}

/// Convert git2 status flags to a short status string
fn git_status_label(status: git2::Status) -> String {
    if status.intersects(git2::Status::INDEX_NEW | git2::Status::WT_NEW) {
        "A".to_string()
    } else if status.intersects(git2::Status::INDEX_MODIFIED | git2::Status::WT_MODIFIED) {
        "M".to_string()
    } else if status.intersects(git2::Status::INDEX_DELETED | git2::Status::WT_DELETED) {
        "D".to_string()
    } else if status.intersects(git2::Status::INDEX_RENAMED | git2::Status::WT_RENAMED) {
        "R".to_string()
    } else {
        String::new()
    }
}

/// Get file modification time as Unix epoch seconds
fn file_mtime(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Per-file line change counts
#[derive(Default, Clone, Copy)]
struct LineDelta {
    added: u32,
    deleted: u32,
}

/// Build a map of path -> (lines_added, lines_deleted) from git2 diffs.
/// Combines staged (index vs HEAD) and unstaged (workdir vs index) changes.
fn collect_line_deltas(repo: &Repository) -> std::collections::HashMap<String, LineDelta> {
    let mut deltas: std::collections::HashMap<String, LineDelta> = std::collections::HashMap::new();

    let head_tree = repo.head().ok()
        .and_then(|r| r.peel_to_tree().ok());

    // Staged changes: HEAD -> index
    if let Ok(diff) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        let _ = diff.foreach(
            &mut |_, _| true,
            None,
            None,
            Some(&mut |delta, _hunk, line| {
                if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                    let entry = deltas.entry(path.to_string()).or_default();
                    match line.origin() {
                        '+' => entry.added += 1,
                        '-' => entry.deleted += 1,
                        _ => {}
                    }
                }
                true
            }),
        );
    }

    // Unstaged changes: index -> workdir
    if let Ok(diff) = repo.diff_index_to_workdir(None, None) {
        let _ = diff.foreach(
            &mut |_, _| true,
            None,
            None,
            Some(&mut |delta, _hunk, line| {
                if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                    let entry = deltas.entry(path.to_string()).or_default();
                    match line.origin() {
                        '+' => entry.added += 1,
                        '-' => entry.deleted += 1,
                        _ => {}
                    }
                }
                true
            }),
        );
    }

    deltas
}

fn list_via_git2(root: &Path) -> Option<Vec<ProjectFile>> {
    let repo = Repository::open(root).ok()?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(true)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut opts)).ok()?;

    // Collect per-file line deltas from diffs
    let line_deltas = collect_line_deltas(&repo);

    // Build a map of path -> git status from the status entries
    let mut status_map: std::collections::HashMap<String, git2::Status> =
        std::collections::HashMap::with_capacity(statuses.len());
    for entry in statuses.iter() {
        if let Some(p) = entry.path() {
            status_map.insert(p.to_string(), entry.status());
        }
    }

    let mut files: Vec<ProjectFile> = Vec::with_capacity(2048);
    let mut seen_dirs: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_files: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Helper closure to add ancestor directories
    let add_ancestors = |rel: &Path, files: &mut Vec<ProjectFile>, seen_dirs: &mut std::collections::HashSet<String>, root: &Path| {
        let mut ancestor = rel.parent();
        while let Some(dir) = ancestor {
            if dir.as_os_str().is_empty() { break; }
            let dir_str = dir.to_string_lossy().replace('\\', "/");
            if !seen_dirs.insert(dir_str.clone()) { break; }
            let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if is_ignored_dir(&dir_name) { break; }
            let parent_dir = dir.parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
            let mtime = file_mtime(&root.join(dir));
            files.push(ProjectFile {
                path: dir_str, name: dir_name, dir: parent_dir,
                is_dir: true, ext: String::new(), git_status: String::new(),
                lines_added: 0, lines_deleted: 0, modified_at: mtime,
            });
            ancestor = dir.parent();
        }
    };

    // First pass: files from status entries (these have git status info)
    for entry in statuses.iter() {
        if files.len() >= MAX_FILES { break; }
        let Some(path_str) = entry.path() else { continue };
        let rel = Path::new(path_str);

        add_ancestors(rel, &mut files, &mut seen_dirs, root);

        let name = rel.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dir = rel.parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        if dir.split('/').any(|part| is_ignored_dir(part)) { continue; }
        let ext = rel.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
        let git_status = git_status_label(entry.status());
        let delta = line_deltas.get(path_str).copied().unwrap_or_default();
        let mtime = file_mtime(&root.join(path_str));

        seen_files.insert(path_str.to_string());
        files.push(ProjectFile {
            path: path_str.to_string(), name, dir, is_dir: false, ext, git_status,
            lines_added: delta.added, lines_deleted: delta.deleted, modified_at: mtime,
        });
    }

    // Second pass: tracked files from the index (fills in clean/unmodified files)
    if let Ok(index) = repo.index() {
        for entry in index.iter() {
            if files.len() >= MAX_FILES { break; }
            let path_str = String::from_utf8_lossy(&entry.path).to_string();
            if seen_files.contains(&path_str) { continue; }
            let rel = Path::new(&path_str);
            let name = rel.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let dir = rel.parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
            if dir.split('/').any(|part| is_ignored_dir(part)) { continue; }
            let ext = rel.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
            let mtime = file_mtime(&root.join(&path_str));

            add_ancestors(rel, &mut files, &mut seen_dirs, root);

            // These are tracked but clean — check status_map just in case
            let git_status = status_map.get(&path_str).map(|s| git_status_label(*s)).unwrap_or_default();
            let delta = line_deltas.get(&path_str).copied().unwrap_or_default();
            seen_files.insert(path_str.clone());
            files.push(ProjectFile {
                path: path_str, name, dir, is_dir: false, ext, git_status,
                lines_added: delta.added, lines_deleted: delta.deleted, modified_at: mtime,
            });
        }
    }

    Some(files)
}

fn list_via_walk(root: &Path, respect_gitignore: bool) -> Vec<ProjectFile> {
    let walker = WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(respect_gitignore)
        .git_global(respect_gitignore)
        .git_exclude(respect_gitignore)
        .filter_entry(|entry| {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                return !is_ignored_dir(&entry.file_name().to_string_lossy());
            }
            true
        })
        .build();

    let mut files: Vec<ProjectFile> = Vec::with_capacity(2048);
    for entry in walker.flatten() {
        if files.len() >= MAX_FILES { break; }
        let Ok(rel) = entry.path().strip_prefix(root) else { continue };
        if rel.as_os_str().is_empty() { continue; }
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let name = rel.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dir = rel.parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let ext = if is_dir { String::new() } else { rel.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default() };
        let mtime = file_mtime(entry.path());
        files.push(ProjectFile {
            path: rel_str, name, dir, is_dir, ext,
            git_status: String::new(), lines_added: 0, lines_deleted: 0, modified_at: mtime,
        });
    }
    files
}

#[tauri::command]
pub fn list_project_files(root: String, respect_gitignore: bool) -> Result<Vec<ProjectFile>, AppError> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(AppError::Other(format!("Not a directory: {}", root)));
    }

    let mut files = if respect_gitignore {
        list_via_git2(root_path).unwrap_or_else(|| list_via_walk(root_path, true))
    } else {
        list_via_walk(root_path, false)
    };

    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.path.cmp(&b.path)));
    Ok(files)
}

// ── Kiro CLI authentication ──────────────────────────────────────

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KiroIdentity {
    pub email: Option<String>,
    #[serde(default)]
    pub account_type: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub start_url: Option<String>,
}

#[tauri::command]
pub fn kiro_whoami(kiro_bin: Option<String>) -> Result<KiroIdentity, AppError> {
    let bin = kiro_bin.unwrap_or_else(|| "kiro-cli".to_string());
    log::info!("[auth] kiro_whoami called with bin: {}", bin);
    let output = std::process::Command::new(&bin)
        .args(["whoami", "--format", "json"])
        .output()
        .map_err(|e| {
            log::error!("[auth] Failed to spawn {}: {}", bin, e);
            AppError::Other(format!("Failed to run {}: {}", bin, e))
        })?;
    log::info!("[auth] whoami exit code: {}", output.status);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!("[auth] whoami failed: {}", stderr.trim());
        return Err(AppError::Other(format!("Not authenticated: {}", stderr.trim())));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    log::info!("[auth] whoami stdout: {}", stdout.trim());
    // kiro-cli whoami --format json outputs JSON on the first line, then extra profile info on subsequent lines
    let json_line = stdout.lines().next().unwrap_or("{}");
    log::info!("[auth] parsing JSON line: {}", json_line);
    let identity: KiroIdentity = serde_json::from_str(json_line)
        .map_err(|e| {
            log::error!("[auth] Failed to parse whoami JSON: {} — raw: {}", e, json_line);
            AppError::Other(format!("Failed to parse whoami output: {}", e))
        })?;
    log::info!("[auth] parsed identity: {:?}", identity);
    Ok(identity)
}

#[tauri::command]
pub fn kiro_logout(kiro_bin: Option<String>) -> Result<(), AppError> {
    let bin = kiro_bin.unwrap_or_else(|| "kiro-cli".to_string());
    let output = std::process::Command::new(&bin)
        .arg("logout")
        .output()
        .map_err(|e| AppError::Other(format!("Failed to run {} logout: {}", bin, e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("Logout failed: {}", stderr.trim())));
    }
    Ok(())
}

#[tauri::command]
pub fn open_terminal_with_command(command: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
                command.replace('\\', "\\\\").replace('"', "\\\"")
            ))
            .spawn()
            .map_err(|e| AppError::Other(format!("Failed to open Terminal: {}", e)))?;
    }
    #[cfg(target_os = "linux")]
    {
        let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
        let mut launched = false;
        for term in terminals {
            let result = if term == "gnome-terminal" {
                std::process::Command::new(term).arg("--").arg("sh").arg("-c").arg(&command).spawn()
            } else {
                std::process::Command::new(term).arg("-e").arg(&command).spawn()
            };
            if result.is_ok() { launched = true; break; }
        }
        if !launched {
            return Err(AppError::Other("No terminal emulator found".to_string()));
        }
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &command])
            .spawn()
            .map_err(|e| AppError::Other(format!("Failed to open terminal: {}", e)))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_status_label_new_file() {
        assert_eq!(git_status_label(git2::Status::INDEX_NEW), "A");
        assert_eq!(git_status_label(git2::Status::WT_NEW), "A");
    }

    #[test]
    fn git_status_label_modified() {
        assert_eq!(git_status_label(git2::Status::INDEX_MODIFIED), "M");
        assert_eq!(git_status_label(git2::Status::WT_MODIFIED), "M");
    }

    #[test]
    fn git_status_label_deleted() {
        assert_eq!(git_status_label(git2::Status::INDEX_DELETED), "D");
        assert_eq!(git_status_label(git2::Status::WT_DELETED), "D");
    }

    #[test]
    fn git_status_label_renamed() {
        assert_eq!(git_status_label(git2::Status::INDEX_RENAMED), "R");
    }

    #[test]
    fn git_status_label_current_is_empty() {
        assert_eq!(git_status_label(git2::Status::CURRENT), "");
    }

    #[test]
    fn is_ignored_dir_matches_known_dirs() {
        assert!(is_ignored_dir("node_modules"));
        assert!(is_ignored_dir(".git"));
        assert!(is_ignored_dir("target"));
        assert!(is_ignored_dir("dist"));
        assert!(is_ignored_dir("__pycache__"));
    }

    #[test]
    fn is_ignored_dir_rejects_normal_dirs() {
        assert!(!is_ignored_dir("src"));
        assert!(!is_ignored_dir("lib"));
        assert!(!is_ignored_dir("components"));
    }
}
