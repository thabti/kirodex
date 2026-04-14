## 2026-04-14 15:10 GST (Dubai)

### ACP: Scope question format preprompt to plan mode only

Moved the structured questions preprompt instruction behind a `is_plan_mode` check so it only gets injected when `mode_id` is `kiro_planner`. Chat mode no longer receives the question formatting rules. Fixed a borrow-after-move by checking `params.mode_id` before `spawn_connection` consumes it.

**Modified:** `src-tauri/src/commands/acp.rs`

## 2026-04-14 19:03 GST (Dubai)

### SlashPanels: Flatten grouped mcpServers in /agent panel

The `/agent` slash command panel failed to render MCP servers when kiro-cli sent `mcpServers` as a grouped object (e.g. `{ "other": [...] }`) instead of a flat array. Widened the IPC type to accept both formats and added normalization in the `onCommandsUpdate` handler to flatten grouped objects via `Object.values().flat()`.

**Modified:** `src/renderer/lib/ipc.ts`, `src/renderer/stores/taskStore.ts`

## 2026-04-14 15:05 GST (Dubai)

### QuestionCards: Extract parser module, harden edge cases, add preprompt and 46 tests

Extracted all question parsing logic from QuestionCards.tsx into a standalone `question-parser.ts` module for testability. Hardened the parser to handle URL collision (markdown link references no longer trigger Q&A UI), uppercase option letters, multi-line option continuation, and bold format question extraction. Added a structured questions preprompt instruction in the Rust `system_prefix` so the LLM consistently uses `[N]:` bracket format. Wrote 46 unit tests covering all parsing functions and edge cases. All builds pass clean (tsc, vite, cargo, vitest 332 tests).

**Modified:** `src/renderer/lib/question-parser.ts`, `src/renderer/lib/question-parser.test.ts`, `src/renderer/components/chat/QuestionCards.tsx`, `src/renderer/components/chat/ChatMarkdown.tsx`, `src-tauri/src/commands/acp.rs`

## 2026-04-14 14:05 GST (Dubai)

### Chat: Focus ring, send transition, collapsible pills, and unit tests

Added `focus-visible:ring-2` to the textarea for keyboard-only users. Send button now animates between `bg-muted/60` (disabled) and the colored background (enabled) with `duration-200 ease-out`. Extracted `PillsRow` component that collapses into a summary ("3 files, 2 attachments") when total pill count exceeds 4, with expand/collapse toggle. Added 12 unit tests: 6 for DragOverlay visible/hidden states and 6 for PillsRow collapse behavior.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/DragOverlay.test.tsx`, `src/renderer/components/chat/PillsRow.test.tsx`

## 2026-04-14 13:50 GST (Dubai)

### Updater: Increase check frequency and add sidebar badge

Changed update check interval from 4 hours to 30 minutes. Added a `triggerDownload` callback to `updateStore` so the sidebar can trigger downloads without duplicating the hook. Added an "Update Now" badge to the Settings button in `SidebarFooter` that appears when an update is available and triggers `downloadAndInstall` on click.

**Modified:** `src/renderer/hooks/useUpdateChecker.ts`, `src/renderer/stores/updateStore.ts`, `src/renderer/components/sidebar/SidebarFooter.tsx`

## 2026-04-14 13:56 GST (Dubai)

### Chat: Plan handoff card sends message and improved copy

Updated PlanHandoffCard to send "Go ahead working on the plan" to the coding agent after switching modes. Improved copy: title is now "Start building", subtitle is "Switch to the coding agent and execute this plan", icon changed to rocket. Added switching state to prevent double-clicks.

**Modified:** `src/renderer/components/chat/PlanHandoffCard.tsx`

## 2026-04-14 12:44 GST (Dubai)

### Chat: Plan agent handoff card

Added a "Switch to Default Agent and develop" card that appears below assistant text when the plan agent prompts to exit. Detects the handoff pattern via regex, renders a teal-styled button card, and switches mode to `kiro_default` on click via `ipc.setMode()`. Card only shows when not streaming and the current mode is `kiro_planner`.

**Modified:** `src/renderer/components/chat/PlanHandoffCard.tsx`, `src/renderer/components/chat/AssistantTextRow.tsx`

## 2026-04-14 12:30 GST (Dubai)

### Chat: Read tool call code viewer

Replaced raw JSON display for `read` tool calls with a compact summary header (e.g., "Read acp.rs lines 631–670") and a line-numbered code viewer with absolute line numbers. Non-read tool calls keep the existing raw JSON display. ReadOutput returns null on parse failure for graceful fallback.

**Modified:** `src/renderer/components/chat/ReadOutput.tsx`, `src/renderer/components/chat/ToolCallEntry.tsx`

## 2026-04-14 01:41 GST (Dubai)

### Notifications: Click-to-navigate to correct project and thread

Clicking a desktop notification now navigates to the correct thread. Added `lastNotifiedTaskId` to the task store, included `extra: { taskId }` in the notification payload, and wired up both an `onAction` listener and a window `focus` fallback in App.tsx. Also removed the duplicate Rust-side notification (the frontend one is conditional on `!document.hasFocus()` and includes the actual message content).

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/App.tsx`, `src-tauri/src/commands/acp.rs`

