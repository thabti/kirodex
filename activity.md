## 2026-05-26 16:56 GST (Dubai)

### Goal: Fully delete all goal-related code

Deleted all goal files and removed every remaining reference. Deleted: `goalStore.ts`, `goalStore.test.ts`, `goal-integration.test.ts`, `GoalCard.tsx`, `GoalModal.tsx`, `GoalStatusOverlay.tsx`, `goal.rs`, `.kiro_goal_templates/`. Removed goal IPC functions from `ipc.ts`, goal settings fields from `types/index.ts`, goal analytics event types from `analytics.ts` and `analytics-aggregators.ts`, and the `goalEnsureDir` mock from `settingsStore.test.ts`. Build passes cleanly.

**Modified:** src/renderer/lib/ipc.ts, src/renderer/types/index.ts, src/renderer/types/analytics.ts, src/renderer/lib/analytics-aggregators.ts, src/renderer/stores/settingsStore.test.ts

## 2026-05-26 16:47 GST (Dubai)

### Goal: Fully disable /goal feature and .kiro file injection

Removed the /goal slash command, its UI components, and the Rust backend registration. The goal auto-continue loop in task-store-listeners, GoalCard in ChatPanel, GoalStatusOverlay in SlashPanels, goal message badges in UserMessageRow, and goal active indicators in ThreadItem are all disconnected. The Rust `goal.rs` file and `.kiro_goal_templates/` remain on disk as dead code (not compiled). Build passes cleanly on both TypeScript and Rust.

**Modified:** src-tauri/src/commands/mod.rs, src-tauri/src/lib.rs, src/renderer/components/chat/ChatPanel.tsx, src/renderer/components/chat/EmptyThreadSplash.tsx, src/renderer/components/chat/SlashCommandPicker.tsx, src/renderer/components/chat/SlashPanels.tsx, src/renderer/components/chat/UserMessageRow.tsx, src/renderer/components/sidebar/ThreadItem.tsx, src/renderer/hooks/useChatInput.ts, src/renderer/hooks/useSlashAction.ts, src/renderer/stores/task-store-listeners.ts

## 2026-05-25 12:49 GST (Dubai)

### Goal: Disable feature by default, use global directory

Disabled the `/goal` feature by default (requires explicit `goalEnabled: true` in settings). Removed auto-creation of `.kiro/goal/` in project directories on workspace open. Changed the Rust backend to store goal state and templates in `~/.kiro/goal/` globally instead of per-project. Filtered goal-related slash commands from the UI when the feature is disabled.

**Modified:**
- `src-tauri/src/commands/goal.rs`
- `src/renderer/components/chat/EmptyThreadSplash.tsx`
- `src/renderer/hooks/useChatInput.ts`
- `src/renderer/hooks/useSlashAction.ts`
- `src/renderer/stores/settingsStore.ts`
- `src/renderer/types/index.ts`

## 2026-05-22 06:23 GST (Dubai)

### Diff: Fix dark background in light mode

The `@pierre/diffs` web component uses shadow DOM, so CSS variables from the host page don't resolve inside it. Replaced `var(--card)` / `var(--background)` references in `UNSAFE_CSS` with a `buildUnsafeCSS(isDark)` function that injects hardcoded color values matching the current theme.

**Modified:** `src/renderer/components/code/diff-viewer-utils.ts`, `src/renderer/components/code/DiffViewer.tsx`, `src/renderer/components/diff/DiffPanel.tsx`

## 2026-05-22 06:17 GST (Dubai)

### Chat: Strip image data from thread names

Fixed thread names showing raw `<image src="data:ima...` when the first message contains an image attachment. Applied `stripImageDataForTitleGen` in `PendingChat.tsx` before deriving the thread name, so image-only messages get named "[Image attachment]" and mixed messages show only the text portion.

**Modified:** src/renderer/components/chat/PendingChat.tsx

## 2026-05-22 06:18 GST (Dubai)

### Sidebar: Always show project name regardless of icon type

Fixed a bug where projects with a `favicon` icon type (e.g. Vercel ▲) had their name hidden in the sidebar. The condition `projectIcon?.type !== 'favicon'` was suppressing the name text. Removed the condition so the name always renders alongside the icon.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectItem.test.tsx`

## 2026-05-22 06:17 GST (Dubai)

### Sidebar: Show new thread and delete icons only on hover

Changed the action buttons in `ProjectItem.tsx` to be hidden by default and appear on hover via `group-hover/menu-item:flex`.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`

## 2026-05-20 11:26 GST (Dubai)

### Config: Copy goal files to ~/.kiro/ and version the directory

Copied `.kiro/goal/` files (initial.md, budget_limit.md, continuation.md) to `~/.kiro/goal/` using no-clobber so existing files are skipped. Initialized a git repo in `~/.kiro/`, added a `.gitignore` (excludes extensions/, .DS_Store, history), and committed all user config (steering, skills, agents, settings, goal) in two commits.

**Modified:** `~/.kiro/goal/initial.md`, `~/.kiro/goal/budget_limit.md`, `~/.kiro/goal/continuation.md`, `~/.kiro/.gitignore`

## 2026-05-19 13:04 GST (Dubai)

### Chat: Redesign PlanHandoffCard to match new design language

Replaced the teal card with rocket icon with a subtle inline design matching `TaskCompletionCard` — border-top separator, muted descriptive text, and a minimal "Execute" button with a play icon. Same functionality (switches to coding agent and sends the handoff message), cleaner visual weight.

**Modified:** src/renderer/components/chat/PlanHandoffCard.tsx

