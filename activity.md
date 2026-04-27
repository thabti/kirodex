# Activity Log

## 2026-04-27 18:55 GST (Dubai)
### History: Lazy-hydrate archived threads with metadata-only sidebar
Reworked the history-store to stop eagerly inflating archived threads at startup. `loadTasks` now projects every persisted thread to a lightweight `ArchivedThreadMeta` (id, name, timestamps, messageCount, project metadata) and stores it in a new `archivedMeta` map on the task store. Full message arrays are only inflated by the new `hydrateArchivedTask(id)` action when the user actually opens a thread. `setSelectedTask` triggers hydration on demand, and `softDeleteTask` hydrates archived metadata first so the soft-delete entry retains full content. `saveThreads` learned to preserve unloaded archived entries on disk by merging the existing array with current live tasks (controlled by a new `keepArchivedIds` parameter from the caller). Sidebar `useSidebarTasks` projects both `tasks` and `archivedMeta` into the same `SidebarTask` shape so the user sees no UX change. Memory section gained an "Archived" stat card. Replaced the archive icon in the sidebar `ThreadItem` with a lock icon plus tooltip to make read-only state explicit. For 500 archived threads × 100 messages × 500 B avg, this drops in-memory cost from ~25 MB to ~100 KB.

**Modified:** `src/renderer/lib/history-store.ts`, `src/renderer/lib/thread-memory.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.test.ts`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/settings/memory-section.tsx`

## 2026-04-27 18:35 GST (Dubai)
### Terminal: Per-window PTY scoping, lower scrollback default, idle auto-close
Reworked PTY lifecycle for memory: PtyState is now keyed by window label (nested HashMap) so closing one window only kills its terminals, fixing a cross-window kill bug where any close drained all PTYs globally. Added `kill_window_ptys` to the secondary-window close path so terminal threads no longer outlive their webview. New `pty_count` IPC command surfaces live PTY count per window. Lowered the default `SCROLLBACK_LINES` from 5 000 to 2 000 (~60% per-terminal reduction) and exposed it as `terminalScrollback` (200–20 000) in Settings → Memory. Added opt-in `terminalAutoCloseIdleMins` that closes background tabs after N minutes of no PTY data — never the active tab, never the last tab. Memory section now shows open PTY count and a scrollback budget estimate.

**Modified:** `src-tauri/src/commands/pty.rs`, `src-tauri/src/lib.rs`, `src/renderer/components/chat/TerminalDrawer.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/components/settings/memory-section.tsx`, `src/renderer/components/settings/settings-shared.tsx`, `src/renderer/lib/ipc.ts`, `src/renderer/types/index.ts`

## 2026-04-27 17:50 GST (Dubai)
### Settings: Thread memory monitor + audit
Added a new "Memory" section under Settings → Data that estimates per-thread memory held by the renderer (messages, tool-call payloads, live-turn buffers, queued messages, soft-deleted threads, drafts, debug logs). Auto-refreshes every 2 s, exposes a JS heap readout when `performance.memory` is available, and provides one-click reclaim actions: purge all soft-deleted threads immediately (instead of waiting 48 h) and clear the in-memory ACP / JS console log buffers. Added `purgeAllSoftDeletes` action to the task store. Pure renderer work; no Rust changes.

**Modified:** `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/components/settings/settings-shared.tsx`, `src/renderer/components/settings/memory-section.tsx` (new), `src/renderer/lib/thread-memory.ts` (new), `src/renderer/stores/taskStore.ts`, `src/renderer/stores/task-store-types.ts`

## 2026-04-27 13:57 GST (Dubai)
### Chat: Move question cards to bottom of message
Moved QuestionCards below ReactMarkdown in ChatMarkdown.tsx so the interactive question UI renders after the message text. Previously it appeared at the top, scrolling out of view when the agent wrote long responses below the questions.

**Modified:** `src/renderer/components/chat/ChatMarkdown.tsx`

## 2026-04-27 12:29 GST (Dubai)
### Notifications: Persistent sidebar badges for background activity
Improved notification handling so `notifiedTaskIds` persist until the user navigates to the thread. Window focus no longer clears them. Added an orange dot badge in the sidebar `ThreadItem` for threads with pending notifications. The badge clears when the user clicks the thread (via `setSelectedTask`) or clicks a native notification.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/stores/taskStore.ts`

## 2026-04-27 11:42 GST (Dubai)
### App: Fix unwanted thread switching on window focus
Removed the window focus handler that auto-navigated to the last notified task whenever the app regained focus. This caused the user to be yanked to a different project's thread unexpectedly. The handler now clears the notification badge array without switching threads. Clicking a native notification still navigates as expected.

**Modified:** `src/renderer/App.tsx`

## 2026-04-27 11:38 GST (Dubai)
### Chat: Redesigned CleaningReviewCard component
Created a compact cleaning review/rating card with visible amber stars (hover/focus states, scale animations), avatar with initials fallback, date + cleaning ID metadata row, rating label badge that animates in, and a thank-you footer on submit. Full accessibility: semantic `article` element, ARIA `radiogroup` for stars, `aria-live` regions for dynamic content, keyboard navigation on every interactive element, and proper focus-visible outlines.

**Modified:** `src/renderer/components/chat/CleaningReviewCard.tsx`

## 2026-04-27 11:37 GST (Dubai)
### Sidebar: blue dot indicator for pending questions
Added a blue dot on sidebar thread items when the last assistant message has unanswered structured questions (`[N]:` format). Computed via `computeHasPendingQuestion()` in `useSidebarTasks.ts` with structural sharing. The blue dot overrides the task status dot, giving a clear visual signal: green = active, blue = question pending, amber = permission needed.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/sidebar/ThreadItem.tsx`

## 2026-04-27 11:35 GST (Dubai)
### Zoom: add webview zoom level limits (50%–100%)
Created `useZoomLimit` hook that clamps the Tauri webview zoom between 50% and 100%. Intercepts Ctrl+wheel (trackpad pinch-to-zoom) and Cmd+/- keyboard shortcuts, preventing the UI from zooming beyond bounds. Cmd+0 resets to 100%.

**Modified:** `src/renderer/hooks/useZoomLimit.ts`, `src/renderer/App.tsx`

## 2026-04-27 11:25 GST (Dubai)
### WhatsNewDialog: fix issues from code and user flow audit
Fixed 6 issues found by parallel audit agents: (1) fresh install guard — seeds lastSeenChangelogVersion without showing dialog, (2) fallback changelog lookup for patch releases, (3) updates lastSeen even when no entry found, (4) prevents overlap with UpdateAvailableDialog, (5) added focus-visible ring to X button for keyboard accessibility, (6) removed redundant sm:grid-cols-2 class.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/WhatsNewDialog.tsx`

## 2026-04-27 11:19 GST (Dubai)
### WhatsNewDialog: add "What's New" changelog dialog after app updates
Added a changelog dialog that appears once after a version upgrade. Shows the app icon, version number, bulleted highlights from the changelog, and two buttons: "Request feature" (opens GitHub issues) and "Got it" (dismisses and persists the seen version). Tracks `lastSeenChangelogVersion` in AppSettings via confy. Uses semver comparison to only trigger on upgrades.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/WhatsNewDialog.tsx`, `src/renderer/lib/changelog.ts`, `src/renderer/types/index.ts`

## 2026-04-26 15:39 GST (Dubai)
### CloneRepoDialog: UX polish for consistency and speed
Improved the clone dialog: auto-updates target path when URL changes, tracks parent dir separately so folder picker + URL paste work in any order, shortened placeholders, displays `~/` instead of full home path, resets state on close instead of on open, cleaner title ("Clone repository").

**Modified:** `src/renderer/components/CloneRepoDialog.tsx`

## 2026-04-26 15:31 GST (Dubai)
### Git: add Clone from GitHub to File menu
Added "Clone from GitHub…" (Cmd+Shift+O) to the native File menu. A modal dialog accepts HTTPS or SSH repository URLs, lets the user pick a target directory via the native folder picker, shows a loading spinner during clone, displays errors inline, and auto-opens the cloned project on success. Backend uses the system `git` binary (not git2) for full SSH agent and credential helper support.

**Modified:** `src-tauri/src/commands/git.rs`, `src-tauri/src/lib.rs`, `src/renderer/App.tsx`, `src/renderer/components/CloneRepoDialog.tsx`, `src/renderer/lib/ipc.ts`

## 2026-04-26 15:29 GST (Dubai)
### HeaderToolbar: fix split view tooltip
Changed the split toggle button tooltip from "compare two threads" to "work on two threads at once" to accurately describe the feature's purpose.

**Modified:** `src/renderer/components/header-toolbar.tsx`

## 2026-04-26 14:54 GST (Dubai)
### EmptyState: add features showcase section
Added a six-card features grid below the CTA button in the empty state screen. Cards highlight Split view, Spin threads, Git worktrees, Inline diffs, Built-in terminal, and Slash commands with colored Tabler icons, labels, descriptions, and hover animations. Uses a 2-column grid with `border-border/50` cards and `group-hover:scale-110` icon transitions.

**Modified:** `src/renderer/App.tsx`

## 2026-04-26 04:44 GST (Dubai)
### Update dialog: fix z-index conflict with settings panel
The update button and its modal were unclickable when the settings panel was open because both used z-50. Bumped UpdateAvailableDialog and RestartPromptDialog to z-[60] via a new `overlayClassName` prop on DialogContent. Refactored UpdatesCard and AboutDialog to use the store's `triggerDownload`/`triggerRestart` instead of creating separate Update objects, and close settings when a download starts so the dialog takes over. Fixed useUpdateChecker to re-check when another component sets status to 'available' with a stale pendingUpdateRef.

**Modified:** `src/renderer/components/ui/dialog.tsx`, `src/renderer/components/UpdateAvailableDialog.tsx`, `src/renderer/components/sidebar/RestartPromptDialog.tsx`, `src/renderer/components/settings/updates-card.tsx`, `src/renderer/components/settings/AboutDialog.tsx`, `src/renderer/hooks/useUpdateChecker.ts`

## 2026-04-26 04:43 GST (Dubai)
### Split view: performance audit of per-panel selectors
Audited all new selectors for re-render regressions. Fixed five issues: (1) AutoApproveToggle had a stale closure where the settingsStore selector captured `panelWorkspace` from a previous render; split into separate primitive subscriptions. (2) ChatPanel.isPlanMode called `useSettingsStore.getState()` inside a taskStore selector, creating a stale cross-store read; split into two separate subscriptions combined in render. (3) Every component repeated a 3-hook pattern to resolve the panel task ID; created `usePanelResolvedTaskId()` that skips the `selectedTaskId` subscription when panel context is set. (4) Confirmed WorkingRow/GeneratingIndicator are not hot-path (render once per streaming session, not per token). (5) ModelPicker keeps two subscriptions but both return primitives so `Object.is` bail-out works. Single-panel mode has near-zero overhead: one `useContext` lookup (O(1)) plus one extra primitive selector per component.

**Modified:** `src/renderer/components/chat/PanelContext.tsx`, `src/renderer/components/chat/ModelPicker.tsx`, `src/renderer/components/chat/PlanToggle.tsx`, `src/renderer/components/chat/AutoApproveToggle.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/chat/MessageItem.tsx`, `src/renderer/components/chat/PlanHandoffCard.tsx`, `src/renderer/components/chat/CompactSuggestBanner.tsx`, `src/renderer/components/chat/AgentPanel.tsx`

## 2026-04-26 04:22 GST (Dubai)
### Split view: isolate per-panel state (model, mode, project, btw)
Split view panels now have fully independent state. Previously, changing the model or mode in one panel would update the other because `currentModelId`, `currentModeId`, and `activeWorkspace` were global singletons. Created a `PanelContext` React context that provides each panel's task ID to all child components. Added `taskModels` map to taskStore (mirroring existing `taskModes`). Updated ModelPicker, PlanToggle, AutoApproveToggle, ChatInput, PlanHandoffCard, CompactSuggestBanner, WorkingRow, MessageItem, and AgentPanel to read per-task state via the panel context. BtwOverlay now only renders in the panel whose task entered btw mode. Streaming suppression during btw mode is also scoped per-task.

**Modified:** `src/renderer/components/chat/PanelContext.tsx` (new), `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/chat/ModelPicker.tsx`, `src/renderer/components/chat/PlanToggle.tsx`, `src/renderer/components/chat/AutoApproveToggle.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/SplitChatLayout.tsx`, `src/renderer/components/chat/PlanHandoffCard.tsx`, `src/renderer/components/chat/CompactSuggestBanner.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/chat/MessageItem.tsx`, `src/renderer/components/chat/AgentPanel.tsx`

## 2026-04-26 03:55 GST (Dubai)
### Analytics: slash command mode tracking and estimated token cost
Slash commands now record which mode (command vs plan) they were invoked in. The SlashCommandChart shows stacked horizontal bars with orange for command mode and purple for plan mode, with backward compatibility for legacy events. Added estimated token cost to the TokensChart using real Claude model pricing (Opus, Sonnet, Haiku tiers). Cost estimation uses the most-used model's pricing with a 75/25 input/output heuristic and displays as a stat row with a disclaimer.

**Modified:** `src/renderer/hooks/useSlashAction.ts`, `src/renderer/lib/analytics-aggregators.ts`, `src/renderer/components/analytics/SlashCommandChart.tsx`, `src/renderer/components/analytics/TokensChart.tsx`, `src/renderer/components/analytics/AnalyticsDashboard.tsx`

## 2026-04-26 03:45 GST (Dubai)
### Split view: fix split closing unexpectedly after drag-and-drop
When dragging a file from Finder, the app loses focus. If an agent turn ends during the drag, a notification fires and adds the task to `notifiedTaskIds`. On regaining focus, `handleWindowFocus` called `setSelectedTask` which unconditionally cleared `activeSplitId`, closing the split. Fixed `setSelectedTask` to be split-aware: if the target task is part of the active split, it focuses that panel instead of closing the split. Also made `navigateToNotifiedTask` check for split visibility before navigating.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/App.tsx`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-26 03:30 GST (Dubai)
### Sidebar: persist thread and project ordering across save/load/restart
Project order, thread order within projects, and sort preference now survive app restarts. `saveThreads` accepts the caller's project array instead of rebuilding from task iteration. `loadTasks` restores saved project order. Per-project `threadOrder` arrays are persisted in `SavedProject` and applied when sort is "Custom". Sort preference persists to localStorage. Thread context menu gains Move Up/Down items in custom sort mode.

