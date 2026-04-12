# Git Commit Input in Diff Panel

## Problem
Users need a way to commit staged changes directly from the diff panel without navigating to the header dropdown.

## Requirements
- Fixed commit input bar at the bottom of the DiffViewer
- Commit only staged files (user stages individually via existing per-file buttons)
- Show count of staged files ready to commit
- Auto-append co-author trailer based on existing `coAuthor` setting (handled by Rust backend)
- Single-line input that expands on Shift+Enter, Enter to commit
- New `gitStagedStats` IPC call to get staged file count

## Existing Infrastructure
- `ipc.gitCommit(cwd, message)` — already exists, handles co-author trailer in Rust
- `ipc.gitStage(taskId, filePath)` — per-file staging exists
- `coAuthor` setting in AppSettings — already wired to Rust backend
- DiffViewer receives `workspace` and `taskId` as props

## Tasks

### Task 1: Add `git_staged_stats` Rust command
- File: `src-tauri/src/commands/git.rs`
- Reuse `GitDiffStats` struct
- Diff tree-to-index only (staged changes)
- Takes `cwd: String`
- Register in `src-tauri/src/lib.rs`

### Task 2: Add `gitStagedStats` to frontend IPC
- File: `src/renderer/lib/ipc.ts`
- `gitStagedStats(cwd: string): Promise<{ fileCount: number; additions: number; deletions: number }>`
- Calls `invoke('git_staged_stats', { cwd })`

### Task 3: Build CommitBar component
- File: `src/renderer/components/code/commit-bar.tsx`
- Fixed bar at bottom of DiffViewer
- Shows staged file count via `gitStagedStats`
- Single-line `<textarea>` that grows on Shift+Enter (max ~4 rows)
- Enter commits, Shift+Enter adds newline
- Commit button disabled when no message or no staged files
- Loading state during commit
- After commit: clear input, trigger onRefreshDiff, re-fetch staged stats
- Placeholder: `feat(scope): description`

### Task 4: Wire CommitBar into DiffViewer
- File: `src/renderer/components/code/DiffViewer.tsx`
- Render `<CommitBar>` at bottom of outer flex column
- Pass `workspace`, `taskId`, `onRefreshDiff`
- Re-fetch staged stats after stage/revert actions

### Task 5: Build validation
- `bun run check:ts` — zero errors
- `bun run check:rust` — zero errors
- `npx vite build` — zero errors
