# Kirodex Tauri Activity Log

## 2026-04-12 18:59 GST (Dubai)

### Chat: Add /close and /exit slash commands with Cmd+W shortcut

Added `/close` and `/exit` slash commands that cancel, remove, and delete the current thread. Fixed Cmd+W (macOS) / Ctrl+W (Windows/Linux) to `preventDefault` so it closes the thread instead of the native browser/app window.

**Modified:** src/renderer/hooks/useChatInput.ts, src/renderer/hooks/useSlashAction.ts, src/renderer/hooks/useKeyboardShortcuts.ts

## 2026-04-12 11:32 GST (Dubai)

### ACP: Fix plan mode not sent to backend on new task creation

When switching to /plan mode and then starting a new thread, the mode was lost because `createTask` never passed `currentModeId` to the backend, and the Rust `CreateTaskParams.mode_id` field was dead code. Fixed by wiring `mode_id` through `spawn_connection` → `run_acp_connection`, applying it via `set_session_mode` after session creation. Frontend now passes `currentModeId` from settingsStore when creating draft tasks. Added 11 unit tests for mode switching validation.

**Modified:** src-tauri/src/commands/acp.rs, src/renderer/lib/ipc.ts, src/renderer/components/chat/ChatPanel.tsx, src/renderer/components/chat/PendingChat.tsx, src/renderer/hooks/useSlashAction.test.ts

## 2026-04-12 11:20 GST (Dubai)

### DiffViewer: Make diff line color overlays a very thin layer

Reduced the opacity of addition/deletion background color overlays in the diff panel. Changed `color-mix` percentages in `UNSAFE_CSS`: backgrounds 92%→97% (3% color), emphasis 82%→92% (8% color), line numbers 88%→95% (5% color), hover 86%→93% (7% color). Updated both DiffViewer.tsx and DiffPanel.tsx to stay in sync.

**Modified:** src/renderer/components/code/DiffViewer.tsx, src/renderer/components/diff/DiffPanel.tsx

## 2026-04-12 11:12 GST (Dubai)

### AppHeader: Revert top navigation changes from unified title bar migration

Compared all changes between v0.8.6 and HEAD related to traffic lights, window borders, and top navigation. Reverted only the top navigation changes: restored the `<header>` element with `data-tauri-drag-region`, `handleHeaderMouseDown` drag handler, `pl-[90px]` padding, and `getCurrentWindow` import. Removed the `<UnifiedTitleBar>` wrapper from AppHeader. Restored `#root` height to `calc(100% - 28px)`. Kept all traffic light, border/corner radius, scrollbar, and empty state changes intact.

**Modified:** src/renderer/components/AppHeader.tsx, src/tailwind.css

## 2026-04-12 03:23 GST (Dubai)

### Chat: Inline image embedding in message context

Changed image handling so `[Image filename.png]` tags are replaced in-place with base64 `<image>` tags instead of being appended as a disconnected block at the end of the message. Added `buildMessageWithInlineImages` to attachment-utils.ts and updated useChatInput.ts to use it. Non-image attachments and images without inline tags still get appended normally.

**Modified:** src/renderer/components/chat/attachment-utils.ts, src/renderer/hooks/useChatInput.ts

## 2026-04-12 03:17 GST (Dubai)

### AppHeader: Redesign UserMenu dropdown with About section and inline update check

Redesigned the UserMenu dropdown to be wider (w-64), with three clear sections: account info at top, actions in the middle (refresh/sign out/settings), and an About footer with version number, copyright, and an inline "Check for updates" button. The update button shows a spinner while checking, highlights in primary when an update is available, and stays subtle otherwise. Also fixed the fetch models button in SettingsPanel to show spinner + "Loading…" text during loading.

**Modified:** src/renderer/components/AppHeader.tsx, src/renderer/components/settings/SettingsPanel.tsx

## 2026-04-12 03:18 GST (Dubai)

### Shiki stub: Fix diff viewer losing red/green line coloring

The shiki stub's `codeToTokens` was changed (in `6093545`) to return actual tokens per line instead of empty tokens. This caused `@pierre/diffs` to use those tokens for rendering instead of falling back to its own diff-aware line coloring (addition/deletion backgrounds). Reverted `codeToTokens` and `codeToTokensBase` to return `tokens: []` so the diff viewer shows proper red/green line highlighting again.

**Modified:** `src/renderer/lib/shiki-stub.ts`

### ToolCallEntry: Fall back to content-based diff when git diff is empty

When a tool call's file changes were already committed, `gitDiffFile` returned an empty string and the inline diff never rendered. Now generates a unified diff from the tool call's `oldText`/`newText` content using the `diff` library as a fallback.

**Modified:** `src/renderer/components/chat/ToolCallEntry.tsx`

## 2026-04-12 03:03 GST (Dubai)

### App: Redesign EmptyState to minimal focused layout

Removed skeleton chat messages, ghost ChatInput, and absolute-positioned overlays from EmptyState. Replaced with a clean centered layout: primary icon, heading, subtitle, inline LoginBanner, and a single CTA button. No more fake UI elements.

**Modified:** src/renderer/App.tsx

## 2026-04-12 03:00 GST (Dubai)

### App: Add border radius to chat panel content area

Added `rounded-xl` to the main content container div in App.tsx that wraps ChatPanel, PendingChat, and EmptyState. This gives the chat/message area softer rounded corners for a more polished appearance.

**Modified:** src/renderer/App.tsx

## 2026-04-12 02:58 GST (Dubai)

### SettingsPanel: Slim down section headers and reduce bulk

