use git2::{BranchType, Cred, DiffOptions, RemoteCallbacks, Repository};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use super::acp::AcpState;
use super::error::AppError;
use super::settings::SettingsState;

/// Build `git2` remote callbacks with full credential support.
///
/// Handles all common transport types:
/// - **SSH** (`git@`, `ssh://`): tries the SSH agent first, then falls back to
///   common key files (`~/.ssh/id_ed25519`, `id_rsa`, `id_ecdsa`).
/// - **HTTPS**: delegates to the system git credential helper (macOS Keychain
///   via `osxkeychain`, Windows Credential Manager, etc.).
/// - **git://**: uses default (anonymous) credentials.
fn make_remote_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut cbs = RemoteCallbacks::new();
    let mut attempts = 0;
    cbs.credentials(move |url, username_from_url, allowed_types| {
        attempts += 1;
        // Bail after a few rounds to avoid infinite auth loops
        if attempts > 6 {
            return Err(git2::Error::from_str(
                "authentication failed after multiple attempts — check your SSH keys or git credentials",
            ));
        }

        let user = username_from_url.unwrap_or("git");

        // ── SSH transport ────────────────────────────────────────────
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            // Attempt 1: SSH agent (macOS Keychain agent, 1Password SSH agent, etc.)
            if attempts <= 1 {
                if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                    return Ok(cred);
                }
            }
            // Attempt 2+: try common key files on disk
            let home = dirs::home_dir().unwrap_or_default();
            let ssh_dir = home.join(".ssh");
            let key_names = ["id_ed25519", "id_ecdsa", "id_rsa"];
            let key_idx = (attempts as usize).saturating_sub(2);
            if key_idx < key_names.len() {
                let private_key = ssh_dir.join(key_names[key_idx]);
                if private_key.exists() {
                    return Cred::ssh_key(user, None, &private_key, None);
                }
            }
            // All key files exhausted — one more agent attempt in case of timing
            return Cred::ssh_key_from_agent(user);
        }

        // ── HTTPS transport ──────────────────────────────────────────
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            // Delegate to the system git credential helper (osxkeychain, manager, etc.)
            if let Ok(config) = git2::Config::open_default() {
                if let Ok(cred) = Cred::credential_helper(&config, url, username_from_url) {
                    return Ok(cred);
                }
            }
            return Err(git2::Error::from_str(
                "no HTTPS credentials found — run `git credential approve` or log in via your git credential manager",
            ));
        }

        // ── Anonymous / default (git:// protocol) ────────────────────
        if allowed_types.contains(git2::CredentialType::DEFAULT) {
            return Cred::default();
        }

        Err(git2::Error::from_str("unsupported credential type requested"))
    });
    cbs
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
    pub current: bool,
    /// True if this branch is checked out in another worktree (cannot be switched to).
    pub worktree_locked: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    pub name: String,
    pub full_ref: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub local: Vec<LocalBranch>,
    pub remotes: HashMap<String, Vec<RemoteBranch>>,
    pub current_branch: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchResult {
    pub branch: String,
}

fn resolve_workspace(state: &AcpState, task_id: &str) -> Result<String, AppError> {
    let tasks = state.tasks.lock()?;
    tasks
        .get(task_id)
        .map(|t| t.workspace.clone())
        .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))
}

#[tauri::command]
pub fn git_detect(path: String) -> bool {
    Repository::discover(&path).is_ok()
}