**Modified:** `src/renderer/lib/history-store.ts`, `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`

## 2026-04-26 02:55 GST (Dubai)
### Git: commit all pending changes
Committed three groups of changes: header-toolbar terminal toggle simplification, website light/dark/system theme toggle with full CSS overrides, and BtwOverlay component tests. Added `website/.browse/` to `.gitignore`.

**Modified:** `src/renderer/components/header-toolbar.tsx`, `website/index.html`, `website/features.html`, `website/changelog.html`, `website/style.css`, `.gitignore`, `src/renderer/components/chat/BtwOverlay.test.tsx`

## 2026-04-26 02:54 GST (Dubai)
### SplitPanelHeader: add always-visible close button on right panel
Added a `side` prop to `SplitPanelHeader`. The right panel now shows an always-visible `IconX` close button, while the left panel keeps the hover-only `IconTrash`. Updated `SplitChatLayout` to pass `side='left'` and `side='right'` to each header.

**Modified:** `src/renderer/components/chat/SplitPanelHeader.tsx`, `src/renderer/components/chat/SplitChatLayout.tsx`

## 2026-04-26 02:20 GST (Dubai)
### SplitPanelHeader: replace X with bin icon, fix text overlap
Replaced the IconX close button with IconTrash in split view panel headers. Made the bin button absolutely positioned with a background color matching the panel state (bg-background for focused, bg-card/50 for unfocused) so text never shows through. Added padding-right on the task name that expands on hover, ensuring text truncates with ellipsis well before the bin icon. Bin icon turns red on hover for clear delete affordance.

**Modified:** `src/renderer/components/chat/SplitPanelHeader.tsx`

## 2026-04-26 02:15 GST (Dubai)
### AppHeader: fix missing toolbar in split view
The AppHeader workspace selector read `s.tasks[s.selectedTaskId]?.workspace` which could return null if selectedTaskId wasn't synced yet. Updated to derive the focused task from `focusedPanel` + `activeSplitId` in split view, and also use `originalWorkspace` as the primary workspace (for worktree threads). This ensures the toolbar (terminal, git, diff, open-in-editor) always renders in split view.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-26 06:30 GST (Dubai)
### Website: add dark/light/system theme toggle
Added a 3-mode theme toggle (sun/monitor/moon) to the nav bar on all 3 website pages. Light mode uses white background, dark text, and adapted cards/borders/scrollbars. System mode follows OS `prefers-color-scheme`. Theme persists via localStorage. Dark mode remains default. Ghost SVG inverts via CSS filter. Changelog timeline colors adapt via CSS classes. Early init script in `<head>` prevents flash.

**Modified:** `website/style.css`, `website/index.html`, `website/changelog.html`, `website/features.html`

## 2026-04-26 02:11 GST (Dubai)
### Header toolbar: fix terminal toggle to respect focused panel in split view
The terminal button in the header used `selectedTaskId` which could be stale if the user hadn't clicked inside a panel since the last focus change. Added a `focusedTaskId` selector that derives the correct task from `focusedPanel` + `activeSplitId` in split view, falling back to `selectedTaskId` in single-panel mode. The terminal open state check and toggle now both use `focusedTaskId`.

**Modified:** `src/renderer/components/header-toolbar.tsx`

## 2026-04-26 02:07 GST (Dubai)
### ChatPanel: fix steer duplicate message bug
Fixed the race condition causing steered messages to appear twice. Root cause: `handleSteer` called `removeQueuedMessage` AFTER `await ipc.pauseTask()`. The pause triggers an `onTurnEnd` event from the backend, which fires during the await. The `onTurnEnd` handler auto-sends the first queued message (still in the queue at that point). Then `handleSteer` continued and sent the same message again via `sendMessageDirect`. Fix: move `removeQueuedMessage` before the `await ipc.pauseTask()` call so the message is gone from the queue before the backend's turn-end event can auto-send it.

**Modified:** `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-26 02:06 GST (Dubai)
### MessageList: rewrite scroll position management
Rewrote the scroll behavior when navigating between threads. Root cause: `isNearBottomRef` persisted across thread switches, the restore-position effect raced with the auto-scroll effect, and raw `scrollTop = scrollHeight` fired before the virtualizer measured new content. Fix: introduced `pendingScrollRef` that queues either `'bottom'` (default for threads with no saved position) or a numeric saved position. The pending scroll executes after the virtualizer settles (two rAF frames). Auto-scroll now skips when a pending thread-switch scroll is queued. `scrollToBottom` uses `virtualizer.scrollToIndex(last, { align: 'end' })` for accurate positioning.

**Modified:** `src/renderer/components/chat/MessageList.tsx`

## 2026-04-26 06:08 GST (Dubai)
### Website: overhaul to Klack-style light theme
Rewrote the marketing website from dark theme to clean white minimalist aesthetic inspired by tryklack.com. Consolidated index.html and features.html into a single page with a large bold hero, concise feature grid (icon + one-liner), platform-detected download button, and minimal footer. Restyled changelog.html for light theme. Deleted features.html.

**Modified:** `website/style.css`, `website/index.html`, `website/changelog.html`
**Deleted:** `website/features.html`

## 2026-04-26 02:04 GST (Dubai)
### Tests: add unit tests for pin thread and split view focus isolation
Added 16 new tests covering pinThread (3), unpinThread (3), pin cleanup on deletion (2), and split view focus isolation (8). Focus isolation tests verify selectedTaskId sync without split deactivation, independent message scoping per panel, history cycling per thread, streaming chunk isolation, queued message isolation, clearTurn isolation, and cross-project split view scoping. All 208 tests pass.

**Modified:** `src/renderer/stores/taskStore.test.ts`

## 2026-04-26 01:56 GST (Dubai)
### Sidebar: add separator between pinned/split sections and projects
Added a thin centered 32px divider line between the split views/pinned threads sections and the project list. Only renders when there are split views or pinned threads. Also audited all remaining selectedTaskId reads; fixed BtwOverlay (now accepts taskId prop) and ChatInput compactionStatus selector (now uses taskId prop) — both were reading selectedTaskId at render time, causing wrong-panel data in split view.

**Modified:** `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/chat/BtwOverlay.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-26 01:54 GST (Dubai)
### Split view: fix focus isolation and navigation
Fixed six split view issues: (1) drag overlay showing on both panels instead of only the focused one, (2) question card answers targeting the wrong panel's task, (3) message history cycling reading the wrong task, (4) slash commands, mentions, and all selectedTaskId-dependent features now respect the focused panel, (5) clicking a thread that's part of a split view now activates the split view instead of navigating to the individual thread, (6) SplitChatLayout now syncs selectedTaskId on focus change without deactivating the split.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatMarkdown.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/QuestionCards.tsx`, `src/renderer/components/chat/SplitChatLayout.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/hooks/useAttachments.ts`, `src/renderer/hooks/useChatInput.ts`

## 2026-04-26 01:43 GST (Dubai)
### Split view: update terminology from "compare" to "work side-by-side"
Changed the split view tooltip in header-toolbar.tsx from "Split view · compare two threads" to "Split view · work side-by-side". Split view is for working on two threads simultaneously, not comparing them. Audited README, AGENTS.md, CLAUDE.md, and docs; no other compare language found for split view.

**Modified:** `src/renderer/components/header-toolbar.tsx`

## 2026-04-26 01:15 GST (Dubai)
### Sidebar: add pin thread feature
Added "Pin Thread" feature accessible via right-click context menu on threads. Pinned threads appear in a dedicated "Pinned" section above the project list (below split views) with an amber pin icon. Pins persist across app restarts via the history store. Threads are automatically unpinned when deleted.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/lib/history-store.ts`, `src/renderer/App.tsx`

## 2026-04-26 00:06 GST (Dubai)
### UpdateNotifier: convert toast to Radix Dialog modal
Replaced the Sonner toast-based update notification with a proper Radix Dialog modal featuring an X close button. The new `UpdateAvailableDialog` handles all three states (available, downloading with progress bar, ready to restart) in a single component, replacing both the `UpdateNotifier` function and the `RestartPromptDialog`.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/UpdateAvailableDialog.tsx`

## 2026-04-26 00:01 GST (Dubai)
### BtwOverlay: add unit tests
Added 11 unit tests for BtwOverlay covering: null checkpoint rendering, question display, thinking state, assistant response rendering, permission banner visibility (present/absent), permission option click calling `ipc.selectPermissionOption`, dismiss button, Escape key, backdrop click, and tool name display. All 803 tests pass across 54 files.

**Modified:** `src/renderer/components/chat/BtwOverlay.test.tsx`

## 2026-04-25 23:25 GST (Dubai)
### BtwOverlay: show permission requests inside btw side question view
The `/btw` overlay blocked all interaction with the ChatPanel underneath, so ACP permission requests were invisible during side questions. Added `PermissionBanner` rendering inside `BtwOverlay` itself; when a `pendingPermission` exists on the selected task, the banner appears between the response area and the footer hint. Uses the same `ipc.selectPermissionOption` call as ChatPanel.

**Modified:** `src/renderer/components/chat/BtwOverlay.tsx`

## 2026-04-25 22:59 GST (Dubai)
### Tests: add split view and scroll position unit tests
Added 252 lines of tests to `taskStore.test.ts` covering all new split view actions (`createSplitView`, `removeSplitView`, `setActiveSplit`, `setSplitRatio`, `closeSplit`), scroll position saving (`saveScrollPosition`), and interaction tests (`setSelectedTask` deactivating split, `removeTask` cleaning split views, `createDraftThread` and `setPendingWorkspace` deactivating split). All 792 tests pass across 53 files.

**Modified:** `src/renderer/stores/taskStore.test.ts`

## 2026-04-25 22:30 GST (Dubai)
### Split-screen: persistent split views that survive navigation
Refactored split-screen from ephemeral `splitTaskId` to persistent `splitViews` array model. Split pairings are now saved entries that survive thread creation and navigation. New store fields: `splitViews` (array of `{id, left, right, ratio}`), `activeSplitId` (which split is displayed). New actions: `createSplitView`, `removeSplitView`, `setActiveSplit`. Creating a new thread just deactivates the split without removing the pairing. Added "SPLIT VIEWS" section to the sidebar above projects showing all saved pairings with click-to-activate and X-to-remove.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/chat/SplitChatLayout.tsx`, `src/renderer/App.tsx`, `src/renderer/components/header-toolbar.tsx`, `src/renderer/components/chat/SplitThreadPicker.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/hooks/useKeyboardShortcuts.ts`, `src/renderer/lib/history-store.ts`

## 2026-04-25 22:24 GST (Dubai)
### Chat: remember scroll position per thread
Added in-memory scroll position tracking so switching between threads or views preserves where you left off. Saves `scrollTop` to a per-thread map in the task store on thread switch and unmount, restores it when switching back. Uses `isProgrammaticScrollRef` to prevent the restore from triggering the "not near bottom" state.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-25 22:20 GST (Dubai)
### Git: commit all pending changes in seven logical commits
Organized all uncommitted changes into seven conventional commits: split-screen core (store state, ChatPanel refactor, layout components), split-screen UI (toolbar toggle, thread picker, context menu), sidebar improvements (Move Up/Down replacing drag-to-reorder, thread jump labels), chat UI polish (container queries, compact dropdowns, context ring fix, row heights), keyboard shortcuts (Cmd+\\, Cmd+Shift+D, Cmd+1-9), tests (reorder and custom sort), and docs (README, website, activity log). Total: 29 modified files, 4 new files, ~1,070 additions, ~251 deletions.

**Modified:** `activity.md`

## 2026-04-25 18:00 GST (Dubai)
### Docs: update README and website with missing features
Added /btw side questions, /tangent alias, /fork, split-screen, multi-window, message queue, folder drag-drop, crash recovery, recent projects, Cmd+B shortcut, mode dropdown, and error state with retry to README.md. Updated website index.html with a multi-window feature card and message queue mention. Updated features.html with five new Chat cards, a multi-window section, crash recovery and recent projects in Settings, and corrected Cmd+N to "New window."

**Modified:** `README.md`, `website/index.html`, `website/features.html`

## 2026-04-25 17:44 GST (Dubai)
### AutoApproveToggle: make dropdown compact
Removed description text from dropdown items so each option is a single line (icon + label). Tightened padding, gap, and border radius. Removed min-width and flex-col wrapper.

**Modified:** `src/renderer/components/chat/AutoApproveToggle.tsx`

## 2026-04-25 17:18 GST (Dubai)
### Sidebar: hide disabled Move Up/Down instead of graying them out
Move Up is hidden when the project is first; Move Down is hidden when the project is last. Only actionable options appear in the context menu.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`

## 2026-04-25 17:12 GST (Dubai)
### Sidebar: replace drag-to-reorder with right-click Move Up/Down
Removed all pointer-based drag code (clone, grip handle, drop indicator, drag state). Added "Move Up" and "Move Down" to the project right-click context menu with boundary guards: disabled styling when the project is already at the top or bottom. Moving a project from any sort mode auto-switches to "Custom" sort. The move options only appear when there are two or more projects.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-25 17:10 GST (Dubai)
### Sidebar: thread numbers in Cmd-key overlay + Cmd+N jumps to thread
Each thread now shows its index (1, 2, 3...) within its project when Cmd is held. Cmd+1-9 jumps to the Nth thread in the active project instead of switching projects. Sort order in the shortcut handler matches the sidebar default (createdAt ascending).

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/hooks/useKeyboardShortcuts.ts`