## 2026-04-14 01:41 GST (Dubai)

### Chat: ChatInput UX improvements batch

Seven UX improvements to ChatInput: (1) tooltips with keyboard shortcut hints on send (⏎) and pause (Esc) buttons, (2) Shift+Enter hint in placeholder text, (3) disabled state shows reason in placeholder with cursor-not-allowed + opacity, (4) Cmd+L global shortcut to focus the chat input with kbd hint in footer, (5) amber dot queue indicator on send button when messages are queued, (6) DragOverlay fade transition via visible prop instead of conditional render, (7) scroll shadow gradient at top of textarea when content overflows.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatPanel.tsx`, `src/renderer/components/chat/DragOverlay.tsx`, `src/renderer/components/chat/DragOverlay.test.tsx`

## 2026-04-14 01:41 GST (Dubai)

### TaskStore: Add refusal error message and applyTurnEnd tests

Extracted turn_end state logic into exported `applyTurnEnd` function. When `stopReason` is `"refusal"`, a system error message is appended and task status is set to `error`. Added 8 unit tests covering refusal/normal paths, tool call finalization, and streaming state cleanup.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/stores/taskStore.test.ts`

## 2026-04-14 01:28 GST (Dubai)

### ACP: Fix plan mode stuck state when subagent ends with refusal

When a subagent session ended with refusal, its tool calls were left with no terminal status in the parent's liveToolCalls. The turn_end handler moved them into the message history with undefined/in_progress status, causing perpetual spinners. Fixed by finalizing all incomplete tool calls on turn_end (marking as completed or failed based on stopReason). Also forwarded `kiro.dev/subagent/list_update` notifications to the frontend and included `stopReason` in the turn_end event.

**Modified:** `src-tauri/src/commands/acp.rs`, `src/renderer/stores/taskStore.ts`, `src/renderer/lib/ipc.ts`

## 2026-04-14 01:29 GST (Dubai)

### Chat: Auto-focus ChatInput on new thread creation

