use git2::{BranchType, DiffOptions, Repository};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

use super::acp::AcpState;
use super::error::AppError;
use super::settings::SettingsState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
    pub current: bool,
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

    let mut local = Vec::new();
    for branch in repo.branches(Some(BranchType::Local))? {
        let (branch, _) = branch?;
        let name = branch.name()?.unwrap_or("").to_string();
        local.push(LocalBranch {
            current: name == current,
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
pub fn git_checkout(cwd: String, branch: String) -> Result<BranchResult, AppError> {
    let repo = Repository::open(&cwd)?;
    let (object, reference) = repo.revparse_ext(&branch)?;
    repo.checkout_tree(&object, None)?;
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
    state: tauri::State<'_, AcpState>,
    settings_state: tauri::State<'_, SettingsState>,
    task_id: String,
    message: String,
) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
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
pub fn git_push(state: tauri::State<'_, AcpState>, task_id: String) -> Result<String, AppError> {
    let cwd = resolve_workspace(&state, &task_id)?;
    let repo = Repository::open(&cwd)?;
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("main");
    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");
    let mut remote = repo.find_remote("origin")?;
    remote.push(&[&refspec], None)?;
    Ok(format!("Pushed {branch_name}"))
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

/// Get unified diff for a single file (relative path) within a task's workspace.
/// Returns empty string if the file has no changes.
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
