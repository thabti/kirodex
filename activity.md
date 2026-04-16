# Activity Log

## 2026-04-16 12:00 GST (Dubai)

### Website: adopt minimal t3-style layout with big hero image

Redesigned the website landing page to match the ultra-minimal t3.codes layout: bold headline, single macOS download button, "Other platforms" link, and a prominent full-width app screenshot. Removed features grid, screenshots gallery, install tabs, and stats section. Darkened theme to near-black. Updated changelog.html nav/footer for consistency.

**Modified:** `website/index.html`, `website/style.css`, `website/changelog.html`

## 2026-04-16 02:56 GST (Dubai)

### SystemMessageRow: restyle info and error variants to muted inline style

Changed the remaining two system message variants to match the subtle fork/worktree style. The info variant lost its blue pill (`rounded-full border-blue bg-blue`) and the default error variant lost its destructive box (`rounded-lg border-destructive bg-destructive`). Both now use `text-[12px] text-muted-foreground/60` with `size-3.5` icons and no border or background.

**Modified:** `src/renderer/components/chat/SystemMessageRow.tsx`

## 2026-04-16 02:53 GST (Dubai)

### SystemMessageRow: restyle worktree bubble to match fork system-message style

Replaced the violet pill styling (rounded-full, border-violet, bg-violet) on the worktree system message with the same subtle muted inline style used by the fork variant: `text-muted-foreground/60`, smaller icon (`size-3.5`), no border or background. Slug and branch names use `text-muted-foreground/80` for slight emphasis.

**Modified:** `src/renderer/components/chat/SystemMessageRow.tsx`

## 2026-04-16 02:45 GST (Dubai)

### AppHeader: add cross-platform support for Windows and Linux

Added platform detection to AppHeader so padding and margins adapt per OS. macOS keeps the 74px left padding for traffic lights. Windows and Linux get 2px left padding and 138px right padding to accommodate the WindowsControls (minimize/maximize/close). The WindowsControls component renders fixed top-right on non-macOS. Keyboard shortcut hints now show Ctrl+B instead of ⌘B on Windows/Linux. HeaderFallback updated to match.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-16 02:41 GST (Dubai)

### AppHeader: fix dark mode background mismatch

Changed header background from `bg-card` (#141414) to `bg-background` (#0D0D0D) so the header blends with the window background in dark mode instead of appearing as a lighter strip.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-16 02:29 GST (Dubai)

### Window: fix macOS traffic lights disappearing on focus loss

Added `reposition_traffic_lights()` function that re-positions the native close/minimize/zoom buttons using `standardWindowButton_` on every `Focused` window event. macOS resets their position when the window gains or loses key status, causing them to be clipped by the content view's corner radius mask (`setMasksToBounds: true`).

**Modified:** `src-tauri/src/lib.rs`

## 2026-04-16 02:28 GST (Dubai)

### AppHeader: fine-tune vertical alignment with native macOS traffic lights

Refined the header alignment by adding `pt-[6px]` and `box-content` back to the AppHeader. The previous change (removing all top padding) placed the header content too high — flush with the top of the window. With `trafficLightPosition: {x:13, y:13}`, the traffic lights start at y=13. Adding 6px of top padding pushes the header content area down so its top edge aligns with the traffic light top edge, creating a visually balanced layout. The total header height is now 44px (6px padding + 38px content).

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-16 02:24 GST (Dubai)

### AppHeader: align content vertically with native macOS traffic lights

Removed `pt-[28px]` and `box-content` from the AppHeader and its fallback. The header was previously 66px total (38px content + 28px top padding), pushing header content well below the native macOS traffic lights. With `titleBarStyle: 'Overlay'` and `trafficLightPosition: {x:13, y:13}`, the traffic lights are centered at ~y=19. The 38px header (without top padding) centers its content at y=19, perfectly aligning with the traffic lights. The `pl-[76px]` left padding is kept to avoid horizontal overlap.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-16 02:21 GST (Dubai)

### TrafficLights: improve CSS for more native macOS appearance

Refined the traffic light button styles in `tailwind.css` for a more realistic macOS look. Switched from radial gradients to linear gradients (top-to-bottom), added inner highlight and shadow via `box-shadow` for a glass-like 3D effect, added subtle outer shadow for depth, improved the active state with an inset shadow, updated unfocused state colors for both light and dark mode, hid symbols when the window is unfocused, and added `line-height: 0` to the symbol span for better icon centering.

**Modified:** `src/tailwind.css`

## 2026-04-16 01:56 GST (Dubai)

### AppHeader: replace native traffic lights with custom HTML controls

Disabled native window decorations (`decorations: false` in tauri.conf.json) and integrated the existing `TrafficLights` component directly into `AppHeader` for macOS, replacing the `pl-[76px]` spacer. Added `WindowsControls` after `UserMenu` for Windows/Linux. Adjusted WindowsControls button height to match the 38px header. This eliminates the traffic light positioning inconsistency between dev and build modes.

**Modified:** `src-tauri/tauri.conf.json`, `src/renderer/components/AppHeader.tsx`, `src/renderer/components/unified-title-bar/WindowsControls.tsx`

## 2026-04-16 01:34 GST (Dubai)

### Theme: change primary color from indigo to blue-500

Updated `--primary` and `--ring` CSS variables in `tailwind.css` from indigo (#6366f1) to blue-500 (#3b82f6) in light mode, and from indigo-400 (#818cf8) to blue-400 (#60a5fa) in dark mode. This affects all buttons, switches, checkboxes, badges, links, and other elements using the `primary` token. Violet/purple icon colors in components are left unchanged per request.

**Modified:** `src/tailwind.css`

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
