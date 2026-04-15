# Activity Log

## 2026-04-15 15:11 GST (Dubai)

### PendingChat: Center worktree toggle, add icon and folder path hint

Centered the worktree toggle row, added a violet `IconGitBranch` icon next to the label, and added helper text showing the resolved worktree folder path (`.kiro/worktrees/<slug>`). Slug input changed from `flex-1` to fixed `w-48` for balanced centering.

**Modified:** `src/renderer/components/chat/PendingChat.tsx`

## 2026-04-15 15:06 GST (Dubai)

### Fix(taskStore): Preserve client-side thread name from ACP task_update overwrites

Fixed a bug where renaming a thread would get reset moments later. The ACP backend sends `task_update` events carrying the original creation-time name; `upsertTask` was spreading the backend object as the base, overwriting the user's rename. Added `name` preservation logic (same pattern as `messages` and `parentTaskId`): once a task exists locally, the client-side name is always kept.

**Modified:**
- `src/renderer/stores/taskStore.ts` — added `name` preservation in `upsertTask`

## 2026-04-15 15:00 GST (Dubai)

### DebugPanel: Add JS Debug tab with console, error, network, and Rust log capture

Added a tabbed interface to the debug panel with two tabs: "Kiro Debug" (existing protocol debug) and "JS Debug" (new). The JS Debug tab captures `console.log/warn/error`, `window.onerror`, `unhandledrejection`, all fetch/XHR network requests with method/URL/status/duration, and Rust backend `log::*` calls via `tauri-plugin-log` with `LogTarget::Webview`. Entries are displayed in a virtualized list with full search, category filter (log, warn, error, exception, network, rust), errors-only toggle, copy-all, and clear. Interceptors are installed once at startup in `main.tsx` before React renders.

**Modified:**
- `src/renderer/types/index.ts` — added JsDebugCategory (incl. 'rust') and JsDebugEntry types
- `src/renderer/stores/jsDebugStore.ts` — new store with rAF batching (2000 entry cap)
- `src/renderer/lib/jsInterceptors.ts` — console/error/fetch/XHR/Rust-log interceptors
- `src/renderer/components/debug/KiroDebugTab.tsx` — extracted from DebugPanel
- `src/renderer/components/debug/JsDebugTab.tsx` — new JS debug tab component
- `src/renderer/components/debug/DebugPanel.tsx` — refactored to thin shell with tabs
- `src/renderer/main.tsx` — install JS interceptors before React render
- `src-tauri/src/lib.rs` — enabled LogTarget::Webview for tauri-plugin-log
- `src-tauri/capabilities/default.json` — added log:default permission
- `package.json` / `bun.lock` — added @tauri-apps/plugin-log dependency

## 2026-04-15 15:04 GST (Dubai)

### Fix: Worktree feature audit — bug fixes and unit tests

Fixed three bugs found during code review: (1) useSidebarTasks structural sharing now compares worktreePath, (2) WorktreePanel accepts raw input with slugified preview instead of running slugify on every keystroke, (3) PendingChat and WorktreePanel clean up orphaned worktrees if gitWorktreeSetup fails. Added 15 new tests: WorktreeCleanupDialog (5 tests covering render states and button actions), taskStore worktree cleanup (10 tests covering archiveTask/softDeleteTask worktree checks, auto-removal, dirty worktree pending state, and resolveWorktreeCleanup). All 592 tests pass across 49 files.

**Modified:**
- `src/renderer/hooks/useSidebarTasks.ts` — added worktreePath to structural sharing equality check
- `src/renderer/components/chat/SlashPanels.tsx` — WorktreePanel: raw input + slug preview + partial cleanup
- `src/renderer/components/chat/PendingChat.tsx` — orphaned worktree cleanup on setup failure
- `src/renderer/components/sidebar/WorktreeCleanupDialog.test.tsx` — new test file (5 tests)
- `src/renderer/stores/taskStore.test.ts` — added worktree IPC mocks + 10 cleanup tests

## 2026-04-15 14:57 GST (Dubai)

### TaskStore: Hide deleted threads from sidebar on app restart

Fixed `loadTasks` so soft-deleted threads no longer reappear in the sidebar after restart. Two changes: (1) `deletedTaskIds` is now populated from persisted soft-deleted thread IDs, preventing `upsertTask` from re-adding them via ACP events. (2) Soft-deleted task IDs are removed from the `tasks` map built from `listTasks()`. Archived threads (`isArchived: true` still in `tasks{}`) remain visible.

**Modified:** `src/renderer/stores/taskStore.ts`

## 2026-04-15 14:46 (Dubai Time)

**Task:** audit_frontend_core — Read and report full contents of 6 renderer files
**Files read:**
1. `src/renderer/types/index.ts` — Full types including AgentTask, ProjectPrefs
2. `src/renderer/lib/ipc.ts` — Full IPC bindings including worktree commands
3. `src/renderer/lib/utils.ts` — cn, joinChunk, slugify, isValidWorktreeSlug
4. `src/renderer/lib/utils.test.ts` — Full test suite for all utils
5. `src/renderer/hooks/useSlashAction.ts` — Slash command handler hook
6. `src/renderer/hooks/useSlashAction.test.ts` — Full test suite for slash actions
**Status:** Complete — all file contents reported in full

## 2026-04-15 14:46 (Dubai) — Frontend UI Audit: Worktree & Branch Features

**Task:** Full read of 13 files related to branch/worktree UI features across the kirodex-tauri codebase.

**Files read:**
1. `src/renderer/components/chat/SlashPanels.tsx` — BranchPanel, WorktreePanel
2. `src/renderer/components/chat/SlashCommandPicker.tsx` — branch/worktree entries
3. `src/renderer/components/chat/EmptyThreadSplash.tsx` — branch/worktree entries
4. `src/renderer/components/chat/PendingChat.tsx` — full file
5. `src/renderer/components/chat/BranchSelector.tsx` — isWorktree prop
6. `src/renderer/components/chat/ChatInput.tsx` — isWorktree prop
7. `src/renderer/components/chat/ChatPanel.tsx` — isWorktree selector
8. `src/renderer/components/sidebar/ThreadItem.tsx` — worktree badge
9. `src/renderer/components/sidebar/WorktreeCleanupDialog.tsx` — full file
10. `src/renderer/hooks/useSidebarTasks.ts` — worktreePath
11. `src/renderer/stores/taskStore.ts` — worktreeCleanupPending, archiveTask, softDeleteTask, resolveWorktreeCleanup
12. `src/renderer/components/settings/SettingsPanel.tsx` — Worktrees section
13. `src/renderer/App.tsx` — WorktreeCleanupDialog
