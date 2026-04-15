# Activity Log

## 2026-04-16 01:25 GST (Dubai)

### BranchSelector: detect worktree-locked branches, prevent checkout

Branches checked out in a worktree are now detected by the backend (`git_list_branches` iterates `repo.worktrees()` and collects their HEAD branches). These branches show a violet "worktree" badge and are disabled in the branch list. This prevents the git error "cannot force-update branch used by worktree" when trying to checkout a worktree branch from the main repo.

**Modified:** `src-tauri/src/commands/git.rs`, `src/renderer/lib/ipc.ts`, `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-16 01:20 GST (Dubai)

### BranchSelector: add force checkout for conflict errors

`git_checkout` now accepts an optional `force` parameter. When checkout fails due to uncommitted changes conflicting with the target branch, the error banner shows a "Force checkout (discard local changes)" button that retries with `force: true`. This uses `CheckoutBuilder::force()` in git2.

**Modified:** `src-tauri/src/commands/git.rs`, `src/renderer/lib/ipc.ts`, `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-16 01:16 GST (Dubai)

### BranchSelector: fix checkout not working, add worktree branch lock

Branch checkout was silently swallowing errors. Added visible error banner in the popup. For worktree threads, branch checkout is now disabled with a "Branch locked to this worktree" indicator; non-current branches are grayed out. Errors from `gitCheckout` and `gitCreateBranch` are displayed inline instead of only logged to console.

**Modified:** `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-16 01:13 GST (Dubai)

### Git: commit and push all changes

Committed 2 new changes (worktree confirmation dialog feat + activity log docs) and pushed all 15 commits to `origin/main`. No branch created; pushed directly to main as requested.

---

## 2026-04-16 01:12 GST (Dubai)

### Worktree: add confirmation dialog before deleting worktree threads

Refactored `softDeleteTask` and `archiveTask` so worktree threads show a confirmation dialog BEFORE deletion, not after. The dialog displays the branch name, checks for uncommitted changes (with a loading spinner), and warns with an amber icon if changes exist. Three actions: Cancel (no-op), Delete & remove worktree (destructive), Delete & keep worktree on disk. `resolveWorktreeCleanup` now performs the actual delete/archive when the user confirms. Non-worktree threads still delete immediately.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/components/sidebar/WorktreeCleanupDialog.tsx`, `src/renderer/components/sidebar/WorktreeCleanupDialog.test.tsx`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-16 01:05 GST (Dubai)

### Git: organize uncommitted changes into 11 conventional commits

Reviewed all 43 modified files and created 11 small, logical commits covering: steering rule cleanup, analytics docs, dependency additions (slugify, xterm-addon-web-links), types (projectId), lib worktree support, store refactoring (per-project config caching, projectIds, operationalWorkspace), Rust backend sandbox and worktree validation, UI components (TerminalDrawer refactor, PendingChat worktree UI, sidebar badges), hooks (worktree-aware grouping + tests), App.tsx workspace sync, and activity logs.

**Modified:** 43 files across 11 commits (+2391 / -986 lines)

## 2026-04-16 00:58 GST (Dubai)

### Worktree: fix CWD consistency for git operations in worktree threads

Added `operationalWorkspace` to `settingsStore` to distinguish between the project root (used for prefs/model lookup) and the actual working directory (worktree path for worktree threads). Fixed `BranchPanel` (`/branch` slash command) which was creating branches on the project root instead of the worktree. Audited all `activeWorkspace` usages; all other components correctly source workspace from `task.workspace` via props. Added 4 new tests and updated 5 existing tests. All 660 tests pass, type check and build clean.

**Modified:** `src/renderer/stores/settingsStore.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/App.tsx`, `src/renderer/components/chat/SlashPanels.tsx`, `src/renderer/stores/settingsStore.test.ts`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-16 00:25 GST (Dubai)

### Tests: add unit tests for worktree metadata merge on reload