## 2026-04-25 17:08 GST (Dubai)
### Split view: full width when active + blue dot indicator
When split view is active, the CodePanel (diff side panel) is now hidden so SplitChatLayout takes the full width. Added a blue dot indicator to the right of the split toggle button icon when split mode is on.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/header-toolbar.tsx`

## 2026-04-25 17:04 GST (Dubai)
### ChatInput: fix ContextRing counter overlapping textarea text
Added `bg-card` background to the ContextRing so it doesn't float transparently over text. Added a `hasContextRing` prop to ChatTextarea that applies `pr-8` right padding to the textarea when the ring is visible, preventing placeholder and typed text from running underneath the counter.

**Modified:** `src/renderer/components/chat/ContextRing.tsx`, `src/renderer/components/chat/ChatTextarea.tsx`, `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-25 17:08 GST (Dubai)
### Split-screen: behavior fixes and performance audit
Fixed behavior: new thread creation (`createDraftThread`) now exits split mode. Clicking a thread that's already in the split panel swaps it to the left panel (keeps split open). Audited all split components for memoization and selector performance. SplitChatLayout: replaced `onClick` with `onMouseDown` for focus, added bail-out guard to skip redundant `setFocusedPanel` calls. SplitPanelHeader: merged `projectNames` selector into a single selector returning only the needed string (was subscribing to the whole object). SplitDivider, ThreadItem isInSplit, ChatPanel taskId prop, SplitDropZone, SplitToggleButton: all clean, no changes needed. Fixed pre-existing missing `useEffect` import in TaskSidebar.tsx.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/components/chat/SplitChatLayout.tsx`, `src/renderer/components/chat/SplitPanelHeader.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-25 17:03 GST (Dubai)
### Split-screen: redesigned divider and panel headers for subtler UX
Redesigned the split divider and panel headers. Divider is now a single 1px border line (matching sidebar border style) with a tiny pill grip that grows on hover and turns blue on drag. Uses `before:` pseudo-element for a wider 8px hit target while keeping the visual at 1px. Panel headers are more subtle: no blue background on focus, instead a 2px accent bar at the bottom. Close button only appears on hover. Unfocused panel has dimmed `bg-card/50` background. Thread name is bold only when focused.

**Modified:** `src/renderer/components/chat/SplitDivider.tsx`, `src/renderer/components/chat/SplitPanelHeader.tsx`

## 2026-04-25 16:55 GST (Dubai)
### ChatToolbar: compact icons-only mode for narrow split panels
Added `@container/toolbar` query to ChatToolbar. When the toolbar container is narrower than 480px (typical in split-screen), PlanToggle, ModelPicker, AutoApproveToggle, and BranchSelector hide their text labels and chevrons, showing only icons. Full labels return when the panel is wide enough. Uses Tailwind CSS 4 `@container` queries with `@[480px]/toolbar:inline` and `@[480px]/toolbar:block`.

**Modified:** `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/chat/PlanToggle.tsx`, `src/renderer/components/chat/ModelPicker.tsx`, `src/renderer/components/chat/AutoApproveToggle.tsx`, `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-25 16:52 GST (Dubai)
### Split-screen: Chrome-style thread picker and unsplit
Replaced "Split left" / "Split right" context menu items with Chrome-style UX. Right-clicking a thread now shows "New split view" (opens a thread picker panel with search, project icons, and thread names sorted by recency) or "Unsplit" (if the thread is already in a split). The header toolbar split button also opens the picker instead of auto-selecting. Created `SplitThreadPicker` component with search input, scrollable thread list, and outside-click dismiss.

**Modified:** `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/header-toolbar.tsx`, `src/renderer/components/chat/SplitThreadPicker.tsx` (new)

## 2026-04-25 16:48 GST (Dubai)
### SplitDropZone: rewrite as hook for reliable drag detection
Rewrote SplitDropZone from a standalone overlay component to a `useSplitDrop` hook + `SplitDropOverlay` component. The hook attaches HTML5 drag handlers directly to the container div in App.tsx, avoiding pointer-events conflicts. Thread drags (HTML5 API with `text/x-kirodex-task-id`) and file drags (Tauri native `onDragDropEvent`) use separate event systems and coexist without interference.

**Modified:** `src/renderer/components/chat/SplitDropZone.tsx`, `src/renderer/App.tsx`

## 2026-04-25 16:35 GST (Dubai)
### Website: add split-screen, analytics, and recent features
Updated index.html with two new feature cards: "Split-screen" and "Analytics dashboard". Updated features.html with full split-screen section (six feature cards covering drag-to-split, right-click split, draggable divider, focus indicators, responsive behavior, keyboard shortcut), analytics dashboard section (three cards), plus subagent pipelines, image attachments, and message queue cards in the chat section. Added Cmd+\ to the keyboard shortcuts grid.

**Modified:** `website/index.html`, `website/features.html`

## 2026-04-25 16:31 GST (Dubai)
### ThreadItem: add "Split left" and "Split right" to context menu
Added two new context menu options on thread right-click: "Split left" places the thread in the left panel (swapping the current selected thread to the right), "Split right" opens it in the right split panel. Uses IconLayoutSidebar and IconLayoutSidebarRight icons. Options appear between Rename and Delete for non-draft threads.

**Modified:** `src/renderer/components/sidebar/ThreadItem.tsx`

## 2026-04-25 16:30 GST (Dubai)
### Split-screen: two chat panels side by side
Implemented split-screen mode for viewing two threads simultaneously. Added split state to taskStore (splitTaskId, splitRatio, focusedPanel) with persistence in history-store. Refactored ChatPanel to accept an optional taskId prop for reuse. Created SplitPanelHeader (project icon + thread name + focus indicator), SplitDivider (draggable with blue indicator, grip dots, double-click reset), SplitChatLayout (two panels with ResizeObserver auto-collapse), and SplitDropZone (drag thread from sidebar to open split). Added split toggle button to HeaderToolbar and Cmd+\ keyboard shortcut. Each panel has its own independent ChatInput. Minimum panel width of 400px enforced.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/lib/history-store.ts`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/SplitPanelHeader.tsx`, `src/renderer/components/chat/SplitDivider.tsx`, `src/renderer/components/chat/SplitChatLayout.tsx`, `src/renderer/components/chat/SplitDropZone.tsx`, `src/renderer/components/header-toolbar.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/hooks/useKeyboardShortcuts.ts`, `src/renderer/App.tsx`

## 2026-04-25 16:22 GST (Dubai)
### QueuedMessages: improve chevron reorder button UX/UI
Redesigned move up/down chevron buttons in the queued messages list. Increased icon size (3→3.5), added hover background (`hover:bg-accent`), replaced invisible disabled state (`opacity-0`) with visible-but-dimmed (`text-muted-foreground/30` + `cursor-not-allowed`), wrapped each button in a tooltip ("Move up"/"Move down"), improved aria-labels to include message text, and added `tabIndex` management for keyboard navigation.

**Modified:** `src/renderer/components/chat/QueuedMessages.tsx`

## 2026-04-25 16:21 GST (Dubai)
### Chat: fix tool calls and done text overlap
Increased virtualizer height estimates across all row types so initial layout doesn't overlap before measurement (assistant-text 80→100, work 52→64, changed-files 48→120, etc.). Increased squashed padding from `pb-1.5` to `pb-2.5` in AssistantTextRow and WorkGroupRow for consistent spacing between consecutive rows.

**Modified:** `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/AssistantTextRow.tsx`, `src/renderer/components/chat/WorkGroupRow.tsx`

## 2026-04-25 16:15 GST (Dubai)
### Sidebar: Cmd-key kbd hints on threads (⌘⇧[ / ⌘⇧])
Added `jumpLabel` prop to ThreadItem. When Cmd is held, the thread before the active one shows `⌘⇧[` and the thread after shows `⌘⇧]`, replacing the timestamp. Passed `isMetaHeld` from TaskSidebar → ProjectItem → ThreadItem.

**Modified:** `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-25 16:11 GST (Dubai)
### Sidebar: improve drag-to-reorder UX and add unit tests
Replaced the ring-based drag indicator with a thin 2px horizontal line (above/below) showing the exact insertion point. Added `bg-sidebar` to the drag clone so it's opaque. Fixed `sortTasks` to handle the `'custom'` key instead of falling through to recent sort. Added 4 `reorderProject` edge-case tests (no-op, adjacent forward/backward, last-to-first) and 4 custom sort tests (preserves store order, skips activity reorder, preserves task order). All 178 tests pass.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/hooks/useSidebarTasks.test.ts`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-25 16:09 GST (Dubai)
### Shortcuts: Cmd-key overlay for debug, settings, and send
Added kbd hints for Debug (`⌘⇧D`) and Settings (`⌘,`) in SidebarFooter when Cmd is held. Added `Cmd+Shift+D` shortcut to toggle the debug panel. Changed the chat focus shortcut from `Cmd+L` to `Cmd+Enter` and changed the toolbar hint from always-visible `⌘L` to `⌘⏎` shown only when Cmd is held.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/sidebar/SidebarFooter.tsx`, `src/renderer/hooks/useKeyboardShortcuts.ts`

## 2026-04-25 16:07 GST (Dubai)
### Git: unit tests for git_init feature
Added Rust tests (`git_init_creates_repo_in_empty_dir`, `git_init_succeeds_on_existing_repo`) and frontend tests for HeaderToolbar git init behavior (shows init button, shows diff stats, click transitions). All 21 Rust git tests and 3 frontend tests pass. Committed as `feat(git): add git init support for non-git projects`.

**Modified:** `src-tauri/src/commands/git.rs`, `src/renderer/components/header-toolbar.test.tsx`

## 2026-04-25 16:02 GST (Dubai)
### Sidebar: Cmd-key keymap helper overlay for project switching
Holding Cmd shows `⌘1`–`⌘9` kbd badges next to sidebar projects (first 9). Pressing Cmd+N jumps to the Nth project's most recent thread. Uses a `useModifierKeys` hook with 100ms delayed show / instant hide (T3 Code pattern) to prevent flicker. Replaced the previous Cmd+1-9 thread-jumping with project-jumping.

**Modified:** `src/renderer/hooks/useModifierKeys.ts` (new), `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/hooks/useKeyboardShortcuts.ts`

## 2026-04-25 16:00 GST (Dubai)
### Git: initialize git repo from header toolbar
Added `git_init` Tauri command (Rust) using `Repository::init()`, registered it in `lib.rs`, and wired the `gitInit` IPC function. Updated `HeaderToolbar` to detect non-git projects via `gitDetect` on mount; when no repo exists, an "Initialize Git" button replaces the diff stats toolbar. Clicking it initializes the repo and switches to the normal git toolbar.

**Modified:** `src-tauri/src/commands/git.rs`, `src-tauri/src/lib.rs`, `src/renderer/lib/ipc.ts`, `src/renderer/components/header-toolbar.tsx`

## 2026-04-25 15:56 GST (Dubai)
### Sidebar: drag-to-reorder projects with vertical-only constraint
Added a "Custom" sort option to the project list sort dropdown. When selected, a grip handle appears on each project and users can drag to reorder vertically. Replaced native HTML5 drag with pointer-event-based drag that constrains movement to the Y axis using a floating clone. The reordered state persists via the store's `reorderProject` action. Drag is disabled for all other sort modes.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/hooks/useSidebarTasks.ts`

## 2026-04-25 00:04 GST (Dubai)
### UpdateNotifier: fix duplicate toasts and style Sonner toasts
Fixed the update notification toast spawning 11+ duplicates by using a stable `UPDATE_TOAST_ID` constant instead of a ref-based ID; Sonner now deduplicates by ID. Added dark-themed CSS overrides for Sonner toasts (background, border, shadow, action button) using hardcoded hex values to avoid oklch() WebKit issues. Changed Toaster theme from `system` to `dark`.

**Modified:** `src/renderer/App.tsx`, `src/tailwind.css`

## 2026-04-25 00:04 GST (Dubai)
### Settings: convert all pages to compact two-column layout
Rewrote all six settings sections (Account, General, Appearance, Keyboard, Advanced, Archives) to use a new `SettingsGrid` component that places the section label and description in a fixed left column (200px) with controls on the right. Reduced padding, font sizes, and spacing throughout for a denser, more professional layout. Widened the content area from `max-w-2xl` to `max-w-4xl`.

**Modified:**
- `src/renderer/components/settings/settings-shared.tsx` — added `SettingsGrid`, made `SettingRow`/`SettingsCard`/`SectionHeader` more compact
- `src/renderer/components/settings/general-section.tsx` — 2-column grid layout
- `src/renderer/components/settings/appearance-section.tsx` — 2-column grid layout with icon
- `src/renderer/components/settings/advanced-section.tsx` — 2-column grid layout
- `src/renderer/components/settings/account-section.tsx` — 2-column grid layout
- `src/renderer/components/settings/keymap-section.tsx` — 2-column grid layout
- `src/renderer/components/settings/archives-section.tsx` — 2-column grid layout
- `src/renderer/components/settings/SettingsPanel.tsx` — widened content area

## 2026-04-25 00:02 GST (Dubai)
### Settings: merge branding into appearance as two-column layout
Removed the separate Branding settings section and merged the app icon upload into the Appearance page. The page now uses a two-column grid: the app icon preview with change/reset buttons on the left, and theme, font size, and layout settings on the right.