Replaced bulky SectionHeader (icon box + long descriptions) with lightweight SectionLabel (uppercase text only). Shortened all setting descriptions to one-liners. Merged Connection + Model into a single card. Tightened row padding, button sizes, and input heights. Reduced section spacing from space-y-8 to space-y-6.

**Modified:** src/renderer/components/settings/SettingsPanel.tsx

## 2026-04-12 02:48 GST (Dubai)

### SettingsPanel: Redesign with improved UX and information hierarchy

Rewrote SettingsPanel with better UX flow inspired by Dribbble settings page patterns. Replaced custom Toggle with Radix Switch component, extracted reusable SettingRow/SectionHeader/SettingsCard/Divider components, improved section grouping with wrapping divs and descriptive headers, increased vertical rhythm (space-y-8), and consistent row layout with label+description on left and control on right.

**Modified:** src/renderer/components/settings/SettingsPanel.tsx

## 2026-04-12 02:46 GST (Dubai)

### Sidebar: Sort and time display by most recent message activity

Sort Recent now sorts threads and projects by the timestamp of the most recent message (not creation time). The elapsed time shown on each thread also reflects the last message, not the oldest. Added `lastActivityAt` to `SidebarTask`, derived from the last message's timestamp with a fallback to `createdAt`.

**Modified:** src/renderer/hooks/useSidebarTasks.ts, src/renderer/components/sidebar/ThreadItem.tsx

## 2026-04-12 02:43 GST (Dubai)

### Docs: Sync AGENTS.md with CLAUDE.md

Copied CLAUDE.md to AGENTS.md so both files have identical content. AGENTS.md was missing the project overview, tech stack, structure, conventions, and engineering learnings sections.

**Modified:** AGENTS.md

## 2026-04-12 02:16 (Dubai)

**Task:** Switch Kirodex from native titlebar overlay to custom traffic lights (Option B)

**Changes made:**
- **tauri.conf.json:** Removed `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `macOSPrivateApi: true`
- **Cargo.toml:** Removed `cocoa` dependency and `macos-private-api` feature from tauri
- **lib.rs:** Replaced Sidebar vibrancy + cocoa NSColor hack with simple `HudWindow` vibrancy + 12px corner radius
- **tailwind.css:** Fixed `#root` to `100vh` with `border-radius: 12px`, added macOS traffic light CSS styles
- **Created 7 components** in `unified-title-bar/`: TrafficLights, WindowsControls, TitleBarToolbar, UnifiedTitleBarMacOS/Windows/Linux, index
- **AppHeader.tsx:** Removed `pl-[90px]` hack, wrapped content in `UnifiedTitleBar`
- **cargo check:** Passed cleanly
## 2026-04-12 16:00 GST (Dubai)

### Chat: Full message area UX overhaul — typography, spacing & visual polish

Overhauled the entire chat message area for a more spacious, polished feel inspired by modern AI coding interfaces. Body text bumped from 13px to 15px, secondary text from 11px to 13px, micro labels from 10px to 11px. Line height increased to 1.7 for prose. Generous vertical breathing room added between messages. Tool calls, question cards, thinking display, permission banners, completion cards, inline diffs, and changed files summary all received proportional size and spacing increases.

**Modified:** `src/tailwind.css`, `src/renderer/components/chat/ChatMarkdown.tsx`, `src/renderer/components/chat/UserMessageRow.tsx`, `src/renderer/components/chat/AssistantTextRow.tsx`, `src/renderer/components/chat/WorkGroupRow.tsx`, `src/renderer/components/chat/ToolCallDisplay.tsx`, `src/renderer/components/chat/ToolCallEntry.tsx`, `src/renderer/components/chat/QuestionCards.tsx`, `src/renderer/components/chat/CollapsedAnswers.tsx`, `src/renderer/components/chat/ThinkingDisplay.tsx`, `src/renderer/components/chat/WorkingRow.tsx`, `src/renderer/components/chat/SystemMessageRow.tsx`, `src/renderer/components/chat/PermissionBanner.tsx`, `src/renderer/components/chat/TaskCompletionCard.tsx`, `src/renderer/components/chat/TaskListDisplay.tsx`, `src/renderer/components/chat/InlineDiff.tsx`, `src/renderer/components/chat/ChangedFilesSummary.tsx`, `src/renderer/components/chat/MessageList.tsx`
### Chat: Thread draft saving

Added per-workspace draft saving so users don't lose typed content when navigating away from a new thread. Drafts are stored in-memory in the task store, auto-saved on keystroke (300ms debounce), and shown in the sidebar with a "Draft" badge. Clicking a draft navigates back to PendingChat with the content restored; sending clears the draft.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useChatInput.ts`, `src/renderer/hooks/useSidebarTasks.ts`, `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/PendingChat.tsx`, `src/renderer/components/sidebar/ThreadItem.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-12 02:19 (Dubai)

Removed macOS private API usage and custom title bar styling. Switched to standard window decorations with HudWindow vibrancy and 12px corner radius.

Changes made:
- `src-tauri/tauri.conf.json`: Removed `macOSPrivateApi: true`, `titleBarStyle: "Overlay"`, and `hiddenTitle: true` from window config
- `src-tauri/Cargo.toml`: Confirmed `tauri` features already empty (`[]`); removed `cocoa = "0.26.1"` macOS dependency
- `src-tauri/src/lib.rs`: Replaced Sidebar vibrancy + cocoa NSColor background hack with single `HudWindow` vibrancy call (corner radius 12.0)
- `src/tailwind.css`: Changed `#root` from `height: calc(100% - 28px)` to `100vh`/`100vw` with `border-radius: 12px`, `background: var(--background)`, and `border: 0.5px solid var(--border)`
