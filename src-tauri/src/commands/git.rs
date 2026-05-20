use git2::{BranchType, DiffOptions, Repository};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use super::acp::AcpState;
use super::error::AppError;
use super::settings::SettingsState;

/// Run a git CLI command and return stdout on success or an `AppError` on failure.
///
/// Uses the system `git` binary, which inherits the user's full SSH agent,
/// credential helpers, and Keychain integration — avoiding the passphrase and
/// credential issues that plague `libssh2` / `git2` for network operations.
fn run_git(cwd: &str, args: &[&str]) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Other(format!("git {} failed: {stderr}", args.join(" "))))
    }
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
    let tasks = state.tasks.lock();
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
pub fn git_init(path: String) -> Result<(), AppError> {
    Repository::init(&path)?;
    Ok(())
}

/// Clone a remote repository into `target_dir`.
///
/// Uses the system `git` binary (not git2) so SSH agent, credential helpers,
/// and Keychain integration work out of the box.
#[tauri::command]
pub async fn git_clone(url: String, target_dir: String) -> Result<String, AppError> {
    let result = tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .args(["clone", "--progress", &url, &target_dir])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()?;
        if output.status.success() {
            Ok(target_dir)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(AppError::Other(format!("git clone failed: {stderr}")))
        }
    })
    .await
    .map_err(|e| AppError::Other(format!("clone task panicked: {e}")))?;
    result
}

