## 2026-04-15 17:09 GST (Dubai)

### index.html + main.tsx: Remove error-fallback div

Removed the `#error-fallback` div from `index.html` and stripped the related DOM manipulation from `showError()` in `main.tsx`. The function now only logs to console. Also removed the reload/copy-error button wiring that referenced the removed elements.

**Modified:** index.html, src/renderer/main.tsx

---

## 2026-04-15 17:04 GST (Dubai)

### Cargo: Enable devtools in production builds

Added `"devtools"` feature flag to the `tauri` dependency so the WebView inspector is available in release builds.

**Modified:** src-tauri/Cargo.toml

---

## 2026-04-15 17:03 GST (Dubai)

### SidebarFooter: Improve update indicator dot styling

Changed the update indicator dot from a solid pulsing `bg-primary` circle to a two-layer emerald green dot with a soft ping animation. The outer ring fades in/out while the inner dot stays solid, giving a calmer, more polished look that doesn't read as "error red."

**Modified:** src/renderer/components/sidebar/SidebarFooter.tsx

---

# Activity Log

## 2026-04-15 17:00 GST (Dubai)

### CLAUDE.md: Add 7 engineering learnings from session

Extracted learnings from the session activity log and added them to CLAUDE.md's Engineering Learnings section: upsertTask name preservation from ACP overwrites, soft-delete persistence on reload, `bun test` vs `bun run test` runner mismatch, worktree cleanup on setup failure, stamping context on debug entries at creation time, tauri-plugin-log for Rust→WebView forwarding, and GitHub HTML nesting rules for block elements inside `<p>` tags.

**Modified:** `CLAUDE.md`, `activity.md`

## 2026-04-15 15:54 GST (Dubai)

### Tests: Suppress console.warn stderr noise in updateStore test

Fixed the `dismissVersion handles localStorage error gracefully` test that was leaking a `console.warn` to stderr. Added a `console.warn` spy to suppress the output and an assertion that the warning was called with the expected error.

**Modified:** `src/renderer/stores/updateStore.test.ts`

## 2026-04-15 15:56 GST (Dubai)

### Tests: Fix 246 failures from `bun test` runner mismatch

The 246 failures came from running `bun test` (Bun's native test runner) instead of `bun run test` (Vitest). Bun's runner doesn't provide jsdom, so all component tests failed with `ReferenceError: document is not defined`. Fixed by adding `bunfig.toml` with `[test] root = ".bun-test-noop"` to redirect `bun test` away from Vitest test files, plus a sentinel test that passes and tells users to use `bun run test`.

**Modified:** `bunfig.toml`, `.bun-test-noop/redirect.test.ts`, `activity.md`

## 2026-04-15 15:47 GST (Dubai)

### Commits: Review and organize all changes since v0.8.15

Reviewed all changes since v0.8.15 tag (4 existing commits + uncommitted changes). Created 3 additional feature-scoped commits for uncommitted work: debug tab thread/project filtering, website full content with changelog and deploy workflow, and activity log updates. Total of 7 commits since v0.8.15, all using conventional commit format.

**Modified:** `activity.md`

## 2026-04-15 15:46 GST (Dubai)

### DebugPanel: Add thread and project filters to JS Debug tab

Added thread and project filter dropdowns to the JS Debug tab, matching the Kiro Debug tab UX. Each JS debug entry is now stamped with the active taskId at capture time. The filter bar shows "All threads" / "All projects" dropdowns when entries have associated tasks.

**Modified:**
- `src/renderer/types/index.ts` — added optional `taskId` to JsDebugEntry
- `src/renderer/stores/jsDebugStore.ts` — added threadName/projectName to filter state
- `src/renderer/lib/jsInterceptors.ts` — stamp selectedTaskId on each entry
- `src/renderer/components/debug/JsDebugTab.tsx` — thread/project filter dropdowns + filtering logic

## 2026-04-15 15:55 GST (Dubai)

### JsDebugTab: Capture threadName and projectName on entries for reliable filtering

Updated JS debug interceptors to capture `threadName` and `projectName` directly on each `JsDebugEntry` at creation time (from the active task). Updated the filter logic in `JsDebugTab` to use these entry-level fields instead of looking up from the task store at render time, so filters work even after tasks are deleted.

**Modified:** `src/renderer/types/index.ts`, `src/renderer/lib/jsInterceptors.ts`, `src/renderer/components/debug/JsDebugTab.tsx`, `activity.md`

## 2026-04-15 15:55 GST (Dubai)

### Website: Add changelog page

Added `website/changelog.html` that fetches `CHANGELOG.md` from the repo at runtime and renders it as a styled timeline with color-coded categories (green for features, red for bug fixes, purple for styling, etc.). Added Changelog link to both the main page and changelog page navs. Updated deploy workflow to include the new page.

**Modified:** `website/changelog.html`, `website/index.html`, `.github/workflows/deploy-website.yml`, `activity.md`

## 2026-04-15 15:55 GST (Dubai)

### Website: Build Kirodex GitHub Pages site

Built a single-page dark-themed website in `website/` that matches the Kirodex app's design system. Includes hero with download CTA, 6 feature cards, screenshot gallery, platform install tabs with keyboard navigation, live download stats from `downloads.json`, and footer with sponsor. Added GitHub Actions deployment workflow and enabled GitHub Pages via `gh` CLI. Site will be live at `thabti.github.io/kirodex`.

**Modified:** `.gitignore`, `package.json`, `website/index.html`, `website/style.css`, `website/package.json`, `.github/workflows/deploy-website.yml`

## 2026-04-15 15:32 GST (Dubai)

### BranchSelector: Add back button and improve inline create UI

Added a back arrow button to return from the branch/worktree creation form to the action menu. Improved the inline form with a title header, descriptive helper text, better input focus ring styling, and a contextual Create button that shows the relevant icon (branch or fork) and "Creating..." state during submission.

**Modified:** src/renderer/components/chat/BranchSelector.tsx

## 2026-04-15 15:29 GST (Dubai)

### README: Fix screenshot images not rendering

Moved the `<table>` containing screenshots outside the `<p>` tag. Block-level elements inside `<p>` are invalid HTML and GitHub strips them, hiding the images.

**Modified:** README.md

## 2026-04-15 15:27 GST (Dubai)

### BranchSelector: Fix positioning and add new branch/worktree creation

Fixed popup z-index from `z-[200]` to `z-[9999]` and changed `left-0` to `right-0` so the popup aligns to the right edge of the toolbar. Added a persistent footer with "New branch" and "New worktree" action buttons that expand into inline input fields with a Create button. Worktree creation calls `gitWorktreeCreate` IPC. Esc cancels inline mode, second Esc closes the popup.

**Modified:** src/renderer/components/chat/BranchSelector.tsx

## 2026-04-15 15:28 GST (Dubai)

### README: Display screenshots side by side

Replaced the stacked `<p>` image layout with an HTML `<table>` so the two screenshots render side by side on GitHub. Also improved alt text for each image.

**Modified:** README.md

## 2026-04-15 15:26 GST (Dubai)

### PendingChat: Inline click-to-edit slug within worktree description

Moved the worktree slug input out of the checkbox row and into the description line itself. The description "Isolates this thread in .kiro/worktrees/<slug>" now always appears when worktree is checked. The slug portion is a clickable inline element with a pencil icon; clicking it reveals a small input field in-place. Press Enter/Escape or blur to close. Removes the separate input row for a cleaner layout.

**Modified:**
- `src/renderer/components/chat/PendingChat.tsx` — refactored worktree section to inline click-to-edit slug

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