Added four tests covering the `loadTasks` worktree metadata merge fix: (1) merges `worktreePath`, `originalWorkspace`, `projectId`, `parentTaskId` from archived onto live tasks, (2) does not overwrite existing metadata on live tasks, (3) excludes worktree paths from the projects array after merge. Added one `useSidebarTasks` test: worktreePath in the projects array is filtered from top-level rendering.

**Modified:** `src/renderer/stores/taskStore.test.ts`, `src/renderer/hooks/useSidebarTasks.test.ts`

## 2026-04-16 00:21 GST (Dubai)

### Bugfix: worktree threads rendering as top-level projects after reload

Fixed worktree (thread) tasks appearing as separate top-level projects in the sidebar after app reload. Root cause: `loadTasks()` built the projects array from live backend tasks before merging persisted history. Live worktree tasks from the backend don't carry `projectId`, `originalWorkspace`, or `worktreePath`; those fields are frontend-only and persisted in history. The merge logic only added archived tasks when no live task existed, so live worktree tasks lost their parent project association.

Fix: (1) Merge worktree metadata (`worktreePath`, `originalWorkspace`, `projectId`, `parentTaskId`) from archived history onto live tasks during `loadTasks`. (2) Derive the `projects` array after the merge so worktree tasks use the restored `originalWorkspace`. (3) Added `worktreePath` to the `worktreeWorkspaces` filter set in `useSidebarTasks` as a defensive measure.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useSidebarTasks.ts`

## 2026-04-16 00:17 GST (Dubai)

### Chat: always strip report JSON from messages

Updated `stripReport` to remove report-like JSON blocks based on regex shape matching (status + summary fields) without requiring valid `JSON.parse`. Both `AssistantTextRow` and `MessageItem` now always call `stripReport` on non-streaming messages, so raw JSON never leaks into the chat even when the report can't render as a `TaskCompletionCard`.

**Modified:** `src/renderer/components/chat/TaskCompletionCard.tsx`, `src/renderer/components/chat/AssistantTextRow.tsx`, `src/renderer/components/chat/MessageItem.tsx`

## 2026-04-16 00:14 GST (Dubai)

### TerminalDrawer: add close panel button to header bar

Added a chevron-down close button to the terminal drawer header bar that toggles the terminal panel off. The button uses the existing `toggleTerminal` store action, passed via a new `onClose` prop from ChatPanel.

**Modified:** `src/renderer/components/chat/TerminalDrawer.tsx`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-16 00:11 GST (Dubai)

### Button: add pink variant

Added a `pink` button variant with theme tokens for both light (`#ec4899`) and dark (`#f472b6`) modes. Registered `--color-pink` and `--color-pink-foreground` in the Tailwind theme and added the variant to the CVA config in `button.tsx`.

**Modified:** `src/tailwind.css`, `src/renderer/components/ui/button.tsx`

## 2026-04-16 00:08 GST (Dubai)

### Chat: always strip kirodex-report block from visible text

Decoupled report stripping from card rendering. Previously, the report block was only stripped when `shouldRenderReportCard` returned true (status==='done' AND filesChanged non-empty). Now the report fence is always stripped when a valid report is parsed, and the card only renders when filesChanged has items.

**Modified:** src/renderer/components/chat/AssistantTextRow.tsx, src/renderer/components/chat/MessageItem.tsx

## 2026-04-16 00:06 GST (Dubai)

### Terminal: close button on every tab + proper split divider

Added a small X close button on every terminal tab (visible on hover via group/tab). Replaced the CSS grid gap-px split layout with a flex layout using a proper 1px border divider between split panes.

**Modified:** src/renderer/components/chat/TerminalDrawer.tsx

## 2026-04-15 23:58 GST (Dubai)

### Terminal: fix toggle button on PendingChat screen

The terminal toggle button was a no-op when no task was selected (PendingChat / new thread screen). Added `isWorkspaceTerminalOpen` state and `toggleWorkspaceTerminal` action to taskStore. Updated AppHeader button and keyboard shortcut to fall back to workspace-level toggle. Added TerminalDrawer render to PendingChat.