#[tauri::command]
pub fn git_list_branches(cwd: String) -> Result<BranchInfo, AppError> {
    let repo = Repository::open(&cwd)?;
    let head = repo.head().ok();
    let current = head
        .as_ref()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_default();

    // Collect branches locked by worktrees
    let mut worktree_branches: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Ok(worktrees) = repo.worktrees() {
        for i in 0..worktrees.len() {
            let wt_name = match worktrees.get(i) {
                Some(n) => n,
                None => continue,
            };
            if let Ok(wt) = repo.find_worktree(wt_name) {
                if let Ok(wt_repo) = Repository::open_from_worktree(&wt) {
                    if let Ok(wt_head) = wt_repo.head() {
                        if let Some(branch) = wt_head.shorthand() {
                            worktree_branches.insert(branch.to_string());
                        }
                    }
                }
            }
        }
    }

    let mut local = Vec::new();
    for branch in repo.branches(Some(BranchType::Local))? {
        let (branch, _) = branch?;
        let name = branch.name()?.unwrap_or("").to_string();
        let is_locked = !name.is_empty() && worktree_branches.contains(&name) && name != current;
        local.push(LocalBranch {
            current: name == current,
            worktree_locked: is_locked,
            name,
        });
    }

    let mut remotes: HashMap<String, Vec<RemoteBranch>> = HashMap::new();
    for branch in repo.branches(Some(BranchType::Remote))? {
        let (branch, _) = branch?;
        let full_ref = branch.name()?.unwrap_or("").to_string();
        if let Some((remote, name)) = full_ref.split_once('/') {
            remotes.entry(remote.to_string()).or_default().push(RemoteBranch {
                name: name.to_string(),
                full_ref: full_ref.clone(),
            });
        }
    }

    Ok(BranchInfo { local, remotes, current_branch: current })
}

#[tauri::command]
pub fn git_checkout(cwd: String, branch: String, force: Option<bool>) -> Result<BranchResult, AppError> {
    let repo = Repository::open(&cwd)?;
    let (object, reference) = repo.revparse_ext(&branch)?;
    let mut opts = git2::build::CheckoutBuilder::new();
    if force.unwrap_or(false) {
        opts.force();
    }
    repo.checkout_tree(&object, Some(&mut opts))?;
    if let Some(reference) = reference {
        repo.set_head(reference.name().unwrap_or(&format!("refs/heads/{branch}")))?;
    } else {
        repo.set_head(&format!("refs/heads/{branch}"))?;
    }
    Ok(BranchResult { branch })
}

#[tauri::command]
pub fn git_create_branch(cwd: String, branch: String) -> Result<BranchResult, AppError> {
    let repo = Repository::open(&cwd)?;
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;
    repo.branch(&branch, &commit, false)?;
    // Checkout the new branch
    let (object, _) = repo.revparse_ext(&branch)?;
    repo.checkout_tree(&object, None)?;
    repo.set_head(&format!("refs/heads/{branch}"))?;
    Ok(BranchResult { branch })
}

#[tauri::command]
pub fn git_commit(
    settings_state: tauri::State<'_, SettingsState>,
    cwd: String,
    message: String,
) -> Result<String, AppError> {
    let repo = Repository::open(&cwd)?;
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature()?;
    let parent = repo.head()?.peel_to_commit()?;
    let co_author = settings_state.0.lock().map(|s| s.settings.co_author).unwrap_or(true);
    let message = if co_author {
        format!("{message}\n\nCo-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>")
    } else {
        message
    };
    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])?;
    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_push(cwd: String) -> Result<String, AppError> {
    let repo = Repository::open(&cwd)?;
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("main");
    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");
    let mut remote = repo.find_remote("origin")?;
    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(make_remote_callbacks());
    remote.push(&[&refspec], Some(&mut opts))?;
    Ok(format!("Pushed {branch_name}"))
}

#[tauri::command]
pub fn git_pull(cwd: String) -> Result<String, AppError> {
    let repo = Repository::open(&cwd)?;
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("main").to_string();
    let mut remote = repo.find_remote("origin")?;
    let fetch_refspec = format!("refs/heads/{branch_name}:refs/remotes/origin/{branch_name}");
    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(make_remote_callbacks());
    remote.fetch(&[&fetch_refspec], Some(&mut fetch_opts), None)?;
    let fetch_head = repo.find_reference("FETCH_HEAD")?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;
    let (analysis, _) = repo.merge_analysis(&[&fetch_commit])?;
    if analysis.is_fast_forward() {
        let target = fetch_commit.id();
        let mut reference = repo.find_reference(&format!("refs/heads/{branch_name}"))?;
        reference.set_target(target, &format!("pull: fast-forward {branch_name}"))?;
        repo.set_head(&format!("refs/heads/{branch_name}"))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
        Ok(format!("Pulled {branch_name} (fast-forward)"))
    } else if analysis.is_up_to_date() {
        Ok("Already up to date".to_string())
    } else {
        Err(AppError::Other("Cannot fast-forward; merge required".to_string()))
    }
}