#[tauri::command]
pub fn git_list_branches(cwd: String) -> Result<BranchInfo, AppError> {
    let repo = Repository::discover(&cwd)?;
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

/// If `branch` matches a remote tracking branch (e.g. "origin/develop" or bare "develop"
/// when only one remote has it), create a local branch tracking it and return the local name.
fn try_create_tracking_branch(repo: &Repository, branch: &str) -> Option<String> {
    // Case 1: explicit remote ref like "origin/develop"
    if let Some((_, local_name)) = branch.split_once('/') {
        if let Ok(remote_branch) = repo.find_branch(branch, BranchType::Remote) {
            if repo.find_branch(local_name, BranchType::Local).is_err() {
                let commit = remote_branch.get().peel_to_commit().ok()?;
                let mut local = repo.branch(local_name, &commit, false).ok()?;
                let _ = local.set_upstream(Some(branch));
                return Some(local_name.to_string());
            }
        }
    }
    // Case 2: bare name like "develop" — find a unique remote match
    for remote_branch in repo.branches(Some(BranchType::Remote)).ok()?.flatten() {
        let full_name = remote_branch.0.name().ok().flatten().unwrap_or("");
        if let Some((_, name)) = full_name.split_once('/') {
            if name == branch {
                let commit = remote_branch.0.get().peel_to_commit().ok()?;
                let mut local = repo.branch(branch, &commit, false).ok()?;
                let _ = local.set_upstream(Some(full_name));
                return Some(branch.to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub fn git_checkout(cwd: String, branch: String, force: Option<bool>) -> Result<BranchResult, AppError> {
    let repo = Repository::discover(&cwd)?;
    let (object, reference) = repo.revparse_ext(&branch)?;
    let mut opts = git2::build::CheckoutBuilder::new();
    if force.unwrap_or(false) {
        opts.force();
    }
    repo.checkout_tree(&object, Some(&mut opts))?;
    if let Some(reference) = reference {
        repo.set_head(reference.name().unwrap_or(&format!("refs/heads/{branch}")))?;
    } else {
        // No local ref found — check if this matches a remote tracking branch.
        // If so, create a local branch tracking it instead of detaching HEAD.
        if let Some(local_name) = try_create_tracking_branch(&repo, &branch) {
            repo.set_head(&format!("refs/heads/{local_name}"))?;
            return Ok(BranchResult { branch: local_name });
        }
        repo.set_head(&format!("refs/heads/{branch}"))?;
    }
    Ok(BranchResult { branch })
}

#[tauri::command]
pub fn git_create_branch(cwd: String, branch: String) -> Result<BranchResult, AppError> {
    let repo = Repository::discover(&cwd)?;
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
pub fn git_delete_branch(cwd: String, branch: String) -> Result<BranchResult, AppError> {
    let repo = Repository::discover(&cwd)?;
    let mut local_branch = repo.find_branch(&branch, git2::BranchType::Local)?;
    if local_branch.is_head() {
        return Err(AppError::Git(git2::Error::from_str("Cannot delete the currently checked-out branch")));
    }
    local_branch.delete()?;
    Ok(BranchResult { branch })
}

#[tauri::command]
pub fn git_commit(
    settings_state: tauri::State<'_, SettingsState>,
    cwd: String,
    message: String,
) -> Result<String, AppError> {
    let repo = Repository::discover(&cwd)?;
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature()?;
    let parent = repo.head()?.peel_to_commit()?;
    let co_author = settings_state.0.lock().settings.co_author;
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
    let repo = Repository::discover(&cwd)?;
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("main").to_string();
    run_git(&cwd, &["push", "-u", "origin", &branch_name])?;
    Ok(format!("Pushed {branch_name}"))
}

#[tauri::command]
pub fn git_pull(cwd: String) -> Result<String, AppError> {
    let repo = Repository::discover(&cwd)?;
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("main").to_string();
    let output = run_git(&cwd, &["pull", "--ff-only", "origin", &branch_name])?;
    if output.contains("Already up to date") {
        return Ok("Already up to date".to_string());
    }
    Ok(format!("Pulled {branch_name}"))
}

#[tauri::command]
pub fn git_fetch(cwd: String) -> Result<String, AppError> {
    run_git(&cwd, &["fetch", "origin"])?;
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

    // Unstaged changes (workdir vs index)
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;
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

/// Full diff patch by workspace path (no task required).
#[tauri::command]
pub fn git_diff(cwd: String) -> Result<String, AppError> {
    let repo = Repository::discover(&cwd)?;
    let mut diff_opts = DiffOptions::new();
    let mut output = String::new();
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let staged = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))?;
    staged.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
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
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;
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
    let repo = Repository::discover(&cwd)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    // Merge staged + unstaged into one diff so files appearing in both are
    // counted once, matching the combined patch the diff panel displays.
    let mut combined = repo.diff_tree_to_index(head_tree.as_ref(), None, None)?;
    let unstaged = repo.diff_index_to_workdir(None, None)?;
    combined.merge(&unstaged)?;
    let mut stats = GitDiffStats { additions: 0, deletions: 0, file_count: 0 };
    if let Ok(ds) = combined.stats() {
        stats.additions = ds.insertions() as u32;
        stats.deletions = ds.deletions() as u32;
        stats.file_count = ds.files_changed() as u32;
    }
    Ok(stats)
}

/// Stats for staged changes only (index vs HEAD).
#[tauri::command]
pub fn git_staged_stats(cwd: String) -> Result<GitDiffStats, AppError> {
    let repo = Repository::discover(&cwd)?;
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

/// Combined diff stats (staged + unstaged) for a task. Lets the renderer
/// fetch stats by `taskId` instead of having to know the workspace path,
/// avoiding a duplicate string-parse pass over the diff body.
#[tauri::command]
pub fn task_diff_stats(
    state: tauri::State<'_, AcpState>,
    task_id: String,
) -> Result<GitDiffStats, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    git_diff_stats(cwd)
}

/// Get unified diff for a single file (relative path) within a task's workspace.
/// Returns empty string if the file has no changes.
// ── Changed files list (for commit dialog) ──────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub insertions: u32,
    pub deletions: u32,
    /// "M" modified, "A" added, "D" deleted, "R" renamed
    pub status: String,
}

/// Returns the list of changed files (staged + unstaged) with per-file
/// insertion/deletion counts. Used by the commit dialog to show the file list.
#[tauri::command]
pub fn git_changed_files(cwd: String) -> Result<Vec<ChangedFile>, AppError> {
    let repo = Repository::discover(&cwd)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    // Merge staged + unstaged (including untracked files)
    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(true);
    diff_opts.recurse_untracked_dirs(true);

    let mut combined = repo.diff_tree_to_index(head_tree.as_ref(), None, None)?;
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;
    combined.merge(&unstaged)?;

    let mut files: Vec<ChangedFile> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (idx, delta) in combined.deltas().enumerate() {
        let path = delta.new_file().path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if path.is_empty() || seen.contains(&path) {
            continue;
        }
        seen.insert(path.clone());

        let status = match delta.status() {
            git2::Delta::Added => "A",
            git2::Delta::Deleted => "D",
            git2::Delta::Modified => "M",
            git2::Delta::Renamed => "R",
            git2::Delta::Copied => "A",
            _ => "M",
        };

        // Get per-file line stats via patch
        let (insertions, deletions) = if let Ok(patch) = git2::Patch::from_diff(&combined, idx) {
            if let Some(p) = patch {
                let (_, adds, dels) = p.line_stats().unwrap_or((0, 0, 0));
                (adds as u32, dels as u32)
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        files.push(ChangedFile {
            path,
            insertions,
            deletions,
            status: status.to_string(),
        });
    }

    Ok(files)
}

/// Stage a list of file paths into the given index, validating each path
/// stays within the repository root. Shared by `git_stage_files` and
/// `git_commit_files` to avoid duplicating the traversal-check logic.
fn stage_paths(
    index: &mut git2::Index,
    cwd: &str,
    canonical_cwd: &Path,
    file_paths: &[String],
) -> Result<(), AppError> {
    for path in file_paths {
        let file_path = Path::new(path);
        // Reject paths with traversal components before any filesystem access
        if file_path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(AppError::Other(format!("Path contains traversal component: {path}")));
        }
        let full_path = Path::new(cwd).join(file_path);
        if full_path.exists() {
            // File exists — canonicalize and verify it's within the repo
            let canonical_full = full_path.canonicalize()
                .map_err(|e| AppError::Other(format!("Cannot resolve path {path}: {e}")))?;
            if !canonical_full.starts_with(canonical_cwd) {
                return Err(AppError::Other(format!("Path escapes repository root: {path}")));
            }
            index.add_path(file_path)?;
        } else {
            // File was deleted — for removals, verify the relative path doesn't escape
            // by checking that joining it doesn't produce a path outside the repo
            let normalized = canonical_cwd.join(file_path);
            if !normalized.starts_with(canonical_cwd) {
                return Err(AppError::Other(format!("Path escapes repository root: {path}")));
            }
            index.remove_path(file_path)?;
        }
    }
    Ok(())
}

/// Stage specific files without committing. Used by the commit dialog to
/// stage selected files before AI commit message generation, so the generated
/// message accurately reflects only the files that will be committed.
#[tauri::command]
pub fn git_stage_files(
    cwd: String,
    file_paths: Vec<String>,
) -> Result<(), AppError> {
    let repo = Repository::discover(&cwd)?;
    let mut index = repo.index()?;
    let canonical_cwd = Path::new(&cwd).canonicalize().unwrap_or_else(|_| Path::new(&cwd).to_path_buf());
    stage_paths(&mut index, &cwd, &canonical_cwd, &file_paths)?;
    index.write()?;
    Ok(())
}

/// Commit only specific files (selective commit for the commit dialog).
/// Stages only the given file paths, then commits.
#[tauri::command]
pub fn git_commit_files(
    settings_state: tauri::State<'_, SettingsState>,
    cwd: String,
    message: String,
    file_paths: Vec<String>,
) -> Result<String, AppError> {
    let repo = Repository::discover(&cwd)?;
    let mut index = repo.index()?;
    let canonical_cwd = Path::new(&cwd).canonicalize().unwrap_or_else(|_| Path::new(&cwd).to_path_buf());
    stage_paths(&mut index, &cwd, &canonical_cwd, &file_paths)?;
    index.write()?;

    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let sig = repo.signature()?;
    let parent = repo.head()?.peel_to_commit()?;
    let co_author = settings_state.0.lock().settings.co_author;
    let message = if co_author {
        format!("{message}\n\nCo-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>")
    } else {
        message
    };
    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])?;
    Ok(oid.to_string())
}

/// Checkout a remote branch by creating a local tracking branch.
/// Given a full remote ref like "origin/feature-x", creates a local branch
/// "feature-x" that tracks the remote branch, then checks it out.
#[tauri::command]
pub fn git_checkout_remote(cwd: String, remote_ref: String, force: Option<bool>) -> Result<BranchResult, AppError> {
    let repo = Repository::discover(&cwd)?;
    let (remote_name, branch_name) = remote_ref.split_once('/')
        .ok_or_else(|| AppError::Other(format!("Invalid remote ref: {remote_ref}")))?;
    // Resolve the remote branch commit
    let remote_branch = repo.find_branch(&remote_ref, BranchType::Remote)?;
    let commit = remote_branch.get().peel_to_commit()?;
    // Check if local branch already exists — if so, just check it out
    let local_exists = repo.find_branch(branch_name, BranchType::Local).is_ok();
    if !local_exists {
        let mut local_branch = repo.branch(branch_name, &commit, false)?;
        local_branch.set_upstream(Some(&remote_ref))?;
    }
    // Checkout the local branch (safe by default, force if requested)
    let refname = format!("refs/heads/{branch_name}");
    repo.set_head(&refname)?;
    let mut opts = git2::build::CheckoutBuilder::new();
    if force.unwrap_or(false) {
        opts.force();
    }
    repo.checkout_head(Some(&mut opts))?;
    let _ = remote_name;
    Ok(BranchResult { branch: branch_name.to_string() })
}

/// Create a new branch from the current HEAD and switch to it.
#[tauri::command]
pub fn git_create_and_checkout_branch(cwd: String, branch: String) -> Result<BranchResult, AppError> {
    let repo = Repository::discover(&cwd)?;
    let head = repo.head()?.peel_to_commit()?;
    repo.branch(&branch, &head, false)?;
    let refname = format!("refs/heads/{branch}");
    repo.set_head(&refname)?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
    Ok(BranchResult { branch })
}

/// Add a remote to the repository.
#[tauri::command]
pub fn git_add_remote(cwd: String, name: String, url: String) -> Result<(), AppError> {
    let repo = Repository::discover(&cwd)?;
    // Check if remote already exists
    if repo.find_remote(&name).is_ok() {
        // Update existing remote URL
        repo.remote_set_url(&name, &url)?;
    } else {
        repo.remote(&name, &url)?;
    }
    Ok(())
}

#[tauri::command]
pub fn git_remote_url(cwd: String) -> Result<String, AppError> {
    let repo = Repository::discover(&cwd)?;
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

    // Shared print callback for both staged and unstaged diffs
    let mut print_line = |_delta: git2::DiffDelta, _hunk: Option<git2::DiffHunk>, line: git2::DiffLine| -> bool {
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
    };

    // Staged changes for this file
    let staged = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))?;
    staged.print(git2::DiffFormat::Patch, &mut print_line)?;

    // Unstaged changes for this file (reuse same DiffOptions)
    let unstaged = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;
    unstaged.print(git2::DiffFormat::Patch, &mut print_line)?;

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
    // Reject creating a worktree from inside another worktree (check first, before fs access)
    if cwd.contains("/.kiro/worktrees/") {
        return Err(AppError::Other("Cannot create a worktree from inside another worktree. Use the project root.".to_string()));
    }
    // Validate cwd is a real directory
    if !cwd_path.is_dir() {
        return Err(AppError::Other(format!("Workspace is not a directory: {cwd}")));
    }
    // Validate cwd is a git repository
    Repository::discover(&cwd).map_err(|_| AppError::Other(format!("Not a git repository: {cwd}")))?;
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
    // Validate cwd is a real directory and a git repository
    if !Path::new(&cwd).is_dir() {
        return Err(AppError::Other(format!("Workspace is not a directory: {cwd}")));
    }
    Repository::discover(&cwd).map_err(|_| AppError::Other(format!("Not a git repository: {cwd}")))?;
    // Validate worktree_path is under the cwd's .kiro/worktrees/ directory
    if let (Ok(canonical_cwd), Ok(canonical_wt)) = (
        Path::new(&cwd).canonicalize(),
        Path::new(&worktree_path).canonicalize(),
    ) {
        if !canonical_wt.starts_with(&canonical_cwd) {
            return Err(AppError::Other("Worktree path must be within the workspace".to_string()));
        }
    }
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
    let repo = Repository::discover(&worktree_path)?;
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    // Use num_deltas() instead of stats() — avoids computing line-level insertions/deletions
    if let Ok(staged) = repo.diff_tree_to_index(head_tree.as_ref(), None, None) {
        if staged.deltas().len() > 0 {
            return Ok(true);
        }
    }
    if let Ok(unstaged) = repo.diff_index_to_workdir(None, None) {
        if unstaged.deltas().len() > 0 {
            return Ok(true);
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
    // Validate cwd is a git repository
    let repo = Repository::discover(&cwd)?;
    // Validate worktree_path is under cwd
    if let Ok(canonical_wt) = wt_path.canonicalize() {
        if !canonical_wt.starts_with(&cwd_path) {
            return Err(AppError::Other("Worktree path must be within the workspace".to_string()));
        }
    }
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
            // Use git2 status API to find ignored files instead of shelling out to `git ls-files`
            let mut status_opts = git2::StatusOptions::new();
            status_opts.include_ignored(true)
                .include_untracked(true)
                .recurse_untracked_dirs(true);
            if let Ok(statuses) = repo.statuses(Some(&mut status_opts)) {
                for entry in statuses.iter() {
                    if !entry.status().intersects(git2::Status::IGNORED) {
                        continue;
                    }
                    let Some(file) = entry.path() else { continue };
                    let matches = patterns.iter().any(|pat| {
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
    fn git_init_creates_repo_in_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!git_detect(dir.path().to_string_lossy().to_string()));
        git_init(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(git_detect(dir.path().to_string_lossy().to_string()));
    }

    #[test]
    fn git_init_succeeds_on_existing_repo() {
        let dir = tempfile::tempdir().unwrap();
        git_init(dir.path().to_string_lossy().to_string()).unwrap();
        // Re-init should not error
        git_init(dir.path().to_string_lossy().to_string()).unwrap();
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