**Modified:**
- `src/renderer/components/settings/appearance-section.tsx` — rewrote as 2-column layout with icon upload
- `src/renderer/components/settings/settings-shared.tsx` — removed branding nav item and section type
- `src/renderer/components/settings/SettingsPanel.tsx` — removed branding section rendering and import
- Deleted `src/renderer/components/settings/branding-section.tsx`

## 2026-04-24 23:51 GST (Dubai)
### Settings: add custom app icon branding feature
Added a new "Branding" section in Settings that lets users upload a custom image (PNG/JPG/WebP, max 2 MB) to replace the Kirodex app icon. The custom icon appears in the About dialog and the macOS dock (via Cocoa NSApplication setApplicationIconImage). Users can reset to the default icon. The dock icon is applied on save and restored on app startup.

**Modified:**
- `src-tauri/src/commands/settings.rs` — added `custom_app_icon` field, `set_dock_icon` and `reset_dock_icon` commands
- `src-tauri/src/lib.rs` — registered new commands
- `src/renderer/types/index.ts` — added `customAppIcon` to `AppSettings`
- `src/renderer/stores/settingsStore.ts` — track `customAppIcon` in analytics
- `src/renderer/lib/ipc.ts` — added `setDockIcon` and `resetDockIcon` wrappers
- `src/renderer/components/settings/settings-shared.tsx` — added branding section to nav and search
- `src/renderer/components/settings/branding-section.tsx` — new branding UI component
- `src/renderer/components/settings/SettingsPanel.tsx` — wired branding section, dock icon on save
- `src/renderer/components/settings/AboutDialog.tsx` — use custom icon with fallback
- `src/renderer/App.tsx` — apply dock icon on startup
- `package.json`, `bun.lock` — added `@tauri-apps/plugin-dialog` v2.7.0

## 2026-04-24 18:34 GST (Dubai)
### Website: add smart OS-detecting download cards
Replaced the static "Download for macOS" hero button with 4 platform download cards (DMG, EXE, .deb, AppImage). Inline JS detects the visitor's OS via `navigator.userAgent`, highlights the matching card, and fetches the latest release version + asset URLs from the GitHub API. Non-detected platforms render muted but remain clickable.

**Modified:** website/index.html, website/style.css, website/dist/style.css

## 2026-04-24 16:50 GST (Dubai)
### AppHeader: remove traffic light padding in fullscreen mode
Added fullscreen detection via `onResized` + `isFullscreen()` in `AppHeader`. When macOS enters fullscreen (traffic lights hidden), the left padding drops from `74px` to `8px` so the header content uses the full width.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-24 16:47 GST (Dubai)
### ToolCallDisplay: fix collapsed card overlap with TaskList/Subagent
Wrapped TaskListDisplay and SubagentDisplay in a container div with proper padding so they don't clash with the parent ToolCallDisplay border when collapsed. Added `border-t` separator when collapsed, removed `my-1 ml-1` from both child components since the parent wrapper now handles spacing.

**Modified:** `src/renderer/components/chat/ToolCallDisplay.tsx`, `src/renderer/components/chat/TaskListDisplay.tsx`, `src/renderer/components/chat/SubagentDisplay.tsx`

## 2026-04-24 16:46 GST (Dubai)
### Window: revert custom traffic lights changes
Reverted all traffic light changes (custom component, hidden native buttons, background color, darkened CSS). Back to native macOS traffic lights with original styling.

**Modified:** `src-tauri/src/lib.rs`, `src/renderer/components/AppHeader.tsx`, `src/tailwind.css`

## 2026-04-24 16:40 GST (Dubai)
### Window: replace native traffic lights with custom darker ones
Hid native macOS traffic lights via `setHidden:true` in Rust and rendered the custom `TrafficLights` component in `AppHeader`. Darkened unfocused colors: light mode `#d4d4d4` → `#a3a3a3`, dark mode `#4a4a4a` → `#3a3a3a`.

**Modified:** `src-tauri/src/lib.rs`, `src/renderer/components/AppHeader.tsx`, `src/tailwind.css`

## 2026-04-24 16:36 GST (Dubai)
### Window: fix macOS traffic lights appearance when unfocused
Set the NSWindow background color to `#0D0D0D` (matching the dark theme `--background`) in both the main window setup and `create_new_window`. The title bar area behind native traffic lights now blends seamlessly when the window loses focus instead of showing a mismatched system chrome color.

**Modified:** `src-tauri/src/lib.rs`

## 2026-04-24 16:33 GST (Dubai)
### Timeline tests: fix 3 failing tests to match current deriveTimeline behavior
Updated three timeline.test.ts expectations to match the current implementation where the `working` row is always emitted when `isRunning` is true (placed before live tool calls) with a `hasStreamingContent` flag instead of being suppressed.

**Modified:** `src/renderer/lib/timeline.test.ts`

## 2026-04-24 16:16 GST (Dubai)
### ModelPicker: shake animation on error with refresh icon
Added shake keyframes to tailwind.css. ModelPicker now subscribes to `modelsError`; on error it shakes and shows a destructive-colored Retry button with IconRefresh. Also keeps the 10s timeout fallback. ModelPickerPanel shows the error message in destructive color with shake and a Retry button.

**Modified:** `src/tailwind.css`, `src/renderer/components/chat/ModelPicker.tsx`, `src/renderer/components/chat/ModelPickerPanel.tsx`

## 2026-04-24 16:14 GST (Dubai)
### AutoApproveToggle: rewrite as dropdown with explicit labels and better icons
Replaced the vague "Full"/"Ask" toggle button with a dropdown picker matching PlanToggle's pattern. Labels are now "Auto-approve" and "Ask first" with short descriptions. Icons changed from shield to IconHandStop/IconMessageQuestion. Auto-approve state uses amber color treatment.

**Modified:** `src/renderer/components/chat/AutoApproveToggle.tsx`

## 2026-04-24 16:12 GST (Dubai)
### ModelPicker: add retry button when models fail to load
Added a 10-second timeout to ModelPicker; after the timeout the pulsing skeleton is replaced with a Retry button that calls `ipc.probeCapabilities()`. Timer resets when models arrive or retry is clicked. Also added a Retry button to ModelPickerPanel's empty state alongside the "No models available" text.

**Modified:** `src/renderer/components/chat/ModelPicker.tsx`, `src/renderer/components/chat/ModelPickerPanel.tsx`

## 2026-04-24 16:11 GST (Dubai)
### Kbd: restyle all kbd elements to shadcn v4 discrete typography
Updated the `Kbd` component to match shadcn v4 (no border, no shadow, `rounded-sm`, `bg-muted`, tooltip-aware styling). Added `KbdGroup` component. Updated all 8 inline `<kbd>` usages across 7 files to remove borders and shadows. Tooltip kbds use `bg-background/15` for contrast.

**Modified:** `src/renderer/components/ui/kbd.tsx`, `src/renderer/App.tsx`, `src/renderer/components/chat/BtwOverlay.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/chat/EmptyThreadSplash.tsx`, `src/renderer/components/chat/QuestionCards.tsx`, `src/renderer/components/header-breadcrumb.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`

## 2026-04-24 16:10 GST (Dubai)
### KeymapSection: replace card-on-card kbd with discrete typography
Removed the bordered/shadowed `<kbd>` elements in the keyboard shortcuts settings section. Replaced with a plain `<span>` using `font-mono text-[11px] text-muted-foreground/70` to eliminate the card-on-card visual clash inside `SettingsCard`.

**Modified:** `src/renderer/components/settings/keymap-section.tsx`

## 2026-04-24 16:09 GST (Dubai)
### PlanToggle: replace toggle button with explicit mode dropdown
Rewrote PlanToggle from a simple toggle button (that showed "Plan" in both states) to a dropdown that explicitly displays the current mode name ("Code" or "Plan") with an icon and chevron. Uses the same dropdown pattern as ModelPicker. No more guessing which mode is active.

**Modified:** `src/renderer/components/chat/PlanToggle.tsx`

## 2026-04-24 15:19 GST (Dubai)
### Timeline: move working indicator dot above tool calls
Reordered the live streaming section of `deriveTimeline()` so the working indicator row (pulsing dot / cycling words) renders above live tool calls instead of below them. The timeline order is now: live text → working dot → live tool calls.

**Modified:** `src/renderer/lib/timeline.ts`

## 2026-04-24 15:09 GST (Dubai)
### Icons: replace /btw lightning bolt with message-circle-question
Replaced the lightning bolt icon for `/btw` and `/tangent` with `IconMessageCircleQuestion` (speech bubble with question mark) across SlashCommandPicker, BtwOverlay, and EmptyThreadSplash. This differentiates the "side question" feature from skills which use the zap/bolt icon.

**Modified:** `src/renderer/components/chat/SlashCommandPicker.tsx`, `src/renderer/components/chat/BtwOverlay.tsx`, `src/renderer/components/chat/EmptyThreadSplash.tsx`