#[tauri::command]
pub fn git_fetch(cwd: String) -> Result<String, AppError> {
    let repo = Repository::open(&cwd)?;
    let mut remote = repo.find_remote("origin")?;
    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(make_remote_callbacks());
    remote.fetch::<&str>(&[], Some(&mut fetch_opts), None)?;
    Ok("Fetched origin".to_string())
}

#[tauri::command]
pub fn git_stage(
    state: tauri::State<'_, AcpState>,
    task_id: String,
    file_path: String,
) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    let repo = Repository::open(&cwd)?;
    let mut index = repo.index()?;
    index.add_path(Path::new(&file_path))?;
    index.write()?;
    Ok(format!("Staged {file_path}"))
}

#[tauri::command]
pub fn git_revert(
    state: tauri::State<'_, AcpState>,
    task_id: String,
    file_path: String,
) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    let repo = Repository::open(&cwd)?;
    let head = repo.head()?.peel_to_tree()?;
    repo.checkout_tree(
        head.as_object(),
        Some(git2::build::CheckoutBuilder::new().path(&file_path).force()),
    )?;
    // Also unstage
    let mut index = repo.index()?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let head_tree = head_commit.tree()?;
    if let Ok(entry) = head_tree.get_path(Path::new(&file_path)) {
        index.add(&git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0, ino: 0, mode: entry.filemode() as u32,
            uid: 0, gid: 0, file_size: 0,
            id: entry.id(), flags: 0, flags_extended: 0,
            path: file_path.as_bytes().to_vec(),
        })?;
    } else {
        index.remove_path(Path::new(&file_path))?;
    }
    index.write()?;
    Ok(format!("Reverted {file_path}"))
}

#[tauri::command]
pub fn task_diff(state: tauri::State<'_, AcpState>, task_id: String) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    let repo = Repository::open(&cwd)?;

    let mut diff_opts = DiffOptions::new();
    let mut output = String::new();

    // Staged changes (index vs HEAD)
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let staged = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))?;
    staged.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if matches!(origin, '+' | '-' | ' ') {
            output.push(origin);
        }
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })?;

    // Unstaged changes (workdir vs index)
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;
    unstaged.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if matches!(origin, '+' | '-' | ' ') {
            output.push(origin);
        }
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })?;

    Ok(output)
}

/// Lightweight diff stats by workspace path (no task required).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffStats {
    pub additions: u32,
    pub deletions: u32,
    pub file_count: u32,
}

#[tauri::command]
pub fn git_diff_stats(cwd: String) -> Result<GitDiffStats, AppError> {
    let repo = Repository::open(&cwd)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut stats = GitDiffStats { additions: 0, deletions: 0, file_count: 0 };
    let count = |diff: git2::Diff, s: &mut GitDiffStats| {
        let ds = diff.stats().ok();
        if let Some(ds) = ds {
            s.additions += ds.insertions() as u32;
            s.deletions += ds.deletions() as u32;
            s.file_count += ds.files_changed() as u32;
        }
    };
    if let Ok(staged) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        count(staged, &mut stats);
    }
    if let Ok(unstaged) = repo.diff_index_to_workdir(None, None) {
        count(unstaged, &mut stats);
    }
    Ok(stats)
}

/// Stats for staged changes only (index vs HEAD).
#[tauri::command]
pub fn git_staged_stats(cwd: String) -> Result<GitDiffStats, AppError> {
    let repo = Repository::open(&cwd)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut stats = GitDiffStats { additions: 0, deletions: 0, file_count: 0 };
    if let Ok(staged) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        if let Ok(ds) = staged.stats() {
            stats.additions = ds.insertions() as u32;
            stats.deletions = ds.deletions() as u32;
            stats.file_count = ds.files_changed() as u32;
        }
    }
    Ok(stats)
}

