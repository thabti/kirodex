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