## 2026-04-24 15:08 GST (Dubai)
### Skills: show "skill: Name" in mention pills
Updated the `FileMentionPill` component so skill pills display `skill: Formatted Name` instead of the raw skill name.

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-24 15:06 GST (Dubai)
### Skills: replace wrench icon with zap (IconBolt) across all skill surfaces
Replaced IconTool (wrench) with IconBolt (zap) for skills in the `@` mention picker, skill mention pills in the input area, and inline skill mentions in chat messages. The sidebar (KiroConfigPanel, KiroSkillRow) already used IconBolt. Remaining IconTool usages are for tool calls, settings, and onboarding — unrelated to skills. Build passes with zero errors.

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`, `src/renderer/components/chat/UserMessageRow.tsx`

## 2026-04-24 12:38 GST (Dubai)
### Icons: match open-source macOS app standard (824×824 at +100+100)
Audited 6 open-source macOS apps (IINA, Ghostty, Rectangle, Maccy, Zed, MonitorControl) — all use 824×824 hard-edge squircle at +100+100 on 1024×1024 canvas. Resized Kirodex dev/prod icons to match exactly. Regenerated .icns and .ico for both variants.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 12:33 GST (Dubai)
### Icons: audit open-source macOS app squircle sizing
Measured the exact squircle sizing in 6 popular open-source macOS apps (IINA, Rectangle, Maccy, Ghostty, Zed, MonitorControl). All use the Apple HIG standard: 824x824 hard-edge squircle body centered on a 1024x1024 canvas (100px margin per side = ~80.5% fill). Anti-aliased soft edge extends to ~872px (~85% fill). This confirms the Apple template standard.

**Modified:** (analysis only, no code changes)

## 2026-04-24 12:22 GST (Dubai)
### Icons: full bleed squircle to match macOS Dock sizing
Icon appeared smaller than other Dock apps (WhatsApp, Spotify, Figma) because of excessive padding. Followed Apple `.icon` format approach: squircle fills entire 1024×1024 canvas edge-to-edge — macOS handles Dock spacing externally. Regenerated .icns and .ico for both dev and prod.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 12:20 GST (Dubai)
### Icons: exact Apple HIG 824×824 squircle at +100+100
Squircle was 795×824 (not perfectly square) due to aspect-ratio-preserving resize. Switched to fill-crop (`-resize 824x824^` + `-extent 824x824`) so the squircle fills exactly 824×824, centered at +100+100 in the 1024×1024 canvas — matching Apple's macOS Big Sur+ icon grid spec and the reference `.icon` file. Regenerated .icns and .ico for both dev and prod.

## 2026-04-24 12:17 GST (Dubai)
### Icons: resize to Apple HIG 824×824 spec per Big Sur+ guidelines
Icons were too small — artwork filled ~64% of the 1024×1024 canvas (~657×681px) instead of Apple's recommended ~80% (824×824). Scaled artwork up to fit 824×824, centered on 1024×1024 transparent canvas with ~100px padding per side. Regenerated .icns (all 10 macOS sizes via iconutil) and .ico (7 Windows sizes via ImageMagick) for both dev and prod.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 11:47 GST (Dubai)
### Icons: edge-to-edge fill to match other macOS dock icons
Previous icons had transparent padding baked in, making them appear smaller than other dock apps (WhatsApp, Spotify, Figma, etc.). Switched to edge-to-edge fill of the 1024×1024 canvas so macOS renders them at the same visual size as other apps. Regenerated .icns and .ico for both dev and prod.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 11:46 GST (Dubai)
### Icons: exact Apple HIG sizing (824×824 at +100+100 in 1024×1024)
Resized dev and prod icons to exactly match Apple's macOS icon spec: 824×824 content centered at +100+100 in a 1024×1024 canvas. Used fill-mode resize (`-resize 824x824^`) with center crop to ensure the rounded rect fills the full 824×824 grid square. Regenerated .icns and .ico for both variants.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 11:18 GST (Dubai)
### Icons: match dev and prod icon sizing and spacing
Replaced edge-to-edge icon.png files with the properly-spaced source versions (dev.png/prod.png) that have macOS-style transparent padding around the rounded square. Regenerated .icns (via iconutil) and .ico (via ImageMagick) for both dev and prod. Both icons now have identical sizing and spacing; only the color differs (teal for dev, blue for prod).

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 10:55 GST (Dubai)
### ChatInput: add folder drag-and-drop support
Added folder detection when dragging paths onto the chat input. Folders are displayed as pills with an IconFolder icon and the folder name (full path on hover). On send, folder paths are prepended as `[Folder: /path]` references. Added `is_directory` Rust IPC command, updated `useAttachments`, `useChatInput`, `ChatInput`, `ChatTextarea`, and `PillsRow`.

**Modified:** `src-tauri/src/commands/fs_ops.rs`, `src-tauri/src/lib.rs`, `src/renderer/lib/ipc.ts`, `src/renderer/hooks/useAttachments.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatTextarea.tsx`, `src/renderer/components/chat/PillsRow.tsx`, `src/renderer/components/chat/PillsRow.test.tsx`

## 2026-04-24 10:59 GST (Dubai)
### Git: single commit for all pending changes
Staged and committed all 31 changed files in one conventional commit covering folder drop support, WorkingRow streaming indicator, dev/prod icon split, website favicon PNG switch, and CLAUDE.md refresh.

**Modified:** all 31 files (see commit `1d30a80`)

## 2026-04-24 10:58 GST (Dubai)
### Icons: aggressive edge-to-edge trim on both prod and dev
Trimmed both source PNGs to exact content bounds (no padding), squared the canvas, and scaled to fill 1024x1024. Regenerated all formats and propagated to root icons and website.

**Modified:** `src-tauri/icons/prod/icon.{png,icns,ico}`, `src-tauri/icons/dev/icon.{png,icns,ico}`, `src-tauri/icons/icon.{png,icns,ico}`, `website/assets/icon.png`

## 2026-04-24 10:56 GST (Dubai)
### Icons: tighter trim on both prod and dev icons
Increased content size from 860px to 960px within the 1024x1024 canvas (~3% padding per side). Regenerated all formats (png, icns, ico) for both prod and dev, updated root-level icons and website asset.

**Modified:** `src-tauri/icons/prod/icon.{png,icns,ico}`, `src-tauri/icons/dev/icon.{png,icns,ico}`, `src-tauri/icons/icon.{png,icns,ico}`, `website/assets/icon.png`

## 2026-04-24 10:54 GST (Dubai)
### Website: switch to blue prod PNG icon
Copied trimmed prod icon.png to `website/assets/` and updated all three HTML pages (index, changelog, features) to use `icon.png` instead of `icon.svg` for both favicon and header logo.

**Modified:** `website/assets/icon.png`, `website/index.html`, `website/changelog.html`, `website/features.html`

## 2026-04-24 10:51 GST (Dubai)
### Icons: replace root-level icons with trimmed dev versions
Copied trimmed dev icon.png, icon.icns, and icon.ico to the root `src-tauri/icons/` directory, replacing the old untrimmed versions.

**Modified:** `src-tauri/icons/icon.png`, `src-tauri/icons/icon.icns`, `src-tauri/icons/icon.ico`

## 2026-04-24 10:48 GST (Dubai)
### Icons: trim and regenerate prod icons
Trimmed white space from prod.png (same 656x682 content in 1024x1024 canvas), resized to 860px and re-centered with ~8% uniform padding on transparent background. Regenerated icon.icns and icon.ico to match the dev icon treatment.

**Modified:** `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-24 10:46 GST (Dubai)
### Icons: trim white space and regenerate dev icons
Trimmed excess white/transparent padding from dev.png (content was 657x681 in a 1024x1024 canvas). Resized content to 860px and re-centered on a 1024x1024 transparent canvas with uniform ~8% padding. Regenerated icon.icns and icon.ico from the trimmed source.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`

## 2026-04-24 10:45 GST (Dubai)
### Config: update tauri.conf.json for dev icons and identifier
Updated bundle icon paths to `icons/dev/icon.*` and changed identifier from `com.kirodex.app` to `com.kirodex.dev` so dev and prod builds can coexist on the same machine.

**Modified:** `src-tauri/tauri.conf.json`

## 2026-04-24 10:44 GST (Dubai)
### Icons: generate dev icon files (png, icns, ico)
Generated all required icon formats for the dev build from the teal geometric K icon. Created icon.png (1024x1024), icon.icns (1.6MB, all macOS sizes 16-1024px with @2x retina), and icon.ico (372KB, sizes 16-256px) in `src-tauri/icons/dev/`.

**Modified:** `src-tauri/icons/dev/icon.png`, `src-tauri/icons/dev/icon.icns`, `src-tauri/icons/dev/icon.ico`

## 2026-04-24 10:27 GST (Dubai)
### Icons: update website favicon and verify dev icons
Copied squircle SVG to `website/assets/icon.svg` replacing old rounded-rect. Verified all dev icon files (png, icns, ico, svg) are valid squircles. Cleared macOS icon cache to force dock refresh on next launch.

**Modified:** `website/assets/icon.svg`

## 2026-04-24 10:20 GST (Dubai)
### Docs: comprehensive CLAUDE.md update from codebase discovery
Ran the update-claude-md-after-install skill to systematically discover actual project patterns and cross-reference against CLAUDE.md. Fixed project overview (cross-platform, not macOS-only), expanded tech stack with all actual dependencies (ghostty-web, posthog-js, recharts, redb, sonner, slugify, all Tauri plugins, macOS crates), rewrote project structure to show all 9 stores, 11 hooks, 17 lib files, and missing component directories (analytics, unified-title-bar, onboarding). Expanded commands from 6 to 25+ scripts. Added architecture decisions for ACP module split, persistence, analytics pipeline, multi-window, native menu, cross-platform title bar, onboarding, Vite config, and CI pipeline.

**Modified:** `CLAUDE.md`

## 2026-04-24 10:11 GST (Dubai)
### Chat: keep activity indicator visible whenever agent is running
The "Synthesizing..." cycling text disappeared when the agent started streaming text or thinking, even though the green pause button was still visible. Fixed by always emitting the `working` timeline row when `isRunning` is true. When streaming content exists, the row renders as a subtle pulsing dot instead of the cycling words, so activity feedback is always present.

**Modified:** `src/renderer/lib/timeline.ts`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/WorkingRow.test.tsx`

## 2026-04-24 10:05 GST (Dubai)
### TaskStore: fix broken restored threads after soft-delete
Soft-deleted threads called `ipc.deleteTask` which destroyed the backend ACP connection, but `restoreTask` never re-created it. The restored task kept `status: 'completed'` and existing messages, so `sendMessageDirect` tried `ipc.sendMessage` on a dead connection. Fixed by adding a `needsNewConnection` flag to `AgentTask`, setting `status: 'paused'` and `needsNewConnection: true` in `restoreTask`, and making `sendMessageDirect` create a fresh ACP connection via `ipc.createTask` for flagged tasks.

**Modified:** `src/renderer/types/index.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-24 10:08 GST (Dubai)
### Chat: fix unreadable yellow text on skill mention pills
Skill mention pills (e.g. `update-agent-learning`) used `text-yellow-300` on a `bg-yellow-500/15` background, making the text nearly invisible. Changed to `text-yellow-600 dark:text-yellow-400` to match the icon color and ensure readable contrast.

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-23 14:55 GST (Dubai)
### Chat: fix question card options clipped by overflow-y-hidden
The inner wrapper in MessageList.tsx had `overflow-x-auto overflow-y-hidden` which created a scroll container. Per CSS spec, when one overflow axis is non-visible, the other is treated as auto, not visible. The `overflow-y-hidden` clipped vertical content, hiding QuestionCard options, input, and footer below the question text. Removed both overflow properties since code blocks already handle horizontal scrolling via `.chat-markdown pre { overflow-x: auto }`.

**Modified:** `src/renderer/components/chat/MessageList.tsx`

## 2026-04-23 14:59 GST (Dubai)
### Crash fallback: add close button so users can dismiss it
Added a ✕ close button (top-right corner) to the HTML crash-fallback overlay. If the fallback appears incorrectly while the app is running behind it, users can dismiss it instead of being forced to reload.

**Modified:** `index.html`

## 2026-04-23 14:57 GST (Dubai)
### Crash fallback: fix overlay showing alongside running app
The crash-fallback div in index.html was never dismissed when React mounted. The 10s setTimeout persisted and could fire even after the app rendered. Fixed by storing the timer on `window.__crashTimer` so it can be cleared, and in main.tsx after `ReactDOM.render()`, clearing the timer and removing the crash-fallback element from the DOM.

**Modified:** `index.html`, `src/renderer/main.tsx`

## 2026-04-23 14:54 GST (Dubai)
### Icons: redesign from square to squircle shape
Replaced both dev (teal #14B8A6) and prod (blue #0000FF) app icons with a superellipse squircle shape (n=5, 360 points) on transparent background. Generated all platform formats: SVG source, 1024x1024 PNG, macOS .icns (via iconutil), and Windows .ico (via ImageMagick). No text, clean solid color fill.

**Modified:** `src-tauri/icons/icon.svg`, `src-tauri/icons/icon.png`, `src-tauri/icons/icon.icns`, `src-tauri/icons/icon.ico`, `src-tauri/icons/prod/icon.svg`, `src-tauri/icons/prod/icon.png`, `src-tauri/icons/prod/icon.icns`, `src-tauri/icons/prod/icon.ico`

## 2026-04-23 14:48 GST (Dubai)
### Timeline: show "Crafting…" indicator during long tool calls and subagent runs
Fixed the working row disappearing during long-running tool calls. The `deriveTimeline()` function suppressed the "Crafting…" indicator whenever `liveToolCalls` had entries. Changed the condition to only suppress when there's active streaming text or thinking, so the indicator now appears below tool call displays during long operations like subagents.

**Modified:** src/renderer/lib/timeline.ts, src/renderer/lib/timeline.test.ts

## 2026-04-23 13:02 GST (Dubai)
### Crash Recovery: detect corrupted history.json, show recovery UI, reset app data
Added three-layer crash recovery. history-store.ts now validates the store on first access and auto-resets if corrupted. main.tsx ErrorBoundary shows a recovery screen with Reload and Reset buttons (two-click confirm) instead of a blank screen. index.html has a pre-React fallback that appears after 10s if the JS bundle fails. Added `reset_app_data` Rust command that deletes all files in app_data_dir.

**Modified:** src/renderer/lib/history-store.ts, src/renderer/main.tsx, index.html, src-tauri/src/lib.rs

## 2026-04-23 13:00 GST (Dubai)
### Homebrew: complete zap cleanup paths in cask definition
Updated the Homebrew cask at thabti/homebrew-tap to add `uninstall quit:` and complete `zap trash:` paths covering rs.kirodex (confy config), Logs, and WebKit directories.

**Modified:** thabti/homebrew-tap/Casks/kirodex.rb (pushed to GitHub)

## 2026-04-22 17:08 GST (Dubai)
### Sidebar: Auto-focus project button on add/import
When a new project is added or imported, the project button in the sidebar now receives keyboard focus, showing the `focus-visible:ring-2` ring. Added `lastAddedProject` state to the task store, set it in `addProject`, and consumed it via an `autoFocus` prop on `ProjectItem` which focuses the button ref and clears the flag.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-22 13:06 GST (Dubai)
### Docs: Fix first-contribution onboarding
Reordered CONTRIBUTING.md's Getting started so the prereq list (Rust, Bun, kiro-cli) appears before the copy-paste block — previously a new contributor would paste `cargo install tauri-cli` before `rustup` was installed. Pinned `cargo install tauri-cli` to `--locked --version "^2.0.0"` so it doesn't drift across majors. Added a "Frontend-only contributions" note clarifying that `bun run check:ts` + `bun run test:ui` are sufficient without Rust. Clarified in README that kiro-cli is required at runtime (not just setup) and that agent actions fail without it. Added `analytics` to the `src-tauri/src/commands/` module list in the project-layout table.

**Modified:** CONTRIBUTING.md, README.md
## 2026-04-22 15:39 GST (Dubai)
### Settings: Full UI/UX overhaul of the settings panel
Overhauled the entire settings panel across 6 files. Added grouped sidebar nav labels (ACCOUNT, SETTINGS, DATA) inspired by reference design. Added dirty state indicator (amber dot on Save button). Fixed SettingsCard default padding from py-1 to py-3, eliminating all !py-4 overrides. Merged Permissions + Worktrees + Sandbox into a single "Workspace" card in General, reducing from 7 sub-sections to 5. Added ConfirmDialog for destructive actions (Clear history, Clear analytics). Expanded font size range from 14-18 to 12-22 with editable number input. Improved keymap search input consistency. Added ARIA roles and labels throughout.

**Modified:** settings-shared.tsx, SettingsPanel.tsx, general-section.tsx, appearance-section.tsx, advanced-section.tsx, keymap-section.tsx

## 2026-04-22 10:41 GST (Dubai)
### Store/Persistence: Fix self-write race, missing persistHistory calls, ack-based quit flush
Audited the entire store/persistence layer. Added `_selfWriteCount` guard to `history-store.ts` so `onKeyChange` skips same-window writes (600ms delay past autoSave). Added missing `persistHistory()` calls to `createDraftThread`, `updateCompactionStatus`, and `reorderProject`. Replaced silent `.catch(() => {})` with `console.warn` in `persistHistory`. Replaced sleep-based quit flush in `lib.rs` with ack-based `mpsc::channel` + 2s timeout. Updated `App.tsx` to check `isSelfWriting()` in cross-window sync and emit `flush-ack` after flushing. Added 6 new engineering learnings to AGENTS.md.

**Modified:** src/renderer/lib/history-store.ts, src/renderer/App.tsx, src/renderer/stores/taskStore.ts, src-tauri/src/lib.rs, AGENTS.md

## 2026-04-22 10:24 GST (Dubai)
### Settings: Clear history preserves core system setup
Modified `clearHistory` in taskStore to only clear conversation threads, projects, and soft-deleted items from history.json without resetting onboarding status, CLI path, model, or other core settings. Previously it reset `hasOnboardedV2: false` which forced users back through the setup wizard. Updated the button description in advanced-section and search index to reflect the new behavior.

**Modified:** src/renderer/stores/taskStore.ts, src/renderer/components/settings/advanced-section.tsx, src/renderer/components/settings/settings-shared.tsx

## 2026-04-22 08:31 GST (Dubai)
### Steering Queue: Preserve image attachments in queued messages
Queued messages while the agent was running dropped image attachments; only the text string was stored. Changed `queuedMessages` from `Record<string, string[]>` to `Record<string, QueuedMessage[]>` where each entry carries `text` + optional `attachments`. The QueuedMessages component now shows an `IconPhoto` indicator with count tooltip, and displays "Image attachment" as fallback text for image-only messages. Attachments flow through enqueue, steer, and auto-drain paths.

**Modified:** task-store-types.ts, taskStore.ts, ChatPanel.tsx, QueuedMessages.tsx, task-store-listeners.ts, taskStore.test.ts, QueuedMessages.test.tsx

## 2026-04-22 08:30 GST (Dubai)
### TaskStore: Fix orphaned UUID project entries in sidebar
When re-adding a previously removed project, `addProject` generated a new UUID but restored soft-deleted threads still carried the old UUID as `projectId`, creating phantom sidebar entries. Fixed three things: (1) `addProject` now sets `projectId` on restored tasks to the new UUID, (2) `removeProject` falls back to matching tasks by `projectId` when workspace match finds nothing (so the trash button works on orphaned entries), (3) `useSidebarTasks` skips orphaned UUID entries with no workspace mapping. TDD approach with 3 new tests.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/stores/taskStore.test.ts`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/hooks/useSidebarTasks.test.ts`

## 2026-04-21 15:30 GST (Dubai)
### Updater: Fix "Restart now" button not working
The restart callback was fire-and-forget async — errors in `prepareForRelaunch()` were silently swallowed as unhandled rejections. Made `triggerRestart` properly async, added try/catch with error surfacing to all three restart entry points (RestartPromptDialog, UpdatesCard, AboutDialog), and added loading state to the restart dialog button.

**Modified:** `src/renderer/hooks/useUpdateChecker.ts`, `src/renderer/stores/updateStore.ts`, `src/renderer/components/sidebar/RestartPromptDialog.tsx`, `src/renderer/components/settings/updates-card.tsx`, `src/renderer/components/settings/AboutDialog.tsx`, `src/renderer/components/sidebar/SidebarFooter.test.tsx`

## 2026-04-21 14:15 GST (Dubai)
### History Store: Fix state not persisting across restarts and upgrades
The entire save pipeline was fire-and-forget async — `persistHistory()` fired promises without awaiting, and the quit handler slept a fixed 500ms hoping they'd complete (they didn't). Made `persistHistory` async/awaitable, added `persistAndFlush` for guaranteed writes, replaced the fixed-sleep quit protocol with an acknowledgment-based `flush-complete` event from JS→Rust with a 2s safety timeout, and fixed `relaunch.ts` to properly await persistence.

**Modified:** `src/renderer/lib/history-store.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/stores/task-store-types.ts`, `src/renderer/App.tsx`, `src-tauri/src/lib.rs`, `src/renderer/lib/relaunch.ts`, `src/renderer/main.tsx`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-21 02:07 GST (Dubai)
### History Store: Separate dev and prod store files
Dev builds now use `history-dev.json` and `history-dev.backup.json` via `import.meta.env.DEV`, so running `bun run dev` no longer shares or overwrites the production app's history data.

**Modified:** `src/renderer/lib/history-store.ts`

## 2026-04-21 02:00 GST (Dubai)
### ACP: Fix kiro-cli spawning in src-tauri instead of the selected project directory
Added `.current_dir(&workspace)` to the kiro-cli process spawn in `connection.rs` so the agent runs in the user's project directory, not the Tauri dev directory. Also fixed the `list_models` probe to use `$HOME` instead of `std::env::current_dir()` for consistency with `probe_capabilities`.

**Modified:** `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/commands.rs`

## 2026-04-21 01:55 GST (Dubai)
### Chat: Render TaskCompletionCard for all valid reports, not just file changes
Fixed `shouldRenderReportCard` to return true for any valid report with a status and summary, instead of requiring `filesChanged` to have items. Previously, no-file reports (e.g. answering a question) had their JSON stripped but no card rendered, leaving the summary invisible.

**Modified:** `src/renderer/components/chat/TaskCompletionCard.tsx`

## 2026-04-21 01:56 GST (Dubai)
### Stores: Fix task status always showing as "running" (green dot)
Removed a broken guard in `applyTurnEnd` that was added in commit 7b10772. The guard `if (task.status === 'running') return {}` was intended to handle a steering race condition, but it prevented ALL turn_end processing since the task is always `'running'` when `turn_end` fires. This caused every thread in the sidebar to permanently show a green pulsing dot.

**Modified:** `src/renderer/stores/task-store-listeners.ts`

## 2026-04-21 01:55 GST (Dubai)
### Sidebar: Add "Copy Path" to project right-click context menu
Added a "Copy Path" option to the project name context menu in the sidebar. Uses `navigator.clipboard.writeText(cwd)` to copy the project's full path. Placed right after "Open in Finder" for logical grouping.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`