/// Get unified diff for a single file (relative path) within a task's workspace.
/// Returns empty string if the file has no changes.
#[tauri::command]
pub fn git_remote_url(cwd: String) -> Result<String, AppError> {
    let repo = Repository::open(&cwd)?;
    let remote = repo.find_remote("origin")?;
    let url = remote.url().unwrap_or("").to_string();
    // Convert SSH URLs to HTTPS: git@github.com:user/repo.git → https://github.com/user/repo
    let https = if url.starts_with("git@") {
        let stripped = url.trim_start_matches("git@");
        format!("https://{}", stripped.replacen(':', "/", 1).trim_end_matches(".git"))
    } else {
        url.trim_end_matches(".git").to_string()
    };
    Ok(https)
}

#[tauri::command]
pub fn git_diff_file(
    state: tauri::State<'_, AcpState>,
    task_id: String,
    file_path: String,
) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    let repo = Repository::open(&cwd)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    let mut output = String::new();

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(&file_path);

    // Staged changes for this file
    let staged = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))?;
    staged.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        match origin {
            'H' | 'F' => {
                // File header lines (diff --git, ---, +++, etc.)
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
            '+' | '-' | ' ' => {
                output.push(origin);
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
            _ => {
                // Hunk headers and other meta lines
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
        }
        true
    })?;

    // Unstaged changes for this file
    let mut diff_opts2 = DiffOptions::new();
    diff_opts2.pathspec(&file_path);
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts2))?;
    unstaged.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        match origin {
            'H' | 'F' => {
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
            '+' | '-' | ' ' => {
                output.push(origin);
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
            _ => {
                output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            }
        }
        true
    })?;

    Ok(output)
}

// ── Worktree support ─────────────────────────────────────────────

/// Allowed slug characters: alphanumeric, dashes, underscores, dots.
/// No `..`, no leading/trailing dots, max 30 chars.
fn validate_worktree_slug(slug: &str) -> Result<(), AppError> {
    if slug.is_empty() || slug.len() > 30 {
        return Err(AppError::Other("Slug must be 1–30 characters".to_string()));
    }
    if slug.starts_with('.') || slug.ends_with('.') {
        return Err(AppError::Other("Slug must not start or end with '.'".to_string()));
    }
    if slug.contains("..") {
        return Err(AppError::Other("Slug must not contain '..'".to_string()));
    }
    if !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err(AppError::Other(
            "Slug may only contain alphanumeric characters, dashes, underscores, and dots".to_string(),
        ));
    }
    Ok(())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeResult {
    pub worktree_path: String,
    pub branch: String,
}

#[tauri::command]
pub fn git_worktree_create(cwd: String, slug: String) -> Result<WorktreeResult, AppError> {
    validate_worktree_slug(&slug)?;
    let cwd_path = Path::new(&cwd);
    // Reject creating a worktree from inside another worktree
    if cwd.contains("/.kiro/worktrees/") {
        return Err(AppError::Other("Cannot create a worktree from inside another worktree. Use the project root.".to_string()));
    }
    let worktree_dir = cwd_path.join(".kiro").join("worktrees").join(&slug);
    let worktree_path = worktree_dir.to_string_lossy().to_string();
    let branch = format!("worktree-{slug}");
    let output = Command::new("git")
        .args(["worktree", "add", "-B", &branch, &worktree_path, "HEAD"])
        .current_dir(&cwd)
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("git worktree add failed: {stderr}")));
    }
    Ok(WorktreeResult { worktree_path, branch })
}

#[tauri::command]
pub fn git_worktree_remove(cwd: String, worktree_path: String) -> Result<(), AppError> {
    let output = Command::new("git")
        .args(["worktree", "remove", "--force", &worktree_path])
        .current_dir(&cwd)
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("git worktree remove failed: {stderr}")));
    }
    Ok(())
}

