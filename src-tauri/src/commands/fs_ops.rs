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
    std::process::Command::new(&editor)
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to open editor '{}': {}", editor, e)))?;
    Ok(())
}

/// Detect which code editors are installed on the system.
#[tauri::command]
pub fn detect_editors() -> Vec<String> {
    // (binary, display-order priority)
    let candidates = ["cursor", "code", "zed", "windsurf"];
    candidates.iter()
        .filter(|bin| which::which(bin).is_ok())
        .map(|s| s.to_string())
        .collect()
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