## 2026-04-21 01:47 GST (Dubai)
### Persistence: Fix app close data loss and add UI state restoration
Fixed critical bug where all projects and threads were lost on app quit. Root cause: the `beforeunload` handler used an async dynamic `import()` that never completed before the process exited, and the Rust quit flow called `app.exit(0)` immediately without giving the frontend time to flush. Fix: (1) Rust now emits `app://flush-before-quit` event and sleeps 500ms before exit. (2) Frontend listens for this event and calls `persistHistory()` + `flush()`. (3) `beforeunload` handler now uses a pre-cached module reference instead of async import. (4) Added `saveUiState`/`loadUiState` to persist selected thread, view, and panel state across restarts. (5) Added 30-second auto-save interval as a safety net.

**Modified:** `src-tauri/src/lib.rs`, `src/renderer/App.tsx`, `src/renderer/lib/history-store.ts`, `src/renderer/main.tsx`

## 2026-04-21 01:37 GST (Dubai)
### Menu: Fix review issues in Recent Projects feature
Applied 5 fixes from Claude Code review: (1) Menu IDs now use `recent:{path}` format instead of index-based, eliminating a TOCTOU race where reordering between menu build and click could open the wrong project. (2) `clear_recent` handler uses `persist_store()` instead of direct `confy::store`. (3) Label extraction uses `std::path::Path::file_name()` for cross-platform correctness. (4) `add_recent_project` early-returns when project is already at position 0, avoiding unnecessary disk writes and menu rebuilds. (5) Ambiguous basenames show `parent/basename` format for disambiguation.

**Modified:** `src-tauri/src/commands/settings.rs`, `src-tauri/src/lib.rs`

## 2026-04-21 01:29 GST (Dubai)
### Menu: Add File → Recent Projects submenu
Added a native "Recent Projects" submenu under File in the macOS/Windows/Linux menu bar. The list persists up to 10 recently opened projects via confy, updates dynamically when projects are opened, and includes a "Clear Recent Projects" option. Clicking a recent project opens it in the app. The menu rebuilds automatically after each project open.

**Modified:** `src-tauri/src/commands/settings.rs`, `src-tauri/src/lib.rs`, `src/renderer/App.tsx`, `src/renderer/lib/ipc.ts`, `src/renderer/stores/taskStore.ts`

## 2026-04-21 01:22 GST (Dubai)
### Updater: Fix "Restart now" button blocked by quit confirmation dialog
The "Restart now" button in the update-ready dialog (and the restart buttons in Settings and About) did nothing because `relaunch()` triggers a `CloseRequested` window event, which was unconditionally calling `api.prevent_close()` and showing a quit confirmation dialog. Added a `RelaunchFlag` (`AtomicBool`) to Rust managed state with a `set_relaunch_flag` Tauri command. `prepareForRelaunch()` now sets this flag before calling `relaunch()`. The `CloseRequested` handler checks the flag and skips the confirmation dialog when a relaunch is in progress, calling `shutdown_app()` for cleanup instead.

**Modified:**
- `src-tauri/src/lib.rs` — Added `RelaunchFlag` struct, `set_relaunch_flag` command, updated `CloseRequested` handler
- `src/renderer/lib/ipc.ts` — Added `setRelaunchFlag` IPC wrapper
- `src/renderer/lib/relaunch.ts` — Call `ipc.setRelaunchFlag()` in `prepareForRelaunch()`
## 2026-04-21 01:16 GST (Dubai)
### Git: Switch network ops (fetch/push/pull) to git CLI
Replaced `git2` `RemoteCallbacks` + `Cred` credential handling with plain `git` CLI calls for fetch, push, and pull. `git2`/libssh2 can't access macOS Keychain passphrases for encrypted SSH keys, causing auth failures even when `ssh` works fine. The CLI inherits the user's full SSH agent, credential helpers, and Keychain integration. Local operations (diff, stage, branch, commit) still use `git2`. Removed `Cred`, `RemoteCallbacks` imports and the `make_remote_callbacks` function.

**Modified:** `src-tauri/src/commands/git.rs`

## 2026-04-21 01:11 GST (Dubai)
### Git: Fix SSH transport support in fetch/push/pull
Fixed `make_remote_callbacks` in `git.rs` to handle the `CredentialType::USERNAME` phase that `git2` requires before requesting SSH keys. Without this handler, SSH remotes fell through to the HTTPS credential check and failed with "no HTTPS credentials found." The fix adds a USERNAME handler returning the URL username (or "git" as default), separates the SSH attempt counter from the username phase, and improves error messages for both SSH and HTTPS failures.

**Modified:** `src-tauri/src/commands/git.rs`