Added `autoFocus` prop to `ChatInput` that triggers a `useEffect` to focus the textarea on mount. `PendingChat` passes `autoFocus` so the cursor lands in the input when a new thread is created.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/PendingChat.tsx`

## 2026-04-13 16:28 GST (Dubai)

### Release: Auto-generate grouped release notes from commits

Added `scripts/generate-notes.sh` that collects commits since the last tag, groups them by conventional commit type (Features, Bug fixes, Styling, etc.), and outputs formatted markdown. Updated `scripts/release.sh` to call it, prepend notes to `CHANGELOG.md`, commit with co-author trailer, and create annotated tags with the notes as the tag message. Updated `.github/workflows/release.yml` with a `release-notes` job that extracts the tag annotation and injects it into the GitHub release body above the download table.

**Modified:** `scripts/generate-notes.sh`, `scripts/release.sh`, `.github/workflows/release.yml`

## 2026-04-13 14:58 GST (Dubai)

### Chat: Improve scroll-to-bottom button hover UX

Changed hover effect from `hover:bg-secondary` (which gave a washed-out/transparent look) to `hover:border-primary hover:text-foreground` for a solid, clear highlight. Bumped position from `bottom-4` to `bottom-6` for better spacing above the chat input.

**Modified:** `src/renderer/components/chat/MessageList.tsx`

## 2026-04-13 14:52 GST (Dubai)

### Chat: Fix scroll-to-bottom button positioning in MessageList

Moved the scroll-to-bottom button outside the scrollable `overflow-auto` container into a new outer `relative` wrapper. Previously the button used `absolute` positioning inside the scrollable div, which caused it to anchor relative to the full scroll content height rather than the visible viewport. Now the outer div is `relative min-h-0 flex-1`, the inner scrollable div is `h-full overflow-auto`, and the button sits as a sibling, correctly anchored to the visible bottom.

**Modified:** `src/renderer/components/chat/MessageList.tsx`

## 2026-04-13 16:02 GST (Dubai)

### Chat: Fix remaining text overflow in ThinkingDisplay, SystemMessageRow, CollapsedAnswers

Added `break-words` to three components that rendered dynamic text without word-break protection: the thinking text paragraph in `ThinkingDisplay`, the error content span in `SystemMessageRow`, and the question/answer paragraphs in `CollapsedAnswers`. Long unbroken strings (URLs, paths, base64) now wrap instead of overflowing their containers.

**Modified:** `src/renderer/components/chat/ThinkingDisplay.tsx`, `src/renderer/components/chat/SystemMessageRow.tsx`, `src/renderer/components/chat/CollapsedAnswers.tsx`

## 2026-04-13 14:46 GST (Dubai)

### Chat: Fix message area layout overlap when multiple messages accumulate

Hardened the virtualized message list to prevent content overlap and layout instability. Added min-height constraints per row type to stop rows collapsing during re-measurement. Changed row content wrapper from `overflow-x-hidden` to `overflow-x-auto` so wide content scrolls instead of being invisibly clipped. Added `contain:layout` to virtual row containers for paint isolation. Hardened `<pre>` blocks in CSS and ToolCallEntry to stay within bounds. Made user message bubbles content-adaptive with `w-fit` so short messages get compact bubbles.

**Modified:** `src/renderer/components/chat/MessageList.tsx`, `src/renderer/components/chat/ToolCallEntry.tsx`, `src/renderer/components/chat/UserMessageRow.tsx`, `src/tailwind.css`

## 2026-04-13 14:49 GST (Dubai)

### Settings: Default analyticsEnabled to true

Changed the anonymous usage data toggle to default to `true` across all four locations: Rust backend (`settings.rs`), frontend default settings (`settingsStore.ts`), the settings panel switch fallback (`SettingsPanel.tsx`), and the analytics init guard (`App.tsx`). New installs now opt in by default; users can still toggle it off in Settings > Advanced > Privacy.

**Modified:** `src-tauri/src/commands/settings.rs`, `src/renderer/stores/settingsStore.ts`, `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/App.tsx`

## 2026-04-13 11:56 GST (Dubai)

### AppHeader: Replace shield icon with user-check for auth indicator

Swapped `IconShieldCheck` → `IconUserCheck` for the authenticated user menu button. A person with a checkmark is a more natural "logged in" indicator than a shield.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-13 11:53 GST (Dubai)

### AppHeader: Ghost-style placeholders when no project is open

Replaced the plain "Kirodex" text with ghost/skeleton-style placeholders that mimic the real header layout. When no workspace is active, the breadcrumb shows two subtle rounded bars (project name + thread name ghosts), and the right side shows faded outlines of the diff, git, and terminal buttons. This previews what the header looks like with a project open, using very low-opacity backgrounds (`muted-foreground/6–15`) and `pointer-events-none` so they're non-interactive.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-13 11:25 GST (Dubai)

### AppHeader: Show app name when no project is open

When no workspace is active, the header breadcrumb now displays "Kirodex" as the app name instead of showing an empty bar. This gives the header visual identity when no project or thread is selected.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-13 10:27 GST (Dubai)

### Build: Fix CI productName to "Kirodex" instead of "Kirodex-dev"

Added `"productName": "Kirodex"` to `tauri.ci.conf.json` so release builds produce an app named "Kirodex". The base `tauri.conf.json` uses "Kirodex-dev" for local development, and the CI config (merged on top via `--config`) wasn't overriding it.

**Modified:** `src-tauri/tauri.ci.conf.json`

## 2026-04-13 09:45 GST (Dubai)

### CSS: Fix bottom margin gap in production builds

Fixed the `#root` element height from `calc(100% - 28px)` to `100%`. The previous calculation subtracted 28px to account for the macOS title bar overlay, but this created a visible 28px gap at the bottom of the window in production builds. The app's 44px toolbar already handles the title bar overlay area, so the root element should fill the entire viewport.