#[tauri::command]
pub fn git_worktree_has_changes(worktree_path: String) -> Result<bool, AppError> {
    let repo = Repository::open(&worktree_path)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    // Check staged changes
    if let Ok(staged) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        if let Ok(stats) = staged.stats() {
            if stats.files_changed() > 0 {
                return Ok(true);
            }
        }
    }
    // Check unstaged changes
    if let Ok(unstaged) = repo.diff_index_to_workdir(None, None) {
        if let Ok(stats) = unstaged.stats() {
            if stats.files_changed() > 0 {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSetupResult {
    pub symlink_count: u32,
    pub copied_files: Vec<String>,
}

#[tauri::command]
pub fn git_worktree_setup(
    cwd: String,
    worktree_path: String,
    symlink_dirs: Vec<String>,
) -> Result<WorktreeSetupResult, AppError> {
    let cwd_path = Path::new(&cwd).canonicalize()?;
    let wt_path = Path::new(&worktree_path);
    let mut symlink_count: u32 = 0;
    let mut copied_files: Vec<String> = Vec::new();
    // Symlink directories
    for dir in &symlink_dirs {
        // Reject path traversal
        if dir.contains("..") || dir.starts_with('/') {
            continue;
        }
        let source = cwd_path.join(dir);
        let target = wt_path.join(dir);
        if !source.exists() {
            continue;
        }
        // Create parent dirs in worktree
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&source, &target)?;
        #[cfg(windows)]
        {
            if source.is_dir() {
                std::os::windows::fs::symlink_dir(&source, &target)?;
            } else {
                std::os::windows::fs::symlink_file(&source, &target)?;
            }
        }
        symlink_count += 1;
    }
    // Read .worktreeinclude and copy matching gitignored files
    let include_file = cwd_path.join(".worktreeinclude");
    if include_file.exists() {
        let content = std::fs::read_to_string(&include_file)?;
        let patterns: Vec<&str> = content.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .collect();
        if !patterns.is_empty() {
            // Use git ls-files to find ignored files
            let output = Command::new("git")
                .args(["ls-files", "--others", "--ignored", "--exclude-standard"])
                .current_dir(&cwd_path)
                .output()?;
            if output.status.success() {
                let files = String::from_utf8_lossy(&output.stdout);
                for file in files.lines() {
                    let matches = patterns.iter().any(|pat| {
                        // Simple glob: exact match or fnmatch-style
                        file == *pat || file.starts_with(pat.trim_end_matches('*'))
                            || Path::new(file).file_name()
                                .map(|n| n.to_string_lossy() == *pat)
                                .unwrap_or(false)
                    });
                    if !matches { continue; }
                    // Reject path traversal in file paths
                    if file.contains("..") { continue; }
                    let src = cwd_path.join(file);
                    let dst = wt_path.join(file);
                    if !src.exists() { continue; }
                    if let Some(parent) = dst.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    std::fs::copy(&src, &dst)?;
                    copied_files.push(file.to_string());
                }
            }
        }
    }
    // Ensure .kiro/worktrees/ is in .gitignore
    ensure_gitignore_entry(&cwd_path, ".kiro/worktrees/")?;
    Ok(WorktreeSetupResult { symlink_count, copied_files })
}

/// Append an entry to .gitignore if not already present.
fn ensure_gitignore_entry(cwd: &Path, entry: &str) -> Result<(), AppError> {
    let gitignore = cwd.join(".gitignore");
    if gitignore.exists() {
        let content = std::fs::read_to_string(&gitignore)?;
        if content.lines().any(|l| l.trim() == entry) {
            return Ok(());
        }
        let separator = if content.ends_with('\n') { "" } else { "\n" };
        std::fs::write(&gitignore, format!("{content}{separator}{entry}\n"))?;
    } else {
        std::fs::write(&gitignore, format!("{entry}\n"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_branch_serializes_camel_case() {
        let b = LocalBranch { name: "main".to_string(), current: true, worktree_locked: false };
        let json = serde_json::to_string(&b).unwrap();
        assert!(json.contains("\"name\":\"main\""));
        assert!(json.contains("\"current\":true"));
    }

    #[test]
    fn remote_branch_serializes_camel_case() {
        let b = RemoteBranch { name: "main".to_string(), full_ref: "origin/main".to_string() };
        let json = serde_json::to_string(&b).unwrap();
        assert!(json.contains("\"fullRef\":\"origin/main\""));
    }

    #[test]
    fn branch_info_serializes_camel_case() {
        let info = BranchInfo {
            local: vec![LocalBranch { name: "main".to_string(), current: true, worktree_locked: false }],
            remotes: HashMap::new(),
            current_branch: "main".to_string(),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"currentBranch\":\"main\""));
    }

    #[test]
    fn branch_result_serializes() {
        let r = BranchResult { branch: "feature".to_string() };
        assert_eq!(serde_json::to_string(&r).unwrap(), r#"{"branch":"feature"}"#);
    }

    #[test]
    fn git_diff_stats_serializes_camel_case() {
        let s = GitDiffStats { additions: 10, deletions: 5, file_count: 3 };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"fileCount\":3"));
        assert!(json.contains("\"additions\":10"));
    }

    #[test]
    fn git_detect_false_for_nonexistent() {
        assert!(!git_detect("/nonexistent/path".to_string()));
    }

    #[test]
    fn git_detect_true_for_real_repo() {
        assert!(git_detect(env!("CARGO_MANIFEST_DIR").to_string()));
    }

    #[test]
    fn validate_slug_accepts_valid() {
        assert!(validate_worktree_slug("my-feature").is_ok());
        assert!(validate_worktree_slug("fix_123").is_ok());
        assert!(validate_worktree_slug("v1.0.0").is_ok());
        assert!(validate_worktree_slug("a").is_ok());
    }

    #[test]
    fn validate_slug_rejects_empty() {
        assert!(validate_worktree_slug("").is_err());
    }

    #[test]
    fn validate_slug_rejects_too_long() {
        let long = "a".repeat(65);
        assert!(validate_worktree_slug(&long).is_err());
    }

    #[test]
    fn validate_slug_rejects_dot_dot() {
        assert!(validate_worktree_slug("foo..bar").is_err());
    }

    #[test]
    fn validate_slug_rejects_special_chars() {
        assert!(validate_worktree_slug("foo/bar").is_err());
        assert!(validate_worktree_slug("foo bar").is_err());
        assert!(validate_worktree_slug("foo@bar").is_err());
    }

    #[test]
    fn worktree_result_serializes_camel_case() {
        let r = WorktreeResult {
            worktree_path: "/tmp/wt".to_string(),
            branch: "worktree-feat".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"worktreePath\":\"/tmp/wt\""));
        assert!(json.contains("\"branch\":\"worktree-feat\""));
    }

    #[test]
    fn worktree_setup_result_serializes_camel_case() {
        let r = WorktreeSetupResult {
            symlink_count: 2,
            copied_files: vec![".env".to_string()],
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"symlinkCount\":2"));
        assert!(json.contains("\"copiedFiles\""));
    }

    #[test]
    fn ensure_gitignore_creates_file_if_missing() {
        let dir = tempfile::tempdir().unwrap();
        ensure_gitignore_entry(dir.path(), ".kiro/worktrees/").unwrap();
        let content = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(content, ".kiro/worktrees/\n");
    }

    #[test]
    fn ensure_gitignore_appends_if_not_present() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".gitignore"), "node_modules/\n").unwrap();
        ensure_gitignore_entry(dir.path(), ".kiro/worktrees/").unwrap();
        let content = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert!(content.contains("node_modules/"));
        assert!(content.contains(".kiro/worktrees/"));
    }

    #[test]
    fn ensure_gitignore_skips_if_already_present() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".gitignore"), ".kiro/worktrees/\n").unwrap();
        ensure_gitignore_entry(dir.path(), ".kiro/worktrees/").unwrap();
        let content = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(content.matches(".kiro/worktrees/").count(), 1);
    }

    #[test]
    fn ensure_gitignore_handles_no_trailing_newline() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".gitignore"), "node_modules/").unwrap();
        ensure_gitignore_entry(dir.path(), ".kiro/worktrees/").unwrap();
        let content = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(content, "node_modules/\n.kiro/worktrees/\n");
    }

    #[test]
    fn worktree_create_rejects_worktree_path_as_cwd() {
        let result = git_worktree_create(
            "/project/.kiro/worktrees/feat".to_string(),
            "new-branch".to_string(),
        );
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Cannot create a worktree from inside another worktree"));
    }
}