## 2026-04-21 01:05 GST (Dubai)
### Chat: Retain file/agent/skill mentions in draft threads on switch
Added `draftMentionedFiles: Record<string, ProjectFile[]>` to the zustand store so that `@file`, `@agent:name`, and `@skill:name` mentions persist when switching between draft threads. Same pattern as the earlier attachments/pasted chunks fix: store saves on change, restores on remount.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useFileMention.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/PendingChat.tsx`

## 2026-04-21 01:05 GST (Dubai)
### DiffPanel: Remove @pierre/diffs file header
Added `disableFileHeader: true` to the `FileDiff` options in `DiffPanel.tsx` to hide the built-in file header bar (showing filename, +/- counts, and change icon). The panel's own file sidebar already provides this information.

**Modified:**
- `src/renderer/components/diff/DiffPanel.tsx`

## 2026-04-21 00:35 GST (Dubai)
### Multi-window: Add Cmd+Shift+N new window support and File menu commands
Added multi-window support to Kirodex. Built a custom native menu in Rust replacing the auto-generated default, with New Window (⇧⌘N), New Thread (⌘N), and New Project (⌘O) in the File submenu. New windows share the same projects/threads via tauri-plugin-store's shared backend, with cross-window sync using LazyStore.onKeyChange and a 300ms debounce. Secondary windows close without quit confirmation; only the last window triggers the shutdown dialog. Removed conflicting Cmd+N/Cmd+O JS handlers since native menu accelerators now handle those keys.

**Modified:**
- `src-tauri/src/lib.rs` — Custom menu (build_app_menu), create_new_window with macOS styling, multi-window close handling
- `src-tauri/capabilities/default.json` — Window glob pattern for new windows
- `src/renderer/App.tsx` — Menu event listeners, cross-window sync subscription
- `src/renderer/hooks/useKeyboardShortcuts.ts` — Removed Cmd+N and Cmd+O handlers
- `src/renderer/lib/history-store.ts` — Added subscribeToChanges() for cross-window sync

## 2026-04-21 00:34 GST (Dubai)
### Chat: Fix draft threads losing attached images and pasted text on thread switch
Attachments and pasted text chunks were stored in React local state (`useState`) inside `useAttachments` and `useChatInput` hooks. When switching threads, the component unmounted and this state was destroyed, leaving orphaned placeholders in the textarea. Fixed by lifting attachment and pasted chunk state into the zustand store (`draftAttachments` and `draftPastedChunks` maps keyed by workspace), with save-on-change callbacks wired through `PendingChat` → `ChatInput` → `useChatInput`.

**Modified:** `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useAttachments.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/PendingChat.tsx`

## 2026-04-21 00:21 GST (Dubai)
### Tests: Fix 9 failing Vitest unit tests from CI #108
Fixed 9 failing tests across `taskStore.test.ts` and `timeline.test.ts`. Root causes: (1) `applyTurnEnd` tests used `status:'running'` but the function now has a guard that returns `{}` for running tasks to prevent clobbering new turns; changed test base state to `status:'paused'` to match production flow. (2) `deriveTimeline` now suppresses the `working` row when there's live activity; updated test expectation. Added a new test for the running guard.

**Modified:** `src/renderer/stores/taskStore.test.ts`, `src/renderer/lib/timeline.test.ts`

## 2026-04-20 23:39 GST (Dubai)
### Chat: Open links in OS default browser
Clicking links in chat messages, settings, about dialog, onboarding, and kiro file viewer now opens them in the OS default browser via Tauri's `open_url` command instead of failing silently with `target="_blank"`. Created a shared `open-external.ts` helper and applied it to all anchor elements across the app.

**Modified:** `src/renderer/lib/open-external.ts` (new), `src/renderer/components/chat/ChatMarkdown.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/components/settings/AboutDialog.tsx`, `src/renderer/components/OnboardingCliSection.tsx`, `src/renderer/components/sidebar/KiroFileViewer.tsx`

## 2026-04-20 14:20 GST (Dubai)
### TaskStore: Restore soft-deleted threads when re-importing the same project
Fixed issue #17 — when a user removes a project and re-imports the same workspace, old threads are now automatically restored from the soft-deleted pool. The `addProject()` method filters `softDeleted` entries by workspace match, moves them back to `tasks` (as archived), removes their IDs from the `deletedTaskIds` blocklist, and persists the change.

**Modified:** `src/renderer/stores/taskStore.ts`
## 2026-04-19 11:02 GST (Dubai)
### Sidebar: Active project focus indicator
Added a visual indicator to the sidebar so the focused project is easy to identify when multiple projects are open. The active project gets a 3px primary-colored left accent bar and a subtle background tint. Active project is derived from the selected task's workspace or the pending workspace.

**Modified:** src/renderer/components/sidebar/ProjectItem.tsx, src/renderer/components/sidebar/TaskSidebar.tsx

## 2026-04-19 03:09 GST (Dubai)
### Docs: Update README.md to reflect v0.13.0 feature set
Updated the README with all features added since the last update: analytics dashboard with redb + recharts, Ghostty WASM terminal, AI commit message generation, strReplace git-style diffs, image attachments as ContentBlock::Image, emoji icon picker, subagent display, quit confirmation dialog, thread persistence with backups, onboarding wizard, open in editor, staged file count, branch delete, and expanded slash commands (/data, /fork, /branch, /worktree). Removed completed items from feature requests (git worktree, UI improvements). Added MCP server management as a new request.

**Modified:** README.md

## 2026-04-19 02:56 GST (Dubai)
### Analytics: Full analytics dashboard with redb backend and recharts frontend
Built a complete analytics dashboard accessible via `/data` or `/usage` slash commands. Tracks coding hours (session focus/blur), message counts with input/output word counts, token usage, tool calls, edited files, cumulative diff stats (+/-), model popularity, plan vs code mode usage, slash command frequency, and project stats. Backend uses redb (pure-Rust embedded KV store) for ACID-compliant persistence. Frontend uses recharts for 9 chart types (4 time-series bar charts + 5 categorical breakdowns). Events are collected in-memory and batch-flushed to Rust every 60 seconds. Settings page shows analytics file size and a clear button. All 182 Rust tests + 731 frontend tests pass.

**Modified:** package.json, bun.lock, src-tauri/Cargo.toml, src-tauri/src/commands/analytics.rs, src-tauri/src/commands/mod.rs, src-tauri/src/lib.rs, src/renderer/App.tsx, src/renderer/types/analytics.ts, src/renderer/lib/analytics-collector.ts, src/renderer/lib/analytics-aggregators.ts, src/renderer/lib/ipc.ts, src/renderer/stores/analyticsStore.ts, src/renderer/stores/task-store-types.ts, src/renderer/stores/task-store-listeners.ts, src/renderer/hooks/useSlashAction.ts, src/renderer/hooks/useSlashAction.test.ts, src/renderer/hooks/useSessionTracker.ts, src/renderer/components/chat/ChatPanel.tsx, src/renderer/components/chat/SlashPanels.tsx, src/renderer/components/settings/advanced-section.tsx, src/renderer/components/analytics/AnalyticsDashboard.tsx, src/renderer/components/analytics/ChartCard.tsx, src/renderer/components/analytics/CodingHoursChart.tsx, src/renderer/components/analytics/MessagesChart.tsx, src/renderer/components/analytics/TokensChart.tsx, src/renderer/components/analytics/DiffStatsChart.tsx, src/renderer/components/analytics/HorizontalBarSection.tsx, src/renderer/components/analytics/ModelPopularityChart.tsx, src/renderer/components/analytics/ModeUsageChart.tsx, src/renderer/components/analytics/SlashCommandChart.tsx, src/renderer/components/analytics/ToolCallChart.tsx, src/renderer/components/analytics/ProjectStatsChart.tsx

## 2026-04-19 02:45 GST (Dubai)
### Chat: Remove show more/show less collapsible content
Removed the `CollapsibleContent` component that truncated long messages at 600px and showed a "Show more" / "Show less" toggle. It was causing scrolling issues. Unwrapped the content in `AssistantTextRow` and `UserMessageRow` so messages render at full height. Deleted `CollapsibleContent.tsx`.

**Modified:** `src/renderer/components/chat/AssistantTextRow.tsx`, `src/renderer/components/chat/UserMessageRow.tsx`, `src/renderer/components/chat/CollapsibleContent.tsx` (deleted)

## 2026-04-19 02:28 GST (Dubai)
### SubagentDisplay: Show per-agent task descriptions and improve expanded layout
Each stage card now displays the agent's task description extracted from `prompt_template` (first meaningful line, truncated at 200 chars). Stages render in individual `bg-muted/30` cards with the robot icon. Overall task description shows below the header when it differs from the summary. Dependency indicator changed from clock icon to arrow icon with "depends on" label.

**Modified:** src/renderer/components/chat/SubagentDisplay.tsx

## 2026-04-19 02:27 GST (Dubai)
### SubagentDisplay: Replace users icon with robot, improve agent count badge
Swapped `IconUsers` for `IconRobot` with `aria-hidden` in the subagent header button. Added a violet pill badge around the agent count number for better visual clarity.

**Modified:** src/renderer/components/chat/SubagentDisplay.tsx

## 2026-04-19 01:55 GST (Dubai)
### Auth: Fix login screen stuck due to checkAuth race condition
`checkAuth()` ran before `loadSettings()` completed, so it used the default `kiro-cli` binary name. Inside a Tauri .app on macOS, `/opt/homebrew/bin` isn't in PATH, so the command failed silently and `kiroAuth` stayed null, trapping users on the sign-in screen. Two fixes: (1) Rust `kiro_whoami` now falls back to `detect_kiro_cli()` if the provided binary fails, (2) frontend chains `checkAuth` after `loadSettings` resolves.

**Modified:** `src-tauri/src/commands/fs_ops.rs`, `src/renderer/App.tsx`

## 2026-04-19 01:53 GST (Dubai)
### Window: Add quit confirmation dialog on Cmd+Q / window close
Intercept `CloseRequested` with `api.prevent_close()` and show a native confirmation dialog ("Quit" / "Cancel") before shutting down. Only calls `shutdown_app` and `app.exit(0)` if the user confirms. Uses `tauri_plugin_dialog` which was already registered.

**Modified:** `src-tauri/src/lib.rs`

## 2026-04-19 00:28 GST (Dubai)
### Persistence: Thread & state persistence across version updates
Fixed threads being lost during version updates. Root cause: `relaunch()` killed the process before `LazyStore`'s 500ms autoSave debounce flushed pending writes. Added `flush()` + `createBackup()` before every relaunch path, `beforeunload` safety net, and automatic backup restoration on startup. Also fixed `iconOverride` being silently dropped by the Rust `ProjectPrefs` struct (missing field). Added throttled periodic backups every 5 minutes.

**Modified:** `src-tauri/src/commands/settings.rs`, `src/renderer/lib/history-store.ts`, `src/renderer/lib/history-store.test.ts`, `src/renderer/lib/relaunch.ts`, `src/renderer/hooks/useUpdateChecker.ts`, `src/renderer/components/settings/updates-card.tsx`, `src/renderer/components/settings/AboutDialog.tsx`, `src/renderer/main.tsx`, `src/renderer/stores/taskStore.ts`, `src/renderer/stores/taskStore.test.ts`, `src/renderer/stores/settingsStore.ts`, `src/renderer/stores/settingsStore.test.ts`, `src/renderer/stores/task-store-listeners.ts`

## 2026-04-18 17:48 GST (Dubai)
### BranchSelector: Add local branch delete button
Added a trash icon button to each local branch row in the branch selector popup. The button appears on hover and deletes the branch locally via a new `git_delete_branch` Rust command using git2. Cannot delete the current branch or worktree-locked branches.

**Modified:**
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `src/renderer/lib/ipc.ts`
- `src/renderer/components/chat/BranchList.tsx`
- `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-18 17:47 GST (Dubai)
### BtwOverlay: Full-screen fixed overlay with centered card
Reworked the /btw overlay to use `fixed inset-0` positioning with `bg-black/50 backdrop-blur-sm` for a proper full-screen dialog overlay. Card is centered with `max-w-2xl`, rounded corners, and entrance animations (`zoom-in-95`, `fade-in-0`). Added `data-state` and `pointerEvents: auto` for dialog overlay consistency.

**Modified:**
- `src/renderer/components/chat/BtwOverlay.tsx`

## 2026-04-18 17:43 GST (Dubai)
### IconPicker: Add Food & Drinks and Faces & People emoji categories
Added two new emoji categories with 16 emojis each (32 total) plus searchable keywords for all new entries. Total emoji count is now 96 across six categories.

**Modified:**
- `src/renderer/components/sidebar/IconPickerDialog.tsx`

## 2026-04-18 17:41 GST (Dubai)
### IconPicker: Add emoji search with keyword matching
Added a search input to the emoji tab that filters emojis by keyword (e.g., typing "rocket" finds 🚀, "ai" finds 🤖 and 🧠). Each emoji has a curated keyword list. Empty results show a "no match" message.

**Modified:**
- `src/renderer/components/sidebar/IconPickerDialog.tsx`

## 2026-04-18 17:35 GST (Dubai)
### IconPicker: Add emoji tab with categorized emoji grid
Added an "Emoji" tab to the icon picker dialog with 64 emojis across four categories (Dev & Tech, Fun & Creative, Nature & Animals, Objects & Symbols). Extended the `iconOverride` type to support `{ type: 'emoji'; emoji: string }`, wired it through `useProjectIcon` and `ProjectIcon` so selected emojis render in the sidebar.

**Modified:**
- `src/renderer/types/index.ts`
- `src/renderer/components/sidebar/IconPickerDialog.tsx`
- `src/renderer/hooks/useProjectIcon.ts`
- `src/renderer/components/sidebar/ProjectIcon.tsx`

## 2026-04-18 17:43 GST (Dubai)
### IconPicker: Add Food & Drinks and Faces & People emoji categories
Added two new emoji categories with 16 emojis each (32 total) plus searchable keywords for all new entries. Total emoji count is now 96 across six categories.

**Modified:**
- `src/renderer/components/sidebar/IconPickerDialog.tsx`

## 2026-04-18 17:41 GST (Dubai)
### IconPicker: Add emoji search with keyword matching
Added a search input to the emoji tab that filters emojis by keyword (e.g., typing "rocket" finds 🚀, "ai" finds 🤖 and 🧠). Each emoji has a curated keyword list. Empty results show a "no match" message.

**Modified:**
- `src/renderer/components/sidebar/IconPickerDialog.tsx`

## 2026-04-18 17:35 GST (Dubai)
### IconPicker: Add emoji tab with categorized emoji grid
Added an "Emoji" tab to the icon picker dialog with 64 emojis across four categories (Dev & Tech, Fun & Creative, Nature & Animals, Objects & Symbols). Extended the `iconOverride` type to support `{ type: 'emoji'; emoji: string }`, wired it through `useProjectIcon` and `ProjectIcon` so selected emojis render in the sidebar.

**Modified:**
- `src/renderer/types/index.ts`
- `src/renderer/components/sidebar/IconPickerDialog.tsx`
- `src/renderer/hooks/useProjectIcon.ts`
- `src/renderer/components/sidebar/ProjectIcon.tsx`

## 2026-04-18 02:41 GST (Dubai)
### CI: Add label-triggered PR build workflow for DMG and EXE
Created `.github/workflows/pr-build.yml` that builds signed macOS `.dmg` and Windows `.exe` installers when the `build-test` label is added to a PR. Artifacts are uploaded as `kirodex-pr-{number}-{platform}` with 7-day retention. Created PR #16 against `fix/14-image-content-blocks` and added the label to trigger a test run.

**Modified:** `.github/workflows/pr-build.yml`

## 2026-04-18 02:12 GST (Dubai)
### Shortcuts: Ignore Escape key when terminal is focused
Added a guard to the global Escape keyboard shortcut so it doesn't stop the running agent when the user is typing in the terminal. Uses `closest('[data-testid="terminal-drawer"]')` to detect terminal focus.

**Modified:** src/renderer/hooks/useKeyboardShortcuts.ts

## 2026-04-18 02:00 GST (Dubai)
### Worktree: Add tooltip to worktree icons
Added "Worktree" tooltips to the git branch icons that indicate worktree threads in both the sidebar thread list and the header breadcrumb.

**Modified:** `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/header-breadcrumb.tsx`

## 2026-04-18 01:53 GST (Dubai)
### IconPicker: Fix file tab not showing project images
The icon picker's "Project File" tab showed "No image files found" due to three issues: the extension check matched without a dot prefix (e.g., `png` instead of `.png`), SVG files were silently dropped because the `imagesize` crate doesn't support vector formats, and the 100px max size filter was too restrictive. Fixed by adding dot prefixes to extensions, including SVGs with 0×0 dimensions, and making `max_size=0` mean "no limit." Frontend now passes 0 and displays "SVG" for vector files.

**Modified:** `src-tauri/src/commands/fs_ops.rs`, `src/renderer/components/sidebar/IconPickerDialog.tsx`

## 2026-04-18 02:20 GST (Dubai)
### Fix #14: Send images as proper ACP ContentBlock::Image
When a user attaches an image in Kirodex, the image data was embedded as base64 inside a plain text string and sent as a single `ContentBlock::Text` to kiro-cli via ACP. The AI agent couldn't properly understand the image. Fixed by adding a parallel structured attachments channel in the IPC — the frontend now sends `IpcAttachment[]` alongside the text message, and the Rust backend builds proper `ContentBlock::Image` entries in the `PromptRequest`. Image tags are stripped from the text content block to avoid sending base64 data twice over the ACP pipe. Added 14 new tests (5 TypeScript, 9 Rust).

**Modified:** `src/renderer/types/index.ts`, `src/renderer/components/chat/attachment-utils.ts`, `src/renderer/components/chat/attachment-utils.test.ts`, `src/renderer/lib/ipc.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/PendingChat.tsx`, `src-tauri/src/commands/acp/types.rs`, `src-tauri/src/commands/acp/commands.rs`, `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/mod.rs`, `src-tauri/src/commands/acp/tests.rs`

