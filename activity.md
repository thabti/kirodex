## 2026-08-14 11:00 GST (Dubai)

### Release: Prepared v0.66.1

Prepared the patch release for the model-aware reasoning effort controls, compact chat-input picker, and app-shell spacing refinements. Synchronized the application version across package and Tauri metadata and generated the release changelog.

**Modified:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, `activity.md`

## 2026-08-14 10:57 GST (Dubai)

### Chat input effort picker: Added model-aware compact controls

Made the chat-toolbar effort popover smaller and easier to scan, with compact hints, clearer loading and unsupported-model states, keyboard focus handling, and model-specific options loaded live from Kiro CLI. Added end-to-end component coverage from toolbar selection through the effort IPC call, protocol tests for the options extension, and completed a shadcn-style accessibility and token audit.

**Modified:** `src/renderer/components/chat/ReasoningEffortPicker.tsx`, `src/renderer/components/chat/ReasoningEffortPicker.test.tsx`, `src/renderer/lib/ipc.ts`, `src-tauri/src/commands/acp/commands.rs`, `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/mod.rs`, `src-tauri/src/commands/acp/tests.rs`, `src-tauri/src/commands/acp/types.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/web.rs`, `README.md`, `docs/slash-commands.md`, `activity.md`

## 2026-08-14 10:48 GST (Dubai)

### Reasoning effort: Switched to Kiro CLI's live ACP command

Replaced the session-restart effort flow with Kiro CLI 2.9's live `_kiro.dev/commands/execute` extension, applied restored effort only after the selected model is active, and surfaced model-specific CLI rejection messages. Added protocol-shape and response tests, updated the web transport and slash-command documentation, and verified the implementation against the installed CLI plus the complete frontend and Rust test suites.

**Modified:** `src-tauri/src/commands/acp/commands.rs`, `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/mod.rs`, `src-tauri/src/commands/acp/tests.rs`, `src-tauri/src/commands/acp/types.rs`, `src-tauri/src/web.rs`, `src/renderer/hooks/useSlashAction.test.ts`, `src/renderer/lib/ipc.ts`, `src/renderer/lib/reasoning-effort.ts`, `docs/slash-commands.md`, `activity.md`

## 2026-08-14 10:31 GST (Dubai)

### App shell and chat input: Balanced bottom spacing and title alignment

Added a consistent safe-area-aware bottom gutter to the expanded and collapsed chat composer, and aligned the desktop breadcrumb row with the macOS traffic-light center by using the shared 44px title-bar height. Verified the rendered geometry in the live app, reviewed the component spacing, and passed TypeScript, focused UI tests, lint with no errors, and the production renderer build.

**Modified:** `src/renderer/components/AppHeader.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `activity.md`

## 2026-08-13 15:38 GST (Dubai)

### Release: Prepared v0.66.0 across every package surface

Prepared the feature-sized v0.66.0 release, corrected the version bump so a stale Rust package version is synchronized, ensured Cargo.lock is committed, and filtered automated analytics snapshots from generated release notes. Aligned the release inputs so GitHub Actions can build, sign, and publish every platform artifact from the tag.

**Modified:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, `scripts/bump-version.sh`, `scripts/release.sh`, `scripts/generate-notes.sh`, `activity.md`

## 2026-08-13 15:27 GST (Dubai)

### Loading states: Removed the warning-style surface

Removed the red loading-state background, border, pill radius, and shadow in favor of a transparent inline sparkle, neutral status label, and muted timer. Reduced horizontal padding, deleted the unused handoff surface tokens, added regression coverage for the transparent treatment, and passed TypeScript, the full UI suite, lint, and the production renderer build.

**Modified:** `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/tailwind.css`, `activity.md`

## 2026-08-13 15:25 GST (Dubai)

### Sidebar: Softened selection and hover states

Reduced project and thread hover fills, lowered the selected-thread accent strength, and tightened selected row radii while keeping selection clear through typography and status indicators. Verified selected/hover/regular rows side by side in the live app, confirmed semantic selection and zero critical accessibility findings, and passed the full UI suite, TypeScript, lint, and production renderer build.

**Modified:** `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectItem.test.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/ThreadItem.test.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `activity.md`

## 2026-08-13 15:19 GST (Dubai)

