use std::path::{Path, PathBuf};
use git2::{Repository, StatusOptions};
use ignore::WalkBuilder;
use serde::Serialize;
use tauri::Emitter;
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
    // File manager: reveal the path
    if matches!(editor.as_str(), "finder" | "files" | "explorer") {
        #[cfg(target_os = "macos")]
        std::process::Command::new("open").arg(&path).spawn()
            .map_err(|e| AppError::Other(format!("Failed to open Finder: {e}")))?;
        #[cfg(target_os = "linux")]
        std::process::Command::new("xdg-open").arg(&path).spawn()
            .map_err(|e| AppError::Other(format!("Failed to open file manager: {e}")))?;
        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer").arg(&path).spawn()
            .map_err(|e| AppError::Other(format!("Failed to open Explorer: {e}")))?;
        return Ok(());
    }

    // Terminal editors: cd to the path and open the editor
    const TERMINAL_EDITORS: &[&str] = &["vim", "vi", "nvim", "nano", "emacs"];
    if TERMINAL_EDITORS.iter().any(|&e| editor == e) {
        #[cfg(target_os = "macos")]
        {
            let escaped = path.replace('\\', "\\\\").replace('\'', "'\\''").replace('"', "\\\"");
            std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!(
                    "tell application \"Terminal\"\n  activate\n  do script \"cd '{escaped}'\"\nend tell"
                ))
                .output()
                .map_err(|e| AppError::Other(format!("Failed to open Terminal: {e}")))?;
        }
        #[cfg(not(target_os = "macos"))]
        std::process::Command::new("xterm")
            .arg("-e").arg("sh").arg("-c")
            .arg(format!("cd '{}' && {}", path.replace('\'', "'\\''"), editor))
            .spawn()
            .map_err(|e| AppError::Other(format!("Failed to open {editor}: {e}")))?;
        return Ok(());
    }

    // ── Terminal emulators: open a new window/tab at the workspace ──
    match editor.as_str() {
        "ghostty" => {
            #[cfg(target_os = "macos")]
            std::process::Command::new("open").args(["-a", "Ghostty", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Ghostty: {e}")))?;
            #[cfg(target_os = "linux")]
            std::process::Command::new("ghostty").arg(format!("--working-directory={path}")).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Ghostty: {e}")))?;
            return Ok(());
        }
        "cmux" => {
            #[cfg(target_os = "macos")]
            std::process::Command::new("open").args(["-a", "cmux", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open cmux: {e}")))?;
            #[cfg(not(target_os = "macos"))]
            return Err(AppError::Other("cmux is macOS only".to_string()));
            #[cfg(target_os = "macos")]
            return Ok(());
        }
        "iterm2" => {
            #[cfg(target_os = "macos")]
            std::process::Command::new("open").args(["-a", "iTerm", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open iTerm2: {e}")))?;
            #[cfg(not(target_os = "macos"))]
            return Err(AppError::Other("iTerm2 is macOS only".to_string()));
            #[cfg(target_os = "macos")]
            return Ok(());
        }
        "alacritty" => {
            std::process::Command::new("alacritty").args(["--working-directory", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Alacritty: {e}")))?;
            return Ok(());
        }
        "kitty" => {
            std::process::Command::new("kitty").args(["--directory", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Kitty: {e}")))?;
            return Ok(());
        }
        "wezterm" => {
            std::process::Command::new("wezterm").args(["start", "--cwd", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open WezTerm: {e}")))?;
            return Ok(());
        }
        "hyper" => {
            #[cfg(target_os = "macos")]
            std::process::Command::new("open").args(["-a", "Hyper", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Hyper: {e}")))?;
            #[cfg(not(target_os = "macos"))]
            std::process::Command::new("hyper").arg(&path).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Hyper: {e}")))?;
            return Ok(());
        }
        #[cfg(target_os = "windows")]
        "wt" => {
            std::process::Command::new("wt").args(["-d", &path]).spawn()
                .map_err(|e| AppError::Other(format!("Failed to open Windows Terminal: {e}")))?;
            return Ok(());
        }
        "tmux" => {
            // Create a detached session named after the directory, then attach in default terminal
            let slug = path.split('/').last().unwrap_or("kirodex")
                .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
            let session = format!("kdx-{slug}");
            // Try to create session; if it already exists, that's fine
            let _ = std::process::Command::new("tmux")
                .args(["new-session", "-d", "-s", &session, "-c", &path])
                .output();
            // Attach in the default terminal
            let attach_cmd = format!("tmux attach -t {session}");
            #[cfg(target_os = "macos")]
            {
                let escaped = attach_cmd.replace('"', "\\\"");
                std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(format!(
                        "tell application \"Terminal\"\n  activate\n  do script \"{escaped}\"\nend tell"
                    ))
                    .output()
                    .map_err(|e| AppError::Other(format!("Failed to open tmux: {e}")))?;
            }
            #[cfg(target_os = "linux")]
            {
                // Try common terminals
                let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
                let mut launched = false;
                for term in terminals {
                    let result = if term == "gnome-terminal" {
                        std::process::Command::new(term).arg("--").arg("sh").arg("-c").arg(&attach_cmd).spawn()
                    } else {
                        std::process::Command::new(term).arg("-e").arg(&attach_cmd).spawn()
                    };
                    if result.is_ok() { launched = true; break; }
                }
                if !launched {
                    return Err(AppError::Other("No terminal emulator found for tmux".to_string()));
                }
            }
            return Ok(());
        }
        _ => {}
    }

    // ── GUI editors: try CLI binary first, then macOS `open -a` for .app bundles ──
    #[cfg(target_os = "macos")]
    {
        const APP_MAP: &[(&str, &str)] = &[
            ("zed", "Zed"), ("cursor", "Cursor"), ("code", "Visual Studio Code"),
            ("kiro", "Kiro"), ("trae", "Trae"),
            ("idea", "IntelliJ IDEA"),
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

/// Detect which code editors, terminals, and tools are installed.
/// Tier 1 (fast): CLI binaries in PATH + .app bundle path checks.
/// Returns results in <10ms. Tier 2 (Spotlight) runs separately via detect_editors_background.
#[tauri::command]
pub fn detect_editors() -> Vec<String> {
    let mut found = Vec::new();
    let push_unique = |bin: &str, found: &mut Vec<String>| {
        let s = bin.to_string();
        if !found.contains(&s) {
            found.push(s);
        }
    };

    // ── GUI editors: CLI in PATH ──────────────────────────────────
    for bin in ["cursor", "kiro", "trae", "code", "zed", "idea"] {
        if which::which(bin).is_ok() {
            push_unique(bin, &mut found);
        }
    }

    // ── Terminals & multiplexers: CLI in PATH ─────────────────────
    #[cfg(not(target_os = "windows"))]
    const TERMINAL_BINS: &[&str] = &[
        "ghostty", "cmux", "alacritty", "kitty", "wezterm", "hyper", "tmux",
    ];
    #[cfg(target_os = "windows")]
    const TERMINAL_BINS: &[&str] = &[
        "wt", "alacritty", "wezterm", "hyper",
    ];
    for bin in TERMINAL_BINS {
        if which::which(bin).is_ok() {
            push_unique(bin, &mut found);
        }
    }

    // ── macOS: .app bundle checks (both /Applications and ~/Applications) ──
    #[cfg(target_os = "macos")]
    {
        const APP_CHECKS: &[(&str, &[&str])] = &[
            // Editors
            ("zed", &["Zed.app", "Zed Preview.app"]),
            ("cursor", &["Cursor.app"]),
            ("code", &["Visual Studio Code.app"]),
            ("kiro", &["Kiro.app"]),
            ("trae", &["Trae.app"]),
            ("idea", &["IntelliJ IDEA.app", "IntelliJ IDEA CE.app"]),
            // Terminals
            ("ghostty", &["Ghostty.app"]),
            ("cmux", &["cmux.app"]),
            ("iterm2", &["iTerm.app"]),
            ("alacritty", &["Alacritty.app"]),
            ("kitty", &["kitty.app"]),
            ("wezterm", &["WezTerm.app"]),
            ("hyper", &["Hyper.app"]),
        ];
        let app_dirs: Vec<PathBuf> = {
            let mut dirs = vec![PathBuf::from("/Applications")];
            if let Some(home) = dirs::home_dir() {
                dirs.push(home.join("Applications"));
            }
            dirs
        };
        for (bin, app_names) in APP_CHECKS {
            if found.contains(&bin.to_string()) {
                continue;
            }
            let exists = app_names.iter().any(|name| {
                app_dirs.iter().any(|dir| dir.join(name).exists())
            });
            if exists {
                push_unique(bin, &mut found);
            }
        }
    }

    // ── Terminal editors (lower priority) ─────────────────────────
    if which::which("nvim").is_ok() {
        push_unique("nvim", &mut found);
    } else if which::which("vim").is_ok() {
        push_unique("vim", &mut found);
    }

    // ── File manager (always last) ───────────────────────────────
    #[cfg(target_os = "macos")]
    found.push("finder".to_string());
    #[cfg(target_os = "linux")]
    found.push("files".to_string());
    #[cfg(target_os = "windows")]
    found.push("explorer".to_string());

    found
}

/// Tier 2 background discovery: find apps not caught by Tier 1.
/// macOS: uses Spotlight (mdfind) to find apps installed in non-standard locations.
/// Linux: scans XDG .desktop files.
/// Emits "editors-updated" event with any newly discovered apps.
#[tauri::command]
pub async fn detect_editors_background(app: tauri::AppHandle, known: Vec<String>) {
    let new_apps = discover_apps_slow(&known);
    if !new_apps.is_empty() {
        let _ = app.emit("editors-updated", &new_apps);
    }
}

fn discover_apps_slow(known: &[String]) -> Vec<String> {
    let mut found = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // Spotlight lookup by bundle identifier
        const BUNDLE_IDS: &[(&str, &str)] = &[
            ("cursor", "com.todesktop.230313mzl4w4u92"),
            ("code", "com.microsoft.VSCode"),
            ("zed", "dev.zed.Zed"),
            ("kiro", "com.amazon.kiro"),
            ("idea", "com.jetbrains.intellij"),
            ("ghostty", "com.mitchellh.ghostty"),
            ("cmux", "ai.manaflow.cmux"),
            ("iterm2", "com.googlecode.iterm2"),
            ("alacritty", "org.alacritty"),
            ("kitty", "net.kovidgoyal.kitty"),
            ("wezterm", "com.github.wez.wezterm"),
            ("hyper", "co.zeit.hyper"),
        ];
        for (bin, bundle_id) in BUNDLE_IDS {
            if known.contains(&bin.to_string()) || found.contains(&bin.to_string()) {
                continue;
            }
            if spotlight_app_exists(bundle_id) {
                found.push(bin.to_string());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Scan XDG .desktop files
        const DESKTOP_FILES: &[(&str, &[&str])] = &[
            ("ghostty", &["com.mitchellh.ghostty.desktop", "ghostty.desktop"]),
            ("alacritty", &["Alacritty.desktop", "alacritty.desktop"]),
            ("kitty", &["kitty.desktop"]),
            ("wezterm", &["org.wezfurlong.wezterm.desktop", "wezterm.desktop"]),
            ("hyper", &["hyper.desktop"]),
            ("idea", &["jetbrains-idea.desktop", "jetbrains-idea-ce.desktop"]),
            ("code", &["code.desktop", "visual-studio-code.desktop"]),
            ("cursor", &["cursor.desktop"]),
        ];
        let xdg_dirs = xdg_data_dirs();
        for (bin, desktop_names) in DESKTOP_FILES {
            if known.contains(&bin.to_string()) || found.contains(&bin.to_string()) {
                continue;
            }
            let exists = desktop_names.iter().any(|name| {
                xdg_dirs.iter().any(|dir| dir.join("applications").join(name).exists())
            });
            if exists {
                found.push(bin.to_string());
            }
        }
    }

    found
}

#[cfg(target_os = "macos")]
fn spotlight_app_exists(bundle_id: &str) -> bool {
    // mdfind -count returns just the number of matches — fast and low overhead.
    // Typically completes in <100ms. If Spotlight is unavailable, returns quickly with error.
    let output = std::process::Command::new("mdfind")
        .arg("-count")
        .arg(format!("kMDItemCFBundleIdentifier == '{bundle_id}'"))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output();
    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u32>()
                .unwrap_or(0) > 0
        }
        _ => false,
    }
}

#[cfg(target_os = "linux")]
fn xdg_data_dirs() -> Vec<PathBuf> {
    match std::env::var("XDG_DATA_DIRS") {
        Ok(val) if !val.is_empty() => {
            val.split(':').map(PathBuf::from).collect()
        }
        _ => vec![
            PathBuf::from("/usr/share"),
            PathBuf::from("/usr/local/share"),
        ],
    }
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
/// Combines staged (index vs HEAD) and unstaged (workdir vs index) changes
/// in a single pass through each diff using the line callback.
fn collect_line_deltas(repo: &Repository) -> std::collections::HashMap<String, LineDelta> {
    let mut deltas: std::collections::HashMap<String, LineDelta> = std::collections::HashMap::new();

    let head_tree = repo.head().ok()
        .and_then(|r| r.peel_to_tree().ok());

    // Shared line callback for both staged and unstaged diffs
    let mut line_cb = |delta: git2::DiffDelta, _hunk: Option<git2::DiffHunk>, line: git2::DiffLine| -> bool {
        if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
            let entry = deltas.entry(path.to_string()).or_default();
            match line.origin() {
                '+' => entry.added += 1,
                '-' => entry.deleted += 1,
                _ => {}
            }
        }
        true
    };

    // Staged changes: HEAD -> index
    if let Ok(diff) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        let _ = diff.foreach(&mut |_, _| true, None, None, Some(&mut line_cb));
    }

    // Unstaged changes: index -> workdir
    if let Ok(diff) = repo.diff_index_to_workdir(None, None) {
        let _ = diff.foreach(&mut |_, _| true, None, None, Some(&mut line_cb));
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
    let status_count = statuses.len();
    let mut status_map: std::collections::HashMap<String, git2::Status> =
        std::collections::HashMap::with_capacity(status_count);
    for entry in statuses.iter() {
        if let Some(p) = entry.path() {
            status_map.insert(p.to_string(), entry.status());
        }
    }

    let mut files: Vec<ProjectFile> = Vec::with_capacity(status_count.min(MAX_FILES));
    let mut seen_dirs: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_files: std::collections::HashSet<String> = std::collections::HashSet::with_capacity(status_count);

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
        // Only call file_mtime for changed files — clean files get 0 (saves a syscall per file)
        let is_changed = !git_status.is_empty();
        let mtime = if is_changed { file_mtime(&root.join(path_str)) } else { 0 };

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

            add_ancestors(rel, &mut files, &mut seen_dirs, root);

            // These are tracked but clean — check status_map just in case
            let git_status = status_map.get(&path_str).map(|s| git_status_label(*s)).unwrap_or_default();
            let delta = line_deltas.get(&path_str).copied().unwrap_or_default();
            // Skip mtime for clean index entries (no git status change)
            let mtime = if !git_status.is_empty() { file_mtime(&root.join(&path_str)) } else { 0 };
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

// ── Project icon detection ───────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIconInfo {
    pub icon_type: String,
    pub value: String,
}

/// Search for a favicon file in the given directory, returning the first match.
fn find_favicon_in(dir: &Path) -> Option<PathBuf> {
    // Check favicon.ico first (most common)
    let ico = dir.join("favicon.ico");
    if ico.is_file() { return Some(ico); }
    // Check favicon.png
    let png = dir.join("favicon.png");
    if png.is_file() { return Some(png); }
    // Check any .ico file
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("ico") { return Some(p); }
                }
            }
        }
    }
    None
}

/// Detect the framework/language of a project from marker files.
fn detect_framework(root: &Path) -> Option<&'static str> {
    // Check specific framework config files first (most specific → least)
    let checks: &[(&[&str], &str)] = &[
        (&["next.config.js", "next.config.ts", "next.config.mjs"], "nextjs"),
        (&["svelte.config.js", "svelte.config.ts"], "svelte"),
        (&["angular.json"], "angular"),
        (&["Cargo.toml"], "rust"),
        (&["Gemfile"], "ruby"),
        (&["go.mod"], "go"),
        (&["pyproject.toml", "requirements.txt", "setup.py"], "python"),
        (&["pom.xml", "build.gradle", "build.gradle.kts"], "java"),
        (&["composer.json"], "php"),
        (&["Dockerfile"], "docker"),
    ];
    for (files, id) in checks {
        for file in *files {
            if root.join(file).is_file() { return Some(id); }
        }
    }
    // C/C++ detection: CMakeLists.txt or Makefile
    if root.join("CMakeLists.txt").is_file() { return Some("cpp"); }
    // package.json-based detection
    let pkg_path = root.join("package.json");
    if pkg_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&pkg_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let has_dep = |name: &str| -> bool {
                    json.get("dependencies").and_then(|d| d.get(name)).is_some()
                        || json.get("devDependencies").and_then(|d| d.get(name)).is_some()
                };
                if has_dep("vue") || has_dep("nuxt") { return Some("vue"); }
                if has_dep("react") || has_dep("next") { return Some("react"); }
                if has_dep("svelte") { return Some("svelte"); }
                if has_dep("@angular/core") { return Some("angular"); }
            }
        }
        // tsconfig.json → typescript
        if root.join("tsconfig.json").is_file() { return Some("typescript"); }
        return Some("javascript");
    }
    // Standalone tsconfig without package.json
    if root.join("tsconfig.json").is_file() { return Some("typescript"); }
    None
}

#[tauri::command]
pub fn detect_project_icon(cwd: String) -> Option<ProjectIconInfo> {
    let root = Path::new(&cwd);
    if !root.is_dir() { return None; }
    // 1. Search for favicon files
    let favicon_dirs: Vec<PathBuf> = vec![
        root.to_path_buf(),
        root.join("public"),
        root.join("static"),
        root.join("assets"),
        root.join("src").join("app"),
    ];
    for dir in &favicon_dirs {
        if let Some(path) = find_favicon_in(dir) {
            return Some(ProjectIconInfo {
                icon_type: "favicon".to_string(),
                value: path.to_string_lossy().to_string(),
            });
        }
    }
    // Monorepo: check apps/*/public and packages/*/public
    for subdir in &["apps", "packages"] {
        let parent = root.join(subdir);
        if let Ok(entries) = std::fs::read_dir(&parent) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let pub_dir = entry.path().join("public");
                    if let Some(path) = find_favicon_in(&pub_dir) {
                        return Some(ProjectIconInfo {
                            icon_type: "favicon".to_string(),
                            value: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }
    // 2. Detect framework/language
    detect_framework(root).map(|id| ProjectIconInfo {
        icon_type: "framework".to_string(),
        value: id.to_string(),
    })
}

// ── Small image listing for icon picker ──────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SmallImageInfo {
    pub path: String,
    pub width: usize,
    pub height: usize,
}

const ICON_IMAGE_EXTENSIONS: &[&str] = &[".png", ".ico", ".svg", ".jpg", ".jpeg", ".gif", ".webp"];

fn is_icon_image(name: &str) -> bool {
    let lower = name.to_lowercase();
    ICON_IMAGE_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

fn is_svg(name: &str) -> bool {
    name.to_lowercase().ends_with(".svg")
}

/// List image files in a project that are ≤ max_size pixels in both dimensions.
/// SVG files are always included (vector format, no pixel dimensions).
/// Reads only file headers for dimensions (fast, no full decode).
#[tauri::command]
pub fn list_small_images(cwd: String, max_size: usize) -> Vec<SmallImageInfo> {
    let root = std::path::Path::new(&cwd);
    if !root.is_dir() { return vec![]; }

    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                return !is_ignored_dir(&entry.file_name().to_string_lossy());
            }
            true
        })
        .build();

    let mut results = Vec::new();
    for entry in walker.flatten() {
        if results.len() >= 500 { break; } // cap to avoid scanning huge projects
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if !is_icon_image(&name) { continue; }

        let rel = match path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        // SVG files are vector; include them without dimension checks
        if is_svg(&name) {
            results.push(SmallImageInfo { path: rel, width: 0, height: 0 });
            continue;
        }

        // Read dimensions from file header for raster images
        if let Ok(size) = imagesize::size(path) {
            if max_size == 0 || (size.width <= max_size && size.height <= max_size) {
                results.push(SmallImageInfo {
                    path: rel,
                    width: size.width,
                    height: size.height,
                });
            }
        }
    }
    results
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

    #[test]
    fn detect_framework_rust() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]").unwrap();
        assert_eq!(detect_framework(dir.path()), Some("rust"));
    }

    #[test]
    fn detect_framework_react_from_package_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"dependencies":{"react":"^18"}}"#).unwrap();
        assert_eq!(detect_framework(dir.path()), Some("react"));
    }

    #[test]
    fn detect_framework_nextjs_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("next.config.js"), "module.exports = {}").unwrap();
        assert_eq!(detect_framework(dir.path()), Some("nextjs"));
    }

    #[test]
    fn detect_framework_typescript() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name":"app"}"#).unwrap();
        std::fs::write(dir.path().join("tsconfig.json"), "{}").unwrap();
        assert_eq!(detect_framework(dir.path()), Some("typescript"));
    }

    #[test]
    fn detect_framework_javascript_fallback() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name":"app"}"#).unwrap();
        assert_eq!(detect_framework(dir.path()), Some("javascript"));
    }

    #[test]
    fn detect_framework_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(detect_framework(dir.path()), None);
    }

    #[test]
    fn find_favicon_in_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("favicon.ico"), &[0u8; 4]).unwrap();
        let result = find_favicon_in(dir.path());
        assert!(result.is_some());
        assert!(result.unwrap().ends_with("favicon.ico"));
    }

    #[test]
    fn detect_project_icon_favicon_over_framework() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]").unwrap();
        std::fs::write(dir.path().join("favicon.ico"), &[0u8; 4]).unwrap();
        let result = detect_project_icon(dir.path().to_string_lossy().to_string());
        assert!(result.is_some());
        assert_eq!(result.unwrap().icon_type, "favicon");
    }

    #[test]
    fn detect_project_icon_public_favicon() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("public")).unwrap();
        std::fs::write(dir.path().join("public").join("favicon.ico"), &[0u8; 4]).unwrap();
        let result = detect_project_icon(dir.path().to_string_lossy().to_string());
        assert!(result.is_some());
        assert_eq!(result.unwrap().icon_type, "favicon");
    }

    #[test]
    fn detect_project_icon_framework_fallback() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("go.mod"), "module example").unwrap();
        let result = detect_project_icon(dir.path().to_string_lossy().to_string());
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.icon_type, "framework");
        assert_eq!(info.value, "go");
    }
}