## 2026-05-19 12:58 GST (Dubai)

### Git: Preserve slashes in branch names during creation

Added `sanitizeBranchName` utility that preserves `/` characters (valid in git branch names like `feature/my-branch`) while still sanitizing invalid characters. The existing `slugify` function was stripping slashes because it was designed for worktree slugs. Branch creation in BranchSelector and GitPanels now uses `sanitizeBranchName`; worktree slug creation still uses `slugify`.

**Modified:** src/renderer/lib/utils.ts, src/renderer/components/chat/BranchSelector.tsx, src/renderer/components/chat/GitPanels.tsx

## 2026-05-19 12:54 GST (Dubai)

### Git: Fix remote branch checkout causing detached HEAD

Added `try_create_tracking_branch` helper to `git_checkout`. When `revparse_ext` returns `reference=None` (which happens for remote refs like `origin/develop`), the function now detects remote tracking branches and creates a local branch tracking them instead of setting a detached HEAD. Handles both explicit remote refs (`origin/develop`) and bare names (`develop`) that match a single remote branch.

**Modified:** src-tauri/src/commands/git.rs

## 2026-05-19 12:42 GST (Dubai)

### Git: Fix checkout UX for local changes conflicts

Fixed `git_checkout_remote` to do a safe checkout by default instead of unconditionally using `.force()` which silently discarded local changes. Added `force` parameter so the frontend can offer the same "Force checkout (discard local changes)" button for remote branches. Improved `friendlyGitError` to also catch git2's "would be overwritten" and "local changes" error messages as conflict indicators.

**Modified:** src-tauri/src/commands/git.rs, src/renderer/lib/ipc.ts, src/renderer/components/chat/BranchSelector.tsx

## 2026-05-19 11:49 GST (Dubai)

### Git: Add remote branch checkout with local tracking branch

Added a `git_checkout_remote` Rust command that creates a local tracking branch from a remote ref (e.g., "origin/feature-x" creates local "feature-x" tracking the remote). Updated the frontend BranchSelector to detect remote refs and call the new command instead of the generic checkout which left HEAD detached. Remote branches were already listed, displayed, and searchable; this fixes the checkout behavior.

**Modified:** src-tauri/src/commands/git.rs, src-tauri/src/lib.rs, src/renderer/lib/ipc.ts, src/renderer/components/chat/BranchSelector.tsx

## 2026-05-18 07:51 GST (Dubai)

### Sidebar: Fix projects imported without a name showing empty

Added a `getDisplayName` helper in `useSidebarTasks.ts` that strips trailing slashes before extracting the last path segment, and falls back to `'Untitled'` if the workspace string is empty or malformed. The old `ws.split('/').pop() ?? ws` pattern used `??` which doesn't catch empty strings.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`

## 2026-05-17 18:15 GST (Dubai)

### Goal: Validate and fix /goal autonomous loop behavior

Traced the full `/goal` flow and fixed three issues: (1) cancelled `stopReason` now pauses the goal instead of continuing the loop, (2) notifications are suppressed during active goal iterations to avoid spam, (3) notifications fire when the goal terminates (complete, budget-limited, or auto-paused). Added 16 integration tests validating goal vs normal message behavior, termination conditions, pause/resume, and cancelled turn handling. All 57 goal tests pass, build clean.

**Modified:**
- `src/renderer/stores/task-store-listeners.ts` — cancelled handling, notification suppression
- `src/renderer/stores/goal-integration.test.ts` — new integration test file (16 tests)

## 2026-05-17 17:59 GST (Dubai)

### Goal: Fix .kiro/goal folder creation and add status transition tests

Added `goal_ensure_dir` Tauri command that proactively creates `.kiro/goal/` with default templates when a project workspace is first opened (once per session). Previously the folder was only created when a goal was started. Also added 14 unit tests validating goal store status transitions (terminal state guards, lifecycle flows, auto-pause behavior). All 41 vitest tests and 13 Rust goal tests pass. Build clean.

**Modified:**
- `src-tauri/src/commands/goal.rs` — added `goal_ensure_dir` command + 2 Rust tests
- `src-tauri/src/lib.rs` — registered new command
- `src/renderer/lib/ipc.ts` — added `goalEnsureDir` IPC binding
- `src/renderer/stores/settingsStore.ts` — call `goalEnsureDir` on workspace activation
- `src/renderer/stores/goalStore.test.ts` — 14 new status transition tests

## 2026-05-17 11:02 GST (Dubai)

### Tests: Full test suite verification

Ran all Rust and frontend tests. Rust: 408 passed, 0 failed, 1 ignored. Frontend (Vitest): 78 test files, 1326 tests passed, 0 failed. No fixes needed.

**Modified:** None (verification only)

## 2026-05-17 10:59 GST (Dubai)

### CI: Fix vcs_status test failing in detached HEAD

The `vcs_status_works_on_real_repo` test asserted branch is non-empty, but GitHub Actions checks out in detached HEAD state. Removed the assertion since detached HEAD is valid; test now only verifies the call succeeds.

**Modified:** src-tauri/src/commands/vcs_status.rs

---

## 2026-05-17 10:49 GST (Dubai)

### Build: fix gitignore excluding SelectionToolbar from CI

The `.gitignore` had an unanchored `diff/` pattern that matched `src/renderer/components/diff/`, preventing `SelectionToolbar.tsx` from being tracked by git. Changed to `/diff/` to only ignore a root-level directory. Committed the missing file and pushed to fix CI.

**Modified:** `.gitignore`, `src/renderer/components/diff/SelectionToolbar.tsx`