### Sidebar and loading states: Flattened and simplified

Reduced the project-to-thread inset from 24px to 8px, tightened project/thread rows, gutters, empty states, and shortcut badges, and replaced the multi-avatar loading sequence with one compact reasoning chip. Added density regressions and verified the live layout, collapse and modifier behavior, stable loading geometry, accessibility, the full UI suite, TypeScript, lint, and the production renderer build.

**Modified:** `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectItem.test.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/ThreadItem.test.tsx`, `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/tailwind.css`, `activity.md`

## 2026-08-13 15:15 GST (Dubai)

### Chat input: Unified the reasoning-effort picker

Changed the bare `/effort` command to open the existing reasoning-effort menu in the chat toolbar and removed the duplicate full-width slash panel implementation. Kept direct commands such as `/effort high` intact, added command-routing coverage, and verified the change with TypeScript checks, focused tests, a component-pattern review, and the production renderer build.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/chat/ReasoningEffortPicker.tsx`, `src/renderer/components/chat/SlashPanels.tsx`, `src/renderer/components/chat/EffortPickerPanel.tsx` (removed), `src/renderer/components/chat/EffortPickerPanel.test.tsx` (removed), `src/renderer/hooks/useChatInput.ts`, `src/renderer/hooks/useSlashAction.ts`, `src/renderer/hooks/useSlashAction.test.ts`, `docs/slash-commands.md`, `activity.md`

## 2026-08-13 15:05 GST (Dubai)

### Loading states: Refined handoff hierarchy and motion

Reworked the compact handoff state into a clear user-to-reasoning-to-code sequence with distinct Tabler icons, lighter avatar outlines, smaller progress dots, and balanced pill spacing. Limited cycling animation to the changing verb, reserved stable label/timer widths to eliminate layout jitter, and verified contrast, live-status semantics, 0px width drift, the full UI suite, lint, and the production build.

**Modified:** `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `activity.md`

## 2026-08-13 14:45 GST (Dubai)

### Loading states: Reduced handoff density

Tightened the agent handoff loader with smaller participant circles, shorter pills, narrower gaps and horizontal padding, and reduced timeline whitespace while preserving its status announcement and reduced-motion behavior. Added a compact-density regression test and verified the result in the live app plus the full frontend validation suite.

**Modified:** `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `activity.md`

## 2026-08-13 14:41 GST (Dubai)

### Sidebar: Restored compact project tree

Removed the recently added sidebar search and bulky two-line card treatment, restored a 240px compact project tree with project/framework/folder icons, and returned threads to single-line rows with status/history indicators, shortcuts, and recency. Flattened pinned and side-by-side groups to the same density, then verified collapse, keyboard resizing, dropdowns, accessibility, tests, lint, and the production renderer build.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectIcon.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `activity.md`

## 2026-08-13 14:24 GST (Dubai)

### App shell and agent controls: Review hardening

Reviewed the recent sidebar, loading-state, platform-title-bar, task-creation, and reasoning-effort work end to end. Fixed cross-platform modifier/control placement, transactional ACP reconnection, misleading worktree fallback behavior, thread accessibility/search previews, macOS traffic-light consistency, composer labels, and reference-aligned bot-face loading visuals; verified the result in a live browser and with the full TypeScript, UI, Rust, lint, and production renderer gates.

**Modified:** `src-tauri/src/commands/acp/commands.rs`, `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/tests.rs`, `src-tauri/src/commands/acp/types.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/web.rs`, `src/renderer/App.tsx`, `src/renderer/components/AppHeader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/ChatTextarea.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/chat/EffortPickerPanel.tsx`, `src/renderer/components/chat/EffortPickerPanel.test.tsx`, `src/renderer/components/chat/PendingChat.tsx`, `src/renderer/components/chat/PendingChat.test.tsx`, `src/renderer/components/chat/ReasoningEffortPicker.tsx`, `src/renderer/components/chat/SlashCommandPicker.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectItem.test.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/ThreadItem.test.tsx`, `src/renderer/components/unified-title-bar/WindowsControls.tsx`, `src/renderer/hooks/useModifierKeys.ts`, `src/renderer/hooks/useModifierKeys.test.ts`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/hooks/useSidebarTasks.test.ts`, `src/renderer/lib/platform.ts`, `src/renderer/lib/platform.test.ts`, `src/renderer/lib/reasoning-effort.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/types/index.ts`, `src/tailwind.css`, `activity.md`

