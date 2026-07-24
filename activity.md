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