## 2026-04-18 01:39 GST (Dubai)
### Website: Fix changelog page rendering markdown links as raw text
The changelog renderer inserted list items as raw text without converting markdown `[text](url)` links to HTML `<a>` tags. Added a regex replace step that handles both `[text](url)` and `` [`text`](url) `` formats.

**Modified:** `website/changelog.html`

## 2026-04-18 01:32 GST (Dubai)
### Release notes: Link commit hashes to GitHub
Updated `scripts/generate-notes.sh` to include GitHub commit links in release notes. Each entry now renders as `description ([short-hash](url))`. Derives the repo URL from `git remote get-url origin`.

**Modified:** `scripts/generate-notes.sh`

## 2026-04-18 01:16 GST (Dubai)
### CodePanel: Enable diff toggle during pending messages
The diff toggle button in the header was visible when a project was selected but no task existed yet (pending state), but clicking it did nothing because `CodePanel` only rendered when `selectedTaskId` was set. Added a `git_diff` Rust command that takes a workspace path directly (no task ID needed), wired it through IPC, and updated `CodePanel` to accept an optional `workspace` prop. Updated `App.tsx` to render `CodePanel` when either `selectedTaskId` or `pendingWorkspace` is available.

**Modified:**
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `src/renderer/lib/ipc.ts`
- `src/renderer/components/code/CodePanel.tsx`
- `src/renderer/App.tsx`

## 2026-04-18 01:12 GST (Dubai)
### Git: Fix diff count mismatch between header bar and diff panel
`git_diff_stats` was summing stats from staged and unstaged diffs independently, causing files with both staged and unstaged changes to be double-counted. Switched to `Diff::merge()` to combine both diffs before computing stats, matching the behavior of the diff panel.

**Modified:**
- `src-tauri/src/commands/git.rs`

## 2026-04-18 01:14 GST (Dubai)
### CodePanel: Switch commit message generation to AI
Replaced local string-based commit message generation with AI-powered generation via `ipc.sendMessage`. Sends a compact prompt (file names + stats only) to the active agent, listens for `turn_end`, and extracts the first line of the response into the commit input. Shows a spinner while generating. Added `buildCommitPrompt` and `countDiffStats` to utils with 6 new tests (18 total).

**Modified:**
- `src/renderer/components/code/CodePanel.tsx`
- `src/renderer/components/code/commit-message-utils.ts`
- `src/renderer/components/code/commit-message-utils.test.ts`

## 2026-04-18 01:11 GST (Dubai)
### CodePanel: Add unit tests for commit message generation
Extracted `parseFileNames` and `generateCommitMessage` to `commit-message-utils.ts` and added 12 unit tests covering empty diffs, single/multiple files, addition/deletion counting, basename extraction, and the 100-char fallback.

**Modified:**
- `src/renderer/components/code/CodePanel.tsx`
- `src/renderer/components/code/commit-message-utils.ts` (new)
- `src/renderer/components/code/commit-message-utils.test.ts` (new)

## 2026-04-18 01:05 GST (Dubai)
### CodePanel: Add generate commit message button
Added an IconSparkles button next to the commit input that auto-generates a conventional commit message from diff stats (file names, +/- counts). Hidden when >30 files changed. Max 100 chars. Zero-token, instant, local generation.

**Modified:**
- `src/renderer/components/code/CodePanel.tsx`

## 2026-04-18 01:04 GST (Dubai)
### useSidebarTasks: Rename SortKey 'none' to 'created'
Renamed the `SortKey` value from `'none'` to `'created'` in `useSidebarTasks.ts` and updated all references in `TaskSidebar.tsx` (SORT_OPTIONS key and default useState). The label was already "Created" in the UI; now the code value matches.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-18 00:58 GST (Dubai)
### DiffToolbar: Add staged file count
Added a "N staged" indicator (blue text) to the DiffToolbar next to the +/- stats. Fetches staged stats via `ipc.gitStagedStats` in DiffViewer and passes the count down. Only shown when staged count > 0.

**Modified:**
- `src/renderer/components/code/DiffToolbar.tsx`
- `src/renderer/components/code/DiffViewer.tsx`

## 2026-04-18 00:58 GST (Dubai)
### Sidebar: Rename "None" sort label to "Created"
Renamed the default sort option from "None" to "Created" for clarity — communicates that threads appear in creation order.

**Modified:** `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-18 00:57 GST (Dubai)
### Sidebar: Add "None" sort option as default
Added a "None" sort option to the sidebar task sort dropdown that preserves insertion order (no reordering). Changed the default from "Recent" to "None" so tasks stop jumping around on activity changes.

**Modified:** `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-18 00:55 GST (Dubai)
### DiffPanel/DiffFileActionBar: Stage button icon swaps from + to checkmark
After clicking the stage button (per-file or batch), the icon changes from IconPlus to IconCheck for 1.5 seconds as a success indicator. The tooltip and aria-label update accordingly.

**Modified:**
- `src/renderer/components/code/DiffFileActionBar.tsx`
- `src/renderer/components/code/DiffViewer.tsx`
- `src/renderer/components/diff/DiffPanel.tsx`

## 2026-04-18 00:54 GST (Dubai)
### CodePanel: Move commit input to bottom of panel
Moved the commit input from the collapsible DiffFileSidebar to the bottom of the CodePanel so it's always visible. Reverted DiffFileSidebar to its original state. The input is disabled when there are no changes or no workspace.

**Modified:**
- `src/renderer/components/code/CodePanel.tsx`
- `src/renderer/components/code/DiffFileSidebar.tsx`
- `src/renderer/components/code/DiffViewer.tsx`

## 2026-04-18 00:48 GST (Dubai)
### DiffFileSidebar: Add commit input at bottom of file list
Added a commit message input with a commit button at the bottom of the Files Changed sidebar. The input calls `ipc.gitCommit` on Enter or button click, shows a loading spinner while committing, and is disabled when there are no changed files or no workspace. After a successful commit, the diff refreshes automatically.

**Modified:**
- `src/renderer/components/code/DiffFileSidebar.tsx`
- `src/renderer/components/code/DiffViewer.tsx`

## 2026-04-18 00:39 GST (Dubai)
### UI: Revert sidebar toggle button move
Reverted the sidebar toggle button back to the header breadcrumb. All five files restored to their pre-move state.

**Modified:**
- `src/renderer/App.tsx`
- `src/renderer/components/AppHeader.tsx`
- `src/renderer/components/header-breadcrumb.tsx`
- `src/renderer/components/sidebar/SidebarFooter.tsx`
- `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-18 00:34 GST (Dubai)
### UI: Move sidebar toggle button from header to sidebar footer
Removed the toggle sidebar button from the header breadcrumb and placed it at the bottom of the sidebar footer as a "Collapse" button with the appropriate directional icon. Cleaned up unused props from `AppHeader` and `HeaderBreadcrumb`. The `onToggleSidebar` callback now flows through `TaskSidebar` to `SidebarFooter`.

**Modified:**
- `src/renderer/App.tsx`
- `src/renderer/components/AppHeader.tsx`
- `src/renderer/components/header-breadcrumb.tsx`
- `src/renderer/components/sidebar/SidebarFooter.tsx`
- `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-18 00:32 GST (Dubai)
### TaskStore: Clear isArchived flag when restoring a deleted thread
Restored threads were still marked `isArchived: true`, rendering them read-only. Now `restoreTask` sets `isArchived: false` so the thread is fully interactive again.

**Modified:**
- `src/renderer/stores/taskStore.ts`

## 2026-04-18 00:31 GST (Dubai)
### Settings: Show search results in main content area with click-to-navigate
Moved search results from the sidebar into the main content panel as clickable cards. Each card shows the setting name, description, and a section badge. Clicking navigates to that section. Empty state shows a "no results" message. Sidebar still shows matching results as a secondary nav.

**Modified:**
- `src/renderer/components/settings/SettingsPanel.tsx`

## 2026-04-18 00:27 GST (Dubai)
### Settings: Add search, restore defaults, and Archives section
Added a search input in the settings sidebar that filters all settings by label, description, and keywords, navigating to the matching section on click. Added a "Restore defaults" button in the header bar that resets the draft to default values. Created a new "Archives" nav section for deleted threads, moving the `DeletedThreadsRestore` component out of Advanced.

**Modified:**
- `src/renderer/components/settings/SettingsPanel.tsx`
- `src/renderer/components/settings/settings-shared.tsx`
- `src/renderer/components/settings/advanced-section.tsx`
- `src/renderer/components/settings/archives-section.tsx` (new)

## 2026-04-18 00:20 GST (Dubai)
### UI: Remove fork functionality from all UI components

Removed all fork-related UI: header toolbar fork button, fork buttons on user messages (MessageItem, UserMessageRow), fork context menu in ThreadItem, fork slash command (/fork), fork system message variant rendering, and fork detection in timeline derivation. Rust backend (`task_fork` command) and Zustand store layer (`forkTask`, `isForking`) preserved as requested.

**Modified:**
- src/renderer/components/header-toolbar.tsx
- src/renderer/components/chat/MessageItem.tsx
- src/renderer/components/chat/UserMessageRow.tsx
- src/renderer/components/chat/SystemMessageRow.tsx
- src/renderer/components/sidebar/ThreadItem.tsx
- src/renderer/components/sidebar/ProjectItem.tsx
- src/renderer/components/sidebar/TaskSidebar.tsx
- src/renderer/hooks/useSlashAction.ts
- src/renderer/hooks/useChatInput.ts
- src/renderer/lib/timeline.ts

## 2026-04-17 23:53 GST (Dubai)
### Security: Skills security audit (5-phase)

Conducted a full 5-phase security audit of all 24 installed skills across ~/.kiro/skills/ and ~/.agents/skills/. Found one CRITICAL issue: the `strapi-expert` skill contains two zip files bundling Windows executables (luajit.exe, lua51.dll) with obfuscated Lua scripts disguised as .txt files, launched via Launcher.cmd. The README promotes downloading and running these files. 21 of 24 skills are clean markdown-only. Two skills (caveman-compress, android-emulator-skill) have expected subprocess usage.

**Modified:** SKILLS_SECURITY_AUDIT.md

## 2026-04-17 23:49 GST (Dubai)
### Security: Full codebase security audit

Conducted a comprehensive security audit of the entire Kirodex codebase covering Tauri config, all Rust backend commands, frontend IPC layer, dependencies, and secrets handling. Identified 1 critical finding (sandbox bypass via root path), 4 high findings (unrestricted file reads, command injection in osascript calls, git worktree shelling out), and 7 medium findings. Created SECURITY_AUDIT.md with prioritized remediation recommendations.

**Modified:** SECURITY_AUDIT.md

## 2026-04-17 23:18 GST (Dubai)

### Performance: All 16 optimization tasks complete

Completed full performance audit across Rust backend, Tauri plugins, React frontend, and bundle optimization. 168 Rust tests pass, TypeScript clean, Vite build succeeds.

**Modified:** 50+ files across src-tauri/ and src/renderer/

## 2026-04-17 23:10 GST (Dubai)

### Chat: Implement /btw (tangent mode) slash command

Added `/btw <question>` and `/tangent` slash commands that let users ask side questions in a floating overlay without polluting the main conversation history. The question is sent to ACP normally (full context visibility), and the response streams into a dismissible overlay. Press Escape to discard the Q&A, or click Keep to preserve it (tail mode). Also added Cmd+B keyboard shortcut and updated docs.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useSlashAction.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/hooks/useKeyboardShortcuts.ts`, `src/renderer/components/chat/BtwOverlay.tsx` (new), `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/SlashCommandPicker.tsx`, `docs/slash-commands.md`, `docs/keyboard-shortcuts.md`

## 2026-04-17 17:04 (Dubai) — Component decomposition

Decomposed three large components into smaller units (all under 200 lines each).

### Onboarding (480 → 62 lines shell)
- `onboarding-shared.tsx` (102 lines) — types, constants, CopyButton, CommandRow, LoginMethod
- `OnboardingWelcomeStep.tsx` (35 lines) — welcome screen
- `OnboardingThemeStep.tsx` (34 lines) — theme picker screen
- `OnboardingCliSection.tsx` (116 lines) — CLI detection + install commands
- `OnboardingAuthSection.tsx` (102 lines) — auth check + login flow
- `OnboardingSetupStep.tsx` (75 lines) — setup step shell composing CLI + Auth sections
- `Onboarding.tsx` (62 lines) — thin shell with step navigation

### KiroConfigPanel (418 → 160 lines shell)
- `kiro-config-helpers.tsx` (129 lines) — helpers, types, STACK_META, SectionToggle, SourceDot, InlineSearch
- `KiroAgentSection.tsx` (66 lines) — AgentStackGroup + AgentRow
- `KiroSkillRow.tsx` (24 lines) — SkillRow
- `KiroSteeringRow.tsx` (37 lines) — SteeringRow
- `KiroMcpRow.tsx` (46 lines) — McpRow
- `KiroConfigPanel.tsx` (160 lines) — thin shell

### DiffViewer (418 → 154 lines shell)
- `diff-viewer-utils.ts` (43 lines) — UNSAFE_CSS, FileStats, getFileStats
- `DiffToolbar.tsx` (66 lines) — toolbar with view controls
- `DiffFileActionBar.tsx` (74 lines) — per-file action bar with stage/revert/open
- `DiffFileSidebar.tsx` (50 lines) — file list sidebar
- `DiffViewer.tsx` (154 lines) — thin shell

### Verification
- `npx vite build` — passed
- `bun run check:ts` — passed (pre-existing unrelated error in AutoApproveToggle.test.ts)