## 2026-08-13 13:11 GST (Dubai)

### Chat and sidebar: Avatar handoff loading states

Added the supplied avatar-pill treatment to thread creation, agent working/streaming, and lazy chat loading states with reduced-motion and live-region support. Widened the sidebar to the 280px reference proportion and added two-line nested thread rows with stable previews, recency, status avatars, and keyboard selection.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/chat/AgentHandoffLoader.tsx`, `src/renderer/components/chat/AgentHandoffLoader.test.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/chat/PendingChat.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/renderer/components/sidebar/ProjectItem.test.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/hooks/useSidebarTasks.test.ts`, `src/tailwind.css`, `activity.md`

## 2026-08-13 13:00 GST (Dubai)

### Sidebar: Simplified project tree and workspace contrast

Restyled the app shell after the supplied reference so the near-black sidebar sits directly against a lighter main workspace. Added compact project/thread search, clearer nested thread guides, calmer project actions, and platform-aware title-bar spacing for macOS, Windows, and Linux.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/AppHeader.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`, `src/tailwind.css`, `activity.md`

## 2026-08-13 12:15 GST (Dubai)

### Reasoning effort: Clearer and accessible controls

Improved the toolbar and slash-command effort pickers with level descriptions, next-message timing, visible current and pending states, running-turn guidance, inline errors, responsive scrolling, keyboard navigation, focus restoration, and accessible live updates. Added focused interaction tests and aligned the slash-command guide with the new guidance.

**Modified:** `src/renderer/components/chat/ReasoningEffortPicker.tsx`, `src/renderer/components/chat/EffortPickerPanel.tsx`, `src/renderer/components/chat/EffortPickerPanel.test.tsx`, `src/renderer/components/chat/PanelShell.tsx`, `src/renderer/lib/reasoning-effort.ts`, `docs/slash-commands.md`

## 2026-08-13 12:08 GST (Dubai)

### Chat and ACP: Persistent reasoning effort

Added local `/effort` handling and toolbar/panel controls for low, medium, high, xhigh, and max reasoning. Each thread persists its level, and desktop plus built-in web mode recreate idle Kiro CLI ACP sessions with `--effort` while replaying conversation context on the next prompt.