**Modified:** src/tailwind.css

## 2026-04-13 09:28 GST (Dubai)

### UI: Visual refresh — cleaner header, simplified sidebar, dark theme contrast

Removed the Kirodex logo and Beta badge from the app header for a cleaner look. Reduced header height from 44px to 38px and tightened traffic-light padding. Simplified sidebar project group headers by replacing folder icons with chevrons, reducing font weight and size. Tightened thread item spacing for a denser list. Added a prominent "New Thread" dashed-border button at the top of the sidebar. Introduced a `--sidebar` CSS variable for subtle sidebar/content contrast in both light and dark themes.

**Modified:** src/renderer/components/AppHeader.tsx, src/renderer/components/sidebar/ProjectItem.tsx, src/renderer/components/sidebar/TaskSidebar.tsx, src/renderer/components/sidebar/ThreadItem.tsx, src/tailwind.css

## 2026-04-13 09:15 GST (Dubai)

### Analytics: Opt-in PostHog + Homebrew download snapshots

Added a privacy-forward, opt-in analytics pipeline (PostHog) covering feature usage, the auto-update funnel (check → available → downloaded → installed → dismissed), version spread, and settings changes. Events carry only enumerations and never prompts, file paths, or commit messages; the client is gated by both a build-time `VITE_POSTHOG_API_KEY` and a user-facing opt-in in Settings → Advanced → Privacy. Added a scheduled workflow that snapshots GitHub Releases asset downloads and Homebrew cask install counts into the `analytics-data` branch for a free historical distribution dashboard.

**Modified:** src-tauri/tauri.conf.json, src-tauri/src/commands/settings.rs, src/renderer/types/index.ts, src/renderer/lib/analytics.ts (new), src/renderer/App.tsx, src/renderer/hooks/useUpdateChecker.ts, src/renderer/hooks/useSlashAction.ts, src/renderer/stores/updateStore.ts, src/renderer/stores/taskStore.ts, src/renderer/stores/settingsStore.ts, src/renderer/components/settings/SettingsPanel.tsx, package.json, .github/workflows/release.yml, .github/workflows/analytics-snapshot.yml (new)
## 2026-04-13 02:00 GST (Dubai)

### UI: Add tooltips across the application

Added Radix Tooltip components to all interactive icon buttons across the app: CodePanel, DiffViewer file actions and toolbar, SidebarFooter, GitActionsGroup, DebugPanel copy button, and ThreadItem delete button. Updated all sidebar tooltip positions to `side="top"` for consistent UX.

**Modified:** src/renderer/components/code/CodePanel.tsx, src/renderer/components/code/DiffViewer.tsx, src/renderer/components/sidebar/SidebarFooter.tsx, src/renderer/components/GitActionsGroup.tsx, src/renderer/components/debug/DebugPanel.tsx, src/renderer/components/sidebar/ThreadItem.tsx, src/renderer/components/sidebar/ProjectItem.tsx, src/renderer/components/sidebar/TaskSidebar.tsx, src/renderer/components/sidebar/KiroConfigPanel.tsx

## 2026-04-13 01:30 GST (Dubai)

### Chat: Replace chat/plan toggle with plan-only toggle

Removed the two-button Chat/Plan mode toggle since the default mode is coding, not chat. Replaced with a single PlanToggle button that toggles plan mode on/off with teal theming. The `/plan` slash command now acts as a toggle. Removed `/chat` from client-side commands.

**Modified:** src/renderer/components/chat/PlanToggle.tsx (new), src/renderer/components/chat/ChatInput.tsx, src/renderer/hooks/useSlashAction.ts, src/renderer/hooks/useChatInput.ts, src/renderer/components/chat/SlashCommandPicker.tsx, deleted ModeToggle.tsx

## 2026-04-12 23:45 GST (Dubai)

### Build: Fix icon.png RGBA format for Tauri compilation

The app icon at `src-tauri/icons/icon.png` was in RGB format (no alpha channel), causing `tauri::generate_context!()` to panic with "icon is not RGBA". Converted the icon to RGBA (PNG color-type 6) using ImageMagick. Build now compiles successfully.

**Modified:** src-tauri/icons/icon.png