**Modified:** src/renderer/stores/taskStore.ts, src/renderer/components/AppHeader.tsx, src/renderer/components/chat/PendingChat.tsx, src/renderer/hooks/useKeyboardShortcuts.ts

## 2026-04-16 00:03 GST (Dubai)

### Sidebar: deduplicate project list by both projectId and cwd

Strengthened the deduplication in `useSidebarTasks` to track both `pid` and `ws` (cwd) in separate sets. The previous fix only checked `pid`, but duplicate workspace paths in the `projects` array still produced entries with the same `cwd` used as the React key.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`

## 2026-04-16 00:00 GST (Dubai)

### Bugfix: fix duplicate React key and invalid SVG calc() errors

Fixed two console errors: (1) `useSidebarTasks` could produce duplicate project entries when the `projects` array contained multiple workspace paths mapping to the same `projectId` — added a `seen.has(pid)` guard in the first loop. (2) `DragOverlay.tsx` used `calc(100% - 4px)` in SVG `<rect>` `width`/`height` attributes, which is invalid SVG — moved to CSS `style` properties where `calc()` is supported.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/chat/DragOverlay.tsx`

## 2026-04-15 23:55 GST (Dubai)

### SlashCommands: add /branch and /worktree to picker

Added `/branch` and `/worktree` entries to the `clientCommands` array in `useChatInput.ts`. The panels and action handlers already existed; they were just missing from the command list shown when typing `/`.

**Modified:** src/renderer/hooks/useChatInput.ts

## 2026-04-16 00:00 GST (Dubai)

### Terminal: modernized UI referencing T3 Code's implementation

Rewrote TerminalDrawer to match T3 Code's terminal patterns. Added a proper header bar with Terminal label, count badge, and always-visible tab strip with activity dots (green indicator for background output). Added clear terminal button, link detection via xterm-addon-web-links (clickable URLs), collapsible terminal with chevron toggle, max 4 splits per group enforcement, active split ring indicator, and styled process exit message. Removed the dated floating action buttons and sidebar-only-on-multiple-tabs pattern.

**Modified:** src/renderer/components/chat/TerminalDrawer.tsx, package.json, bun.lock

## 2026-04-15 23:52 GST (Dubai)

### ChatInput: removed collapse button from toolbar

Removed the "Collapse chat input" chevron-down button from the footer toolbar in ChatInput. The expand button (shown when input is already collapsed) was left intact.

**Modified:** src/renderer/components/chat/ChatInput.tsx

## 2026-04-15 22:22 GST (Dubai)

### Slash commands: verified /branch and /worktree are fully implemented

Investigated the slash command system end-to-end. Both `/branch` and `/worktree` commands are already wired through all layers: `useSlashAction.ts` (panel toggle), `SlashCommandPicker.tsx` (icons + descriptions), `SlashPanels.tsx` (BranchPanel and WorktreePanel components), `SlashActionPanel` dispatcher, IPC wrappers, Rust backend commands, and types. TypeScript type check and Vite build both pass with zero errors.

**Modified:** No files changed; existing implementation is complete.

## 2026-04-15 22:22 (Dubai Time)
- **Task**: Read and summarize Rust backend files for git and worktree operations
- **Files read**: 
  - `src-tauri/src/commands/git.rs`
  - `src-tauri/src/lib.rs`
- **Result**: Complete file contents retrieved and summarized

## 2026-04-16 00:42 (Dubai)

**Fix Cmd+Shift+V raw paste in ChatInput**

- Problem: Cmd+Shift+V wasn't bypassing the `[Pasted text …]` placeholder. The old approach used global `window` keydown/keyup listeners to track Shift state, which was unreliable (events could be missed if focus changed).
- Fix: Replaced global window listeners with listeners attached directly to the textarea element. Also added a `blur` listener to reset the ref, preventing stale state. The `handleDown` now checks `e.shiftKey` (true for any key combo involving Shift) instead of only `e.key === 'Shift'`.
- File changed: `src/renderer/hooks/useChatInput.ts`