**Modified:** `README.md`, `docs/slash-commands.md`, `website/features.html`, `src-tauri/src/commands/acp/types.rs`, `src-tauri/src/commands/acp/connection.rs`, `src-tauri/src/commands/acp/commands.rs`, `src-tauri/src/commands/acp/tests.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/web.rs`, `src/renderer/App.tsx`, `src/renderer/types/index.ts`, `src/renderer/lib/ipc.ts`, `src/renderer/lib/history-store.ts`, `src/renderer/lib/reasoning-effort.ts`, `src/renderer/stores/task-store-types.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/stores/taskStore.test.ts`, `src/renderer/stores/task-store-selectors.test.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/hooks/useSlashAction.ts`, `src/renderer/hooks/useSlashAction.test.ts`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/chat/SlashCommandPicker.tsx`, `src/renderer/components/chat/SlashPanels.tsx`, `src/renderer/components/chat/EffortPickerPanel.tsx`, `src/renderer/components/chat/ReasoningEffortPicker.tsx`

## 2026-06-30 09:24 GST (Dubai)

### PR Review: Web mode hardening

Addressed GitHub review feedback for the built-in web server mode by tightening token/public-host handling, canonicalizing static bundle paths, securing HTTPS-proxied cookies, validating browser RPC override URLs, and surfacing ACP file I/O failures. Updated desktop-runtime tests so the new browser guard does not break mocked Tauri suites.

**Modified:** `src-tauri/src/web.rs`, `src/renderer/lib/web-rpc.ts`, `src/renderer/lib/history-store.test.ts`, `src/renderer/components/unified-title-bar/unified-title-bar.test.tsx`, `src/renderer/hooks/useAttachments.test.ts`, `src/renderer/hooks/useUpdateChecker.test.ts`

## 2026-06-29 15:01 GST (Dubai)

### Mobile UI: Responsive browser polish

Improved the mobile web experience with a drawer-style sidebar, compact header controls, full-screen mobile side panels for files/diffs, safer chat input spacing, narrower message padding, and a stacked settings layout for phone widths. Desktop keeps its existing column/sidebar behavior while mobile prioritizes the chat surface and reachable controls.

**Modified:** `src/renderer/App.tsx`, `src/renderer/components/AppHeader.tsx`, `src/renderer/components/header-breadcrumb.tsx`, `src/renderer/components/header-toolbar.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatTextarea.tsx`, `src/renderer/components/chat/ChatToolbar.tsx`, `src/renderer/components/code/CodePanel.tsx`, `src/renderer/components/file-tree/FileTreePanel.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`

## 2026-06-29 10:51 GST (Dubai)

### Web Mode: Built-in browser server

Added a standalone `kirodex serve` path with token-protected Axum HTTP/WebSocket JSON-RPC, dev-UI redirects, static UI serving, shared event fanout, web PTY/task/git/settings dispatch, and browser-safe frontend transport. Updated renderer persistence/runtime adapters so browser clients use server-backed storage while desktop keeps Tauri IPC and LazyStore behavior.

**Modified:** `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/web.rs`, `src-tauri/src/commands/fuzzy.rs`, `src-tauri/src/commands/highlight.rs`, `src/renderer/lib/web-rpc.ts`, `src/renderer/lib/ipc.ts`, `src/renderer/lib/history-store.ts`, `src/renderer/App.tsx`, `src/renderer/main.tsx`, `src/renderer/stores/fileTreeStore.ts`, `src/renderer/hooks/useAttachments.ts`, `src/renderer/hooks/useUpdateChecker.ts`, `src/renderer/hooks/useZoomLimit.ts`, `src/renderer/lib/analytics.ts`, `src/renderer/lib/jsInterceptors.ts`, `src/renderer/lib/notifications.ts`, `src/renderer/components/AppHeader.tsx`, `src/renderer/components/file-tree/TreeContextMenu.tsx`, `src/renderer/components/settings/AboutDialog.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/components/settings/updates-card.tsx`, `src/renderer/components/sidebar/KiroConfigPanel.tsx`, `src/renderer/components/unified-title-bar/TrafficLights.tsx`, `src/renderer/components/unified-title-bar/WindowsControls.tsx`

## 2026-06-02 17:19 GST (Dubai)

### Sidebar: Finder-style visual polish

Applied Finder-inspired grouped section styling to TaskSidebar. Sections (Pinned, Side-by-side, Projects) now have rounded `bg-muted/30` background containers with `p-1` internal padding. Tightened item heights from h-8 to h-7, switched to `gap-px` between items, and refined section labels to `muted-foreground/70`. Replaced the centered thin-bar divider with a subtle full-width `bg-border/20` line.

**Modified:** `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/ProjectItem.tsx`

## 2025-06-02 13:59 GST (Dubai)

### Memory: Fix 5 memory leaks causing macOS unresponsiveness

Implemented all 5 fixes identified in the memory audit:
1. Capped `deletedTaskIds` at 500 entries (FIFO eviction) across all 6 mutation sites
2. Rust `task_cancel` now removes tasks from `AcpState.tasks` HashMap after status emit
3. Capped `softDeleted` at 50 entries (oldest evicted) across all 3 build-up sites
4. Watchdog interval now prunes orphaned `lastActivityMs`/`refusalRetried` entries every 10s
5. Window focus handler bulk-clears `notifiedTaskIds` instead of being a no-op

**Modified:** src/renderer/stores/taskStore.ts, src/renderer/stores/task-store-listeners.ts, src/renderer/App.tsx, src-tauri/src/commands/acp/commands.rs

---

## 2025-06-02 13:53 GST (Dubai)

### Memory: Full memory leak and unresponsiveness audit

Comprehensive review of Rust backend and React frontend for memory leaks causing macOS unresponsiveness. Identified 5 critical issues: unbounded `deletedTaskIds` Set, Rust `AcpState.tasks` HashMap retaining cancelled tasks, `softDeleted` holding full task objects for 48h, leaked `lastActivityMs`/`refusalRetried` records in listener closures, and unbounded `notifiedTaskIds` array. Proposed targeted fixes for each.

**Modified:** activity.md (created)
