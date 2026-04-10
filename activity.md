## 2026-04-10 11:58 GST (Dubai)

- Created `todo.md` with full project research: current state, completed tasks, in-progress work, and open questions
- Reviewed project structure: Tauri v2 + React 19, 7 Rust command modules, 35+ chat components, 5 Zustand stores, 7 hooks
- Identified 13 modified files + 1 new file uncommitted

---

# Activity Log


## 2026-04-10 11:30 GST (Dubai, UTC+4)

### Commit session: split working changes into 6 logical conventional commits

Organized all unstaged changes into focused commits:

1. `feat(backend)`: tauri-plugin-store integration + ValidationException hint in acp.rs
2. `feat(history)`: persistent conversation threads via LazyStore, archived thread UI, clear history in settings
3. `refactor(onboarding)`: single-step onboarding with terminal-style CLI detection
4. `refactor(ui)`: remove Playground, extract useResizeHandle hook, simplify MCP status, add ThreadItem context menu with confirm-delete, project drag-to-reorder, file mention pills, fix sidebar structural sharing
5. `chore`: remove unused .kiro agent configs, update activity log, fix plan-mode pause button color

## 2026-04-10 10:47 GST (Dubai, UTC+4)

### Fix sidebar sort: remove unused index prop, fix structural sharing

Two issues fixed in the sidebar task sorting:

1. `ProjectItem` declared an `index: number` prop that was never used in the component. Removed from the interface and from the render call in `TaskSidebar`.

2. `useSidebarTasks` had two bugs:
   - `sortTasks` mutated the input array with `.sort()`. Changed to `[...tasks].sort()` to return a new array.
   - Structural sharing compared tasks by array index (`prev[i].id === next[i].id`), which breaks when tasks are added, removed, or reordered. Replaced with an id-keyed `Map<string, SidebarTask>` that compares each task by its `id` key, preserving object references for unchanged tasks regardless of position.

**Modified:**
- `src/renderer/components/sidebar/ProjectItem.tsx`
- `src/renderer/components/sidebar/TaskSidebar.tsx`
- `src/renderer/hooks/useSidebarTasks.ts`

## 2026-04-10 09:12 GST (Dubai, UTC+4)

### Made file mention pills inline within the ChatInput textarea area

Moved `FileMentionPill` rendering from a separate `div` (with its own `px-3 pt-3` padding) above the textarea into the same container `div` that holds the textarea. Pills now render inline just above the textarea text, inside the same padded area, creating a cohesive inline feel instead of a visually separate block.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-10 09:10 GST (Dubai, UTC+4)

### Redesigned ChatInput footer bar with visual grouping

The footer toolbar was a flat row of six items separated by identical thin dividers, with no visual hierarchy. Redesigned into three logical groups:

1. Left pill: `ModeToggle` + dot + `ModelPicker` (AI controls, wrapped in a `ToolbarGroup` with `bg-muted/50` background)
2. Center: `AutoApproveToggle` + `BranchSelector` (standalone controls, no wrapper)
3. Right: `ContextRing` + `Paperclip` + `Send/Pause` (actions + status)

Other changes:
- Moved `ContextRing` from floating `absolute right-3 top-2.5` into the footer bar (right group)
- Replaced thin `Sep` dividers (`w-px bg-border/60`) with pill-shaped `ToolbarGroup` wrapper and small `Dot` separators (`size-[3px] rounded-full bg-border`)
- Paperclip button now `rounded-full` with `hover:bg-muted/60` for better hit target
- Updated ghost ChatInput in `App.tsx` to match the new grouped skeleton layout

**Build:** `tsc --noEmit` ✓ | `vite build` ✓ (2.14s)

**Modified files:**
- `src/renderer/components/chat/ChatInput.tsx`
- `src/renderer/App.tsx`

## 2026-04-10 09:08 GST (Dubai, UTC+4)

### Removed IDE/tool config folders

Deleted `.trae`, `.gemini`, `.opencode`, and `.kilocode` folders from the project root. These were leftover config directories from other AI coding tools.


## 2026-04-10 01:45 GST (Dubai, UTC+4)

### Rewrote README.md — stripped fluff, developer-focused

Rewrote the entire README targeting contributing developers. Removed: sponsorship banner, Codex/T3Code comparisons, inspiration section, jokes, "© 2026 All rights reserved", duplicate Project Structure (kept in CONTRIBUTING.md), standalone Configuration section. Added: MIT/Rust/Platform badges, screenshot placeholder comment, CONTRIBUTING.md link from Architecture section. Merged Quick Start + Development into single Getting Started section. Grouped Features into four categories (Chat & Agents, Code & Diffs, Git, Terminal & Settings).

**Modified:** `README.md`
## 2026-04-10 01:39 GST (Dubai, UTC+4)

### Git commit and push — `a3a2c1c`

Staged all changes, committed with conventional commit message, and pushed to `main`. Commit includes sidebar rebuild, mode-colored input, title bar background, transparency removal, question card changes, and spacing tweaks.

## 2026-04-10 01:02 GST (Dubai, UTC+4)

### Mode-based input border and button colors

Input border and send/pause buttons now change color based on the active mode:
- Plan mode (`kiro_planner`): red border + red buttons
- Chat mode (`kiro_default`): violet/purple border + violet buttons

Subscribes to `currentModeId` from `settingsStore` inside `ChatInput`. Applied to: container border (idle + focus-within), send button, and pause button. ACP backend already supports mode switching via `AcpCommand::SetMode` → `conn.set_session_mode()`, no backend changes needed.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-10 00:46 GST (Dubai, UTC+4)

### Clickable file paths in chat markdown

File paths rendered as inline code in chat messages (e.g. `src/renderer/components/sidebar/TaskSidebar.tsx`) are now clickable. Clicking a file path opens the diff panel focused on that file, using `useDiffStore.openToFile()`.

**Changes:**
- Added `FILE_PATH_RE` regex to detect file path patterns in inline `<code>` elements
- Modified the inline `code` renderer to check for file paths and render them as clickable elements styled with primary color + underline
- Clicking calls `useDiffStore.getState().openToFile(path)` which opens the diff panel and scrolls to the matching file

**Modified files:**
- `src/renderer/components/chat/ChatMarkdown.tsx`


## 2026-04-10 00:43 GST (Dubai, UTC+4)

### Fix sidebar thread list: overflow clipping action buttons

Thread names in the sidebar were overflowing and hiding the "New Thread" and "Delete" action buttons on hover. Fixed by removing `overflow-hidden` from two parent containers that were clipping absolutely-positioned and opacity-transitioned action buttons.

The thread name `<span>` already had Tailwind's `truncate` class (ellipsis), but the parent `<ul>` and `<li>` containers had `overflow-hidden` which clipped the hover-revealed action buttons.

**Changes:**
- Removed `overflow-hidden` from the thread list `<ul>` so the delete button on `ThreadItem` is visible on hover
- Removed `overflow-hidden` from the `ProjectItem` `<li>` so the new-thread and delete-project buttons are visible on hover

**Modified files:**
- `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-10 00:18 GST (Dubai, UTC+4)

### Message queue: type and stack messages while agent is running

Users can now type and send messages while the agent is running. Messages queue up and display above the chat input. When the agent finishes its turn, the first queued message auto-sends.

**Changes:**

1. **taskStore.ts**: Added `queuedMessages: Record<string, string[]>` state with three actions: `enqueueMessage`, `dequeueMessages`, `removeQueuedMessage`. Updated `onTurnEnd` listener to auto-send the first queued message after a turn completes.

2. **QueuedMessages.tsx** (new): Displays queued message count and each message with an X button to remove. Animated slide-in.

3. **ChatPanel.tsx**: `handleSendMessage` now enqueues when `task.status === 'running'` instead of sending directly. Extracted `sendMessageDirect` helper. Renders `QueuedMessages` above `ChatInput`.

4. **ChatInput.tsx**: Shows both a queue/send button (muted style) and the pause button when `isRunning`. Users can type and press Enter or click the send button to queue messages while the agent runs.

**Modified files:**
- `src/renderer/stores/taskStore.ts`
- `src/renderer/components/chat/QueuedMessages.tsx` (new)
- `src/renderer/components/chat/ChatPanel.tsx`
- `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-09 23:40 GST (Dubai, UTC+4)

### Updated UI copy from "new project" to "import" language and bumped version to 0.6.0

Replaced all "new project" / "start project" / "add project" copy with import-oriented language across the app. Bumped version from 0.1.0 to 0.6.0 in all three manifests. Added version display to settings panel.

**Copy changes:**
- App.tsx: "Open a project folder to get started" → "Import a project folder to get started"
- App.tsx: "Start New Project" → "Import Project"
- Dashboard.tsx: "Pick a project folder to start a new thread with Kiro." → "Import a project folder to start a new thread with Kiro."
- TaskSidebar.tsx: "Add project folder" tooltip → "Import project folder"
- TaskSidebar.tsx: "No projects yet — click + to add a folder" → "No projects yet — click + to import a folder"
- NewProjectSheet.tsx: JSDoc updated to "imports" instead of "adds"

**Version bump (0.1.0 → 0.6.0):**
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

**Settings version label:**
- Added "Kirodex v0.6.0" text to the settings panel footer below the Save/Cancel buttons

**Modified files:**
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src/renderer/App.tsx`
- `src/renderer/components/dashboard/Dashboard.tsx`
- `src/renderer/components/settings/SettingsPanel.tsx`
- `src/renderer/components/sidebar/TaskSidebar.tsx`
- `src/renderer/components/task/NewProjectSheet.tsx`

## 2026-04-10 01:33 GST (Dubai, UTC+4)

### Rebuilt sidebar: performance + UX + component extraction

**Performance:**
- `useSidebarTasks` hook with structural sharing: only extracts `id`, `name`, `workspace`, `createdAt`, `status` from the task store. Streaming chunks, tool calls, messages, and thinking are ignored. Sidebar no longer re-renders on every token.
- Batched `task_update` Tauri events with `requestAnimationFrame`: multiple threads firing rapid status changes coalesce into a single `setState` per frame instead of one per event.

**Component extraction (flat, 1 file each):**
- `ThreadItem.tsx`: status dot (green pulse for running, amber for permission, red for error), name truncated with ellipsis, double-click to rename, hover shows delete button, relative time display
- `ProjectItem.tsx`: expand/collapse, right-click context menu (Open in Finder, Edit Name, Archive Threads, Delete), hover shows new thread + delete buttons
- `SidebarFooter.tsx`: KiroConfig panel (collapsible, resizable) + Playground/Debug/Settings buttons
- `TaskSidebar.tsx`: ~90 lines, uses `useSidebarTasks` hook, delegates to extracted components

**Thread isolation:** Each thread already has its own OS thread + single-threaded tokio runtime + ACP connection. No Rust changes needed. The sidebar now visually communicates this with per-thread status dots.

**Build:** `tsc --noEmit` ✓ (0 errors) | `vite build` ✓ (1.35s)

**Modified files:**
- `src/renderer/hooks/useSidebarTasks.ts` (new)
- `src/renderer/components/sidebar/ThreadItem.tsx` (rewritten)
- `src/renderer/components/sidebar/ProjectItem.tsx` (rewritten)
- `src/renderer/components/sidebar/SidebarFooter.tsx` (new)
- `src/renderer/components/sidebar/TaskSidebar.tsx` (rewritten)
- `src/renderer/stores/taskStore.ts` (batched task_update events)

## 2026-04-09 23:58 GST (Dubai, UTC+4)

### Collapsible file sidebar in DiffViewer

Made the DiffViewer file list sidebar drag-to-resize and toggleable:
- Drag the right edge to resize (100px min, 320px max)
- Dragging below 60px auto-collapses the sidebar
- Toggle button (PanelLeftOpen/PanelLeftClose) in the toolbar
- Sidebar state is local (no Zustand needed)

**Build:** `tsc --noEmit` ✓ | `vite build` ✓ (1.34s)

**Modified:** `src/renderer/components/code/DiffViewer.tsx`

## 2026-04-09 23:47 GST (Dubai, UTC+4)

### Extracted ChatInput logic into three custom hooks

ChatInput.tsx was 17KB with eight useState calls, six useCallback handlers, two useEffect side effects, and one useMemo. Extracted all logic into composable hooks; ChatInput is now pure rendering.

**useAttachments** (`src/renderer/hooks/useAttachments.ts`):
- Owns: `attachments`, `isDragOver`, `fileInputRef`
- Handles: Tauri native drag-drop listener, clipboard paste, file picker, remove

**useFileMention** (`src/renderer/hooks/useFileMention.ts`):
- Owns: `mentionTrigger`, `mentionIndex`, `mentionedFiles`
- Handles: @-mention detection from cursor position, file selection, mention removal

**useChatInput** (`src/renderer/hooks/useChatInput.ts`):
- Composes `useAttachments` + `useFileMention`
- Owns: `value`, `slashIndex`, `commands`, textarea resize
- Handles: onChange, onKeyDown, onSelect, send, slash command selection
- Returns flat object with everything ChatInput.tsx needs

**ChatInput.tsx**: zero useState, zero useCallback, zero useEffect, zero useMemo. Pure rendering only.

**Build:** `tsc --noEmit` ✓ (0 errors) | `vite build` ✓ (built in 1.15s)

**Modified:**
- `src/renderer/hooks/useAttachments.ts` (new)
- `src/renderer/hooks/useFileMention.ts` (new)
- `src/renderer/hooks/useChatInput.ts` (new)
- `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-09 23:25 GST (Dubai, UTC+4)

### Refactored chat panel components into flat single-file structure

Broke down six large components into 22 focused files. Each file has one component, flat directory structure, no nesting.

**ChatInput.tsx (32KB → 17KB):** Extracted five sub-components:
- `ContextRing.tsx` — circular context usage indicator
- `ModelPicker.tsx` — model dropdown selector
- `ModeToggle.tsx` — Chat/Plan mode toggle with inline SVG icons
- `AutoApproveToggle.tsx` — auto-approve toggle with selector
- `attachment-utils.ts` — all attachment helpers (processDroppedFile, processNativePath, buildAttachmentMessage, etc.)

**AppHeader.tsx (18KB → 8KB):** Extracted two sub-components:
- `OpenInEditorGroup.tsx` — Zed/VSCode/Cursor editor opener with ZedIcon
- `GitActionsGroup.tsx` — commit/push/GitHub actions with GitHubIcon

**TimelineRows.tsx (9.7KB → barrel re-export):** Split into five individual row files:
- `UserMessageRow.tsx`, `SystemMessageRow.tsx`, `AssistantTextRow.tsx`, `WorkGroupRow.tsx`, `WorkingRow.tsx`
- `TimelineRows.tsx` is now a barrel re-export so MessageList.tsx imports stay unchanged

**ToolCallDisplay.tsx (12KB → 3KB):** Extracted three files:
- `tool-call-utils.ts` — icon mapping (kindIcons, getToolIcon)
- `InlineDiff.tsx` — inline git diff renderer
- `ToolCallEntry.tsx` — individual tool call row with expand/collapse

**data-testid attributes added to 15 key sections:**
`chat-panel`, `chat-input`, `send-button`, `pause-button`, `app-header`, `context-ring`, `model-picker`, `mode-toggle`, `auto-approve-toggle`, `message-list`, `tool-call-display`, `tool-call-entry`, `user-message-row`, `assistant-text-row`, `permission-banner`

**Build:** `tsc --noEmit` ✓ (0 errors) | `vite build` ✓ (built in 1.24s)

**Modified files (22):**
- `src/renderer/components/AppHeader.tsx`
- `src/renderer/components/OpenInEditorGroup.tsx` (new)
- `src/renderer/components/GitActionsGroup.tsx` (new)
- `src/renderer/components/chat/ChatInput.tsx`
- `src/renderer/components/chat/ChatPanel.tsx`
- `src/renderer/components/chat/ContextRing.tsx` (new)
- `src/renderer/components/chat/ModelPicker.tsx` (new)
- `src/renderer/components/chat/ModeToggle.tsx` (new)
- `src/renderer/components/chat/AutoApproveToggle.tsx` (new)
- `src/renderer/components/chat/attachment-utils.ts` (new)
- `src/renderer/components/chat/TimelineRows.tsx`
- `src/renderer/components/chat/UserMessageRow.tsx` (new)
- `src/renderer/components/chat/SystemMessageRow.tsx` (new)
- `src/renderer/components/chat/AssistantTextRow.tsx` (new)
- `src/renderer/components/chat/WorkGroupRow.tsx` (new)
- `src/renderer/components/chat/WorkingRow.tsx` (new)
- `src/renderer/components/chat/ToolCallDisplay.tsx`
- `src/renderer/components/chat/ToolCallEntry.tsx` (new)
- `src/renderer/components/chat/InlineDiff.tsx` (new)
- `src/renderer/components/chat/tool-call-utils.ts` (new)
- `src/renderer/components/chat/MessageList.tsx`
- `src/renderer/components/chat/PermissionBanner.tsx`

## 2026-04-09 20:50 GST (Dubai, UTC+4)

### Fixed permission approval crash (Allow Always / Yes)

The `request_permission` method in `acp.rs` was constructing `RequestPermissionResponse` via `serde_json::from_value(...).unwrap()` with hand-crafted JSON. If the ACP SDK's expected type shape didn't match (e.g., after a schema version bump), the `unwrap()` would panic and kill the ACP connection thread, crashing the app.

Replaced all three `serde_json::from_value(...).unwrap()` calls with proper SDK constructors:
- `acp::RequestPermissionResponse::new(acp::RequestPermissionOutcome::Selected(...))`
- `acp::RequestPermissionResponse::new(acp::RequestPermissionOutcome::Cancelled)`

Also fixed the same pattern in `MinimalClient` and `ProbeClient` implementations, and added `.catch()` to the frontend `selectPermissionOption` IPC call to prevent unhandled promise rejections.

**Build:** `cargo check` ✓ | `tsc --noEmit` ✓

**Modified:** `src-tauri/src/commands/acp.rs`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-09 19:15 GST (Dubai, UTC+4)

### Validated mode toggle inversion fix

Traced the full session_init flow for mode and model preservation. The fix was already in place in `taskStore.ts` lines 389-414. Validated five scenarios: user clicks Plan (preserved), fresh app start (falls back to backend default), user's mode removed from backend (falls back), /plan slash command (preserved), and ACP reconnect (re-syncs via ipc.setMode). Both mode and model use identical protection logic.

**No files modified** — validation only.

## 2026-04-09 18:51 GST (Dubai, UTC+4)

### Replaced raw question answers with collapsed Q&A summary

The raw `2=c, 3=a` user message was replaced with a collapsible "Answered N questions" card (collapsed by default). Clicking expands to show each question with its selected answer.

- Created `CollapsedAnswers.tsx` following the same pattern as `ToolCallDisplay`
- Added `questionAnswers` field to `TaskMessage` and `UserMessageRow` types
- `handleContinue` in `QuestionCards.tsx` now builds Q&A metadata (question text + option text) and attaches to the user message
- `deriveTimeline` passes `questionAnswers` through to timeline rows
- `UserMessageRow` in `TimelineRows.tsx` renders `CollapsedAnswers` when metadata present; raw text still sent to IPC

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `CollapsedAnswers.tsx` (new), `QuestionCards.tsx`, `TimelineRows.tsx`, `timeline.ts`, `types/index.ts`

## 2026-04-09 18:49 GST (Dubai, UTC+4)

### Styled question card container and option buttons

- Card container: `bg-card/80` → `bg-muted` for accessible contrast against dark background
- Option buttons: added subtle `border-border/40`, `cursor-pointer`, lighter text (`text-foreground/60`), hover transitions to `border-primary/30`
- Selected state: `border-primary/30 bg-primary/8`
- Extra text input: `text-black dark:text-white` for readable input text

**Build:** `tsc --noEmit` ✓

**Modified:** `QuestionCards.tsx`

## 2026-04-09 18:40 GST (Dubai, UTC+4)

### Fixed QuestionCards Continue button to navigate between questions

Continue button was submitting all answers immediately. Changed to advance to the next unanswered question first, only submitting when all are answered. Button label shows "Next" or "Submit" based on state. Extra text input now combines with the current question's selection (e.g., `1=a, extra context`).

**Build:** `tsc --noEmit` ✓

**Modified:** `QuestionCards.tsx`

## 2026-04-09 18:57 GST (Dubai, UTC+4)

### Planned 3 codebase improvements for Kirodex

Analyzed the full codebase and drafted three improvement proposals:

1. **Harden `acp.rs` and split the monolith** — 1,082 LOC file with 11 `unwrap()` calls, `std::sync::Mutex` everywhere, no graceful shutdown. Plan: split into `acp/types.rs`, `acp/client.rs`, `acp/connection.rs`; replace unwraps; switch to `parking_lot::Mutex`; add `CancellationToken`.

2. **Conversation persistence + error surfacing** — History is memory-only (lost on close), 21 `catch(() => {})` calls swallow errors silently. Plan: persist conversations to disk via Tauri fs plugin; replace swallowed catches with centralized error handler + sonner toasts; split `taskStore.ts` (441 LOC) into focused stores.

3. **Test foundation** — Zero tests in Rust or frontend. Plan: add Rust unit tests for `error.rs`, `kiro_config.rs`, `fs_ops.rs`, `settings.rs`; configure Vitest for frontend; test `deriveTimeline`, `taskStore` reducers, `ipc` listeners.

Asked 5 follow-up questions about priority, persistence scope, architecture coupling, multi-window support, and test framework preference.

**No files modified** — planning session only.

## 2026-04-09 17:52 GST (Dubai, UTC+4)

### Added QuestionCards UI for plan mode questions

When the AI asks numbered questions with lettered options (e.g., `[1]: Which docs? a. README b. CONTRIBUTING`), they now render as styled cards instead of plain markdown. Each question gets a bordered card with a numbered badge, and options are listed with monospace letter labels and hover highlights.

- Created `QuestionCards.tsx` with regex-based parser for `[N]: question\na. option` patterns
- Integrated into `ChatMarkdown.tsx` — detects question blocks and renders cards above the markdown

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/components/chat/QuestionCards.tsx` (new), `src/renderer/components/chat/ChatMarkdown.tsx`

## 2026-04-09 14:41 GST (Dubai, UTC+4)

### Rewrote README.md and created CONTRIBUTING.md

- Rewrote README.md: added Codex/T3Code inspiration section, updated architecture to reflect git2/confy/which/serde_yaml/thiserror, added splash screen mention, DMG troubleshooting (`xattr -cr`), clean quick start with Rust install instructions
- Created CONTRIBUTING.md: dev workflow, conventional commits, code style for TS/Rust/CSS, architecture notes, PR guidelines

**Modified:** `README.md`, `CONTRIBUTING.md` (new)

## 2026-04-09 14:10 GST (Dubai, UTC+4)

### Updated CLAUDE.md and .kiro steering rules with session learnings

**CLAUDE.md updates:**
- Added `git2`, `thiserror`, `which`, `serde_yaml`, `confy` to tech stack
- Updated project structure to reflect `error.rs` (new) and updated module descriptions
- Replaced old "Rust error handling" section with `AppError`/`thiserror` guidance
- Added "Prefer community crates over shelling out" learning
- Added seven new learnings: CSP inline scripts, oklch colors, dark theme class, splash screen pattern, cancel before delete, confy config location, git2 injection safety

**New .kiro steering rules:**
- `rust-crates.md` — Enforces git2, which, confy, serde_yaml, thiserror usage
- `tauri-patterns.md` — CSP, state management, emit patterns, WebKit compat, dark theme

**Modified:** `CLAUDE.md`, `.kiro/steering/rust-crates.md` (new), `.kiro/steering/tauri-patterns.md` (new)

## 2026-04-09 14:03 GST (Dubai, UTC+4)

### Replaced hardcoded Rust implementations with community crates

Added five crates and rewrote four modules:

**New dependencies:** `git2 0.20`, `thiserror 2`, `which 7`, `serde_yaml 0.9`, `confy 0.6`

**Changes by module:**

- `error.rs` (new) — Shared `AppError` enum with `thiserror`. Has `From` impls for `git2::Error`, `io::Error`, `serde_json::Error`, `confy::ConfyError`, `PoisonError`. Implements `Serialize` for Tauri IPC.

- `git.rs` — Rewrote all nine commands to use `git2::Repository` instead of `Command::new("git")`. `git_detect` uses `Repository::discover()`. Diff uses `diff_tree_to_index` + `diff_index_to_workdir`. Stage uses `index.add_path()`. Commit uses `repo.commit()`. No more PATH dependency.

- `fs_ops.rs` — `detect_kiro_cli` uses `which::which()` instead of `Command::new("which")`. `list_project_files` uses `git2::Repository::statuses()` + index iteration instead of `Command::new("git").args(["ls-files"...])`.

- `kiro_config.rs` — Frontmatter parsing uses `serde_yaml::from_str` instead of string matching. Fixes a bug where `alwaysApply: false` with `true` elsewhere in the YAML would incorrectly match.

- `settings.rs` — Uses `confy::load`/`confy::store` instead of hand-rolled `store_path()`, `load_store()`, `persist_store()`.

- `pty.rs` — Updated to use `AppError` instead of `String` errors.

- `acp.rs` — Left with `String` errors (ACP SDK's own error types + async `!Send` constraints make conversion impractical).

**Build:** `cargo check` ✓ (0 errors, 0 warnings) | `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `Cargo.toml`, `error.rs` (new), `git.rs`, `fs_ops.rs`, `kiro_config.rs`, `settings.rs`, `pty.rs`, `mod.rs`
## 2026-04-09 13:47 GST (Dubai, UTC+4)

### Updated README.md with recent features

Updated the Features section with six new items from today's activity: slash commands with inline model picker and MCP server panels, pause button on send while agent runs, click-to-focus file ops in diff panel, collapsible sidebar with ⌘B and skeleton empty state, and Zustand performance optimizations (bail-out guards, rAF batching, extracted streaming selectors). Added `hooks/` directory to the project structure tree.

**Modified:** `README.md`

## 2026-04-09 13:43 GST (Dubai, UTC+4)

### Added best practice learnings to CLAUDE.md

Appended six new engineering learnings to the `## Engineering learnings` section: Tauri v2 state management (use `app.manage()`, avoid cloning state into closures), Rust error handling in Tauri commands (return `Result<T, String>`, no `unwrap()`), React 19 + Zustand selector discipline (always use selectors, `shallow` equality), IPC event cleanup (return unlisten from useEffect), PTY process lifecycle (kill on close, check `try_wait()`), and git command injection prevention (use `Command::arg()` over string interpolation).

**Modified:** `CLAUDE.md`

## 2026-04-09 12:57 GST (Dubai, UTC+4)

### Rewrote CLAUDE.md with engineering learnings

The existing CLAUDE.md was outdated (still referenced Electron). Rewrote from scratch with accurate Tauri v2 project info and added 11 engineering learnings extracted from the activity log and source code: ACP concurrency model (!Send futures on dedicated OS threads), permission resolver state management, notification method normalization, message preservation on backend updates, Zustand performance patterns (bail-out guards, rAF batching, selector extraction, single setState callbacks), dead code traps in component wiring, slash command client-side vs pass-through architecture, forwarding full ACP notification data, window cleanup on close, probe_capabilities guard, and Vite watch ignores.

**Modified:** `CLAUDE.md`

## 2026-04-09 12:54 GST (Dubai, UTC+4)

### Created open-source GitHub README.md

Explored the full project structure, configs, and source files, then wrote a proper README for the repo. Includes: project description, features, prerequisites, getting started, dev commands, build instructions, project structure tree, architecture diagram with module descriptions, kiro-cli auto-detect paths, tech stack table, troubleshooting, contributing guidelines (conventional commits), and MIT license.

**Modified:** `README.md`


## 2026-04-09 12:34 GST (Dubai, UTC+4)

### Fixed file focus in diff panel (was wired to wrong component)

The `focusFile` logic was added to `DiffPanel.tsx` which is dead code (never imported). The actual side panel uses `CodePanel` → `DiffViewer`. Moved the `focusFile` effect into `DiffViewer.tsx` so clicking a tool call file op in chat correctly opens the side panel and selects the file.

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/components/code/DiffViewer.tsx`

## 2026-04-09 12:30 GST (Dubai, UTC+4)

### Click tool call file ops to open diff panel with file selected

Clicking a file edit/read/delete tool call in the chat now opens the diff side panel and scrolls to that file. Added `focusFile` and `openToFile()` to `diffStore`. The DiffPanel watches `focusFile` and sets `selectedFileIdx` to match. App.tsx syncs `diffStore.isOpen` to the local `sidePanelOpen` state so the panel opens automatically.

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/stores/diffStore.ts`, `src/renderer/components/diff/DiffPanel.tsx`, `src/renderer/components/chat/ToolCallDisplay.tsx`, `src/renderer/App.tsx`

## 2026-04-09 12:25 GST (Dubai, UTC+4)

### Committed and pushed all changes

Committed `47541ea` to `origin/main` (42 files, +1221 / -690). Includes collapsible sidebar (⌘B), empty state skeleton, compact ToolCallDisplay, SlashPanels + useSlashAction hook, expanded slash command icons/descriptions, ACP notification normalization, managed Tauri state in permission handler, probe_running guard, commands_update event, hardened tauriListen cleanup, taskStore re-render optimizations, and theme/README updates.


## 2026-04-09 12:20 GST (Dubai, UTC+4)

### Added ghost ChatInput to empty state

The empty state now shows a disabled replica of the ChatInput at the bottom (30% opacity, non-interactive). It mirrors the real component's structure: rounded-[20px] card, placeholder text "Ask anything, or press / for commands", pill-shaped skeleton controls in the footer bar, and a dimmed send button. Gives users a preview of the chat interface before creating a thread.

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/App.tsx`

## 2026-04-09 12:10 GST (Dubai, UTC+4)

### Added skeleton empty state with New Thread button

Replaced the plain "Select a thread" text with a ghost skeleton of a chat conversation (message bubbles at 7% opacity) and a centered "New Thread" button overlay. If the user has projects, clicking it opens a pending chat for the first project; otherwise it opens the New Project sheet.

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/App.tsx`

## 2026-04-09 12:06 GST (Dubai, UTC+4)

### Cancel running tasks on delete

Deleting a thread or removing a project now calls `ipc.cancelTask()` before `ipc.deleteTask()` to stop any running agent. The cancel is fire-and-forget with a `.catch(() => {})` so it's a no-op for already-stopped tasks.

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/components/sidebar/TaskSidebar.tsx`, `src/renderer/stores/taskStore.ts`

## 2026-04-09 11:58 GST (Dubai, UTC+4)

### Send button becomes Pause when agent is running

The send button in ChatInput now swaps to a Pause icon when the task status is `'running'` (agent is streaming/chunking). Clicking it calls `ipc.pauseTask()`. When the agent is idle, the button reverts to the send arrow.

- Added `isRunning` and `onPause` props to `ChatInput`
- ChatPanel passes `taskStatus === 'running'` and a `handlePause` callback
- Pause button uses the same round primary style as the send button

**Build:** `tsc --noEmit` ✓ | `vite build` ✓

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/ChatPanel.tsx`
## 2026-04-09

- **11:57 (Dubai)** — Added copyright notice ("© 2026 Kirodex. All rights reserved.") to the end of `README.md`.
- **11:58 (Dubai)** — Completed full Rust correctness & architecture review of `src-tauri/src/` (~1,600 lines). Found 2 HIGH, 3 MEDIUM, 4 LOW, 1 INFO issues. No unsafe code. Concurrency model is sound.

## 2026-04-09 11:57 (Dubai Time) - Dynamic slash command actions

**Changes:**
- Created `useSlashAction` hook (`src/renderer/hooks/useSlashAction.ts`) that intercepts slash commands and runs client-side actions:
  - `/clear` resets chat messages for the current task
  - `/model` toggles an inline model picker panel
  - `/agent` toggles an inline MCP servers panel
  - `/plan` switches to `kiro_planner` mode
  - `/chat` switches to `kiro_default` mode
  - All other commands pass through to ACP as messages
- Built `SlashPanels.tsx` with two inline panels:
  - `ModelPickerPanel`: clickable model list with active dot indicator, updates model on click
  - `AgentListPanel`: MCP servers table showing name, status dot (green=running, amber=loading, red=error), and transport type
- Integrated into `ChatInput.tsx`: command selection calls `execute()` first; if handled client-side, clears input and returns. Panels render above textarea, dismiss on Escape or message send.

**Files created:**
- `src/renderer/hooks/useSlashAction.ts`
- `src/renderer/components/chat/SlashPanels.tsx`

**Files modified:**
- `src/renderer/components/chat/ChatInput.tsx`

**Build:** tsc ✓, vite build ✓ (5.45s)

## 2026-04-09 12:00 (Dubai Time) - Mode switch feedback for /plan and /chat

**Changes:**
- `/plan` and `/chat` now show an immediate system message confirming the switch ("Switched to Plan mode")
- IPC errors are caught and surface a warning message ("⚠️ Failed to sync Plan mode with backend")
- Extracted `switchMode()` and `addSystemMessage()` helpers in `useSlashAction.ts`

**Files modified:**
- `src/renderer/hooks/useSlashAction.ts`

**Build:** tsc ✓, vite build ✓ (5.18s)

## 2026-04-09 12:05 (Dubai Time) - Fix chat history being wiped by backend task updates

**Root cause:** `upsertTask()` did a full object replacement. The ACP backend sends `task_update` events with `messages: []` (it doesn't track message history — only the client does). Every status change from the backend wiped all locally-accumulated messages.

**Fix:**
- `upsertTask()` in `taskStore.ts` now preserves existing messages when the incoming task has an empty messages array
- `/clear` in `useSlashAction.ts` bypasses `upsertTask` and uses `setState` directly to ensure it's the only path that can wipe messages

**Files modified:**
- `src/renderer/stores/taskStore.ts` — merge logic in `upsertTask`
- `src/renderer/hooks/useSlashAction.ts` — `/clear` uses direct `setState`

**Build:** tsc ✓, vite build ✓ (4.97s)

## 2026-04-09 12:09 (Dubai Time) - Store performance audit and optimizations

**Scope:** Full review of all 5 Zustand stores (taskStore, debugStore, settingsStore, kiroStore, diffStore)

**Findings:** 9 issues (1 High, 5 Medium, 3 Low). diffStore was clean.

**Fixes applied:**

taskStore.ts (6 fixes):
- `upsertTask`: bail-out when status, messages, name, pendingPermission, plan, contextUsage are all unchanged
- `clearTurn`: bail-out when streamingChunks, thinkingChunks, liveToolCalls are already empty
- `upsertToolCall`: bail-out when tool call status + content unchanged
- `updatePlan`: reference equality check before spreading
- `updateUsage`: value equality check (used + size) before spreading
- `setSelectedTask`, `setView`, `setConnected`, `renameTask`, `renameProject`: no-op guards
- `onTurnEnd`: rewritten as single `setState` callback to avoid stale reads between multiple `getState()` calls
- `onTaskError`: rewritten as single `setState` callback

debugStore.ts (1 fix):
- `addEntry`: batched with rAF like streaming chunks. Entries accumulate in a buffer and flush once per frame via `concat + slice`, avoiding per-entry array copies during streaming

settingsStore.ts (1 fix):
- `setProjectPref`: merged double `set()` into single call with conditional spread for `currentModelId`

**Files modified:**
- `src/renderer/stores/taskStore.ts`
- `src/renderer/stores/debugStore.ts`
- `src/renderer/stores/settingsStore.ts`

**Build:** tsc ✓, vite build ✓ (5.52s)

## 2026-04-09 12:21 GST (Dubai, UTC+4)

### Show terminal and diff panel on new threads without conversation

The diff panel toggle and terminal toggle were gated behind `{task && ...}`, so they only rendered when a task existed. On a new thread (where `pendingWorkspace` is set but `task` is null), only the "Open in Editor" button showed.

Moved the diff panel and terminal toggles outside the task guard so they render whenever `workspace` is available. Git actions (commit/push) stay gated on `task` since they need `task.id` for backend calls. Pause/resume/cancel also stay task-gated.

**Modified:** `src/renderer/components/AppHeader.tsx`

## 2026-04-09 12:19 (Dubai Time) - React component performance audit and fixes

**Scope:** Full audit of all 51 React components using parallel review agents. Applied fixes to the highest-impact findings.

**ChatPanel.tsx (HIGHEST IMPACT):**
- Extracted `StreamingMessageList` child component that owns the 4 streaming selectors (`streamingChunk`, `liveToolCalls`, `liveThinking`, `messages`). ChatPanel no longer re-renders on every streaming token — only the child does.
- Hoisted `EMPTY_MESSAGES`, `EMPTY_TOOL_CALLS`, `EMPTY_OPTIONS` as module-level constants to prevent defeating memo on child components.
- `messageCount` is now a primitive number selector instead of passing the whole messages array.

**TimelineRows.tsx:**
- Wrapped `McpStatusLines` and `McpActionBanner` in `memo()`. Previously un-memoized and re-rendered every 2.2s from WorkingRow's interval.
- Fixed WorkingRow leaked `setTimeout`: stored in `fadeRef`, cleared on cleanup.

**TerminalDrawer.tsx:**
- Wrapped in `memo()` to prevent re-renders from parent.
- PTY data/exit listeners now subscribe once with `[]` deps using `instancesRef` — no more listener churn on every `setInstances`.
- `handleDragStart` uses `heightRef` instead of `height` state — stable callback, no re-creation on drag.
- `handleClose` uses `instancesRef` instead of `instances` closure — stable callback.

**BranchSelector.tsx:**
- Split double-fetch into mount-only effect (`[]` deps) and open-only effect. No more double IPC call on mount.

**Files modified:**
- `src/renderer/components/chat/ChatPanel.tsx`
- `src/renderer/components/chat/TimelineRows.tsx`
- `src/renderer/components/chat/TerminalDrawer.tsx`
- `src/renderer/components/chat/BranchSelector.tsx`

**Build:** tsc ✓, vite build ✓ (6.53s)

## 2026-04-09 12:29 (Dubai Time) - Forward MCP server data with toolCount from ACP

**Problem:** The `commands/available` ACP notification includes `mcpServers` with `name`, `status`, and `toolCount` (e.g., `{"name": "slack", "status": "running", "toolCount": 8}`), but the Rust backend only forwarded the `commands` array and dropped `mcpServers`. The `/agent` slash panel was reading from `kiroStore` (static config file) which has no `toolCount` or live status.

**Fix:**
- `acp.rs`: Forward `mcpServers` alongside `commands` in the `commands_update` event
- `ipc.ts`: Updated `onCommandsUpdate` type to include `mcpServers`
- `settingsStore.ts`: Added `LiveMcpServer` type and `liveMcpServers` state
- `taskStore.ts`: `onCommandsUpdate` listener now stores `liveMcpServers`
- `SlashPanels.tsx`: `AgentListPanel` reads from `liveMcpServers` (live ACP data with toolCount) instead of `kiroStore` (static config). Shows "8 tools", "2 tools", etc.

**Files modified:**
- `src-tauri/src/commands/acp.rs`
- `src/renderer/lib/ipc.ts`
- `src/renderer/stores/settingsStore.ts`
- `src/renderer/stores/taskStore.ts`
- `src/renderer/components/chat/SlashPanels.tsx`

**Build:** tsc ✓, vite build ✓ (5.62s)

## 2026-04-09 12:58 (Dubai Time) - Fix messages lost when draft replaced by server task

**Root cause:** When a draft thread sends its first message, `ipc.createTask()` returns a server-created task with a NEW ID and `messages: []`. `upsertTask(created)` looks up `prev = state.tasks[created.id]` which is `undefined` (the draft has a different ID), so the message preservation logic falls through to `messages = []`. The user message and all subsequent assistant responses are lost.

**Fix:** In `ChatPanel.handleSendMessage`, after `createTask` returns, read the draft's current messages from the store and carry them over: `upsertTask({ ...created, messages })`.

**Files modified:**
- `src/renderer/components/chat/ChatPanel.tsx`

**Build:** tsc ✓, vite build ✓ (6.35s)

## 2026-04-09 13:01 (Dubai Time) - Fix messages wiped by task_update events with partial message list

**Root cause:** The Rust backend's `Task` struct accumulates user messages but never assistant responses, tool calls, or system messages. Every `task_update` event sends `messages: [user_msg_1, user_msg_2, ...]` — a partial list. The previous fix only preserved messages when `messages: []`, but the backend sends `messages.length > 0` (user messages only), which overwrote the frontend's full conversation history.

**Fix:** Changed `upsertTask` message logic from "preserve when empty" to "preserve when frontend has more messages than backend":
```
const messages = prev && prev.messages.length >= task.messages.length
  ? prev.messages
  : task.messages
```
The frontend always has more messages (assistant responses, tool calls, system messages). The backend's messages only win for brand-new tasks the frontend hasn't seen.

**Files modified:**
- `src/renderer/stores/taskStore.ts`

**Build:** tsc ✓, vite build ✓ (5.89s)

## 2026-04-09 13:05 (Dubai Time) - Strip messages from backend task_update events entirely

**Problem:** Tool calls, assistant responses, and system messages were being lost because backend `task_update` events send partial message lists (user messages only). Even the `>=` length check wasn't enough because the backend could send 1-2 user messages which is `>= 0` when the frontend had 0 messages at turn start.

**Fix:** Two changes:
1. `onTaskUpdate` listener now strips messages before calling `upsertTask`: `{ ...task, messages: [] }`. The backend never has useful message data for the frontend.
2. `upsertTask` uses `>` instead of `>=` for the length check, so frontend callers (onTurnEnd, handleSendMessage) can still append messages normally.

The frontend is now the sole source of truth for conversation history. Backend events only update status, pendingPermission, plan, and contextUsage.

**Files modified:**
- `src/renderer/stores/taskStore.ts`

**Build:** tsc ✓, vite build ✓ (5.27s)
## 2026-04-09 16:32 (Dubai)
- Added Steve Jobs quote to README.md as a markdown blockquote between the intro paragraph and Features section.

## 2026-04-09 16:36 (Dubai)
- Fixed SVG fill color from `#16505` (invalid) to `#165050`, saved as `assets/lastline-logo.svg`
- Converted SVG to PNG (120x104) at `assets/lastline-logo.png` using rsvg-convert
- Added Sponsors section to README.md between Contributing and Inspiration sections with Lastline logo and link to lastline.app

## 2026-04-09 16:38 (Dubai)
- Moved Sponsors section in README.md from between Contributing/Inspiration to between Inspiration/Author

## 2026-04-09 16:38 (Dubai)
- Moved Sponsors to directly below the logo at the top of README.md, centered with inline layout

## 2026-04-09 16:39 (Dubai)
- Restructured README header: centered h1 title, centered tagline, smaller sponsor line using `<sub>`, cleaner visual hierarchy

## 2026-04-09 16:42 (Dubai)
- Converted entire README header from HTML to pure markdown (no more `<p>`, `<h1>`, `<sub>`, `<a>`, `<img>` tags)

## 2026-04-09 16:43 (Dubai)
- Fixed README description: removed incorrect claim that Codex/T3Code are browser apps, repositioned Kirodex as a desktop app differentiated by Kiro CLI + ACP

## 2026-04-09 19:15 (Dubai)
- Improved ExecutionPlan component UI: accent-colored border (primary while running, emerald when done), progress bar between header and step list, aria-expanded/aria-label for accessibility, tabular-nums on counter, smoother transitions. Build validated (tsc + vite).

## 2026-04-09 21:24 (Dubai)
- Added Co-authored-by trailer to all git commits made through Kirodex. Every commit now appends `Co-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>` to the message. Modified `git_commit` in `git.rs`.

## 2026-04-09 21:27 (Dubai)
- Added co-author toggle to Settings > Misc tab. When enabled (default), commits include `Co-authored-by: Kirodex` trailer. Users can disable it from the new Misc tab. Changes: `settings.rs` (Rust struct + default), `git.rs` (conditional trailer via SettingsState), `index.ts` (TS type), `SettingsPanel.tsx` (Misc tab + toggle).

## 2026-04-09 21:40 (Dubai)
- Centered the "Found kiro-cli" state in the onboarding card: icon stacked above text, path centered below, removed left-aligned `pl-6` indent. Modified `Onboarding.tsx`.

## 2026-04-09 21:41 (Dubai)
- Matched header background to sidebar: added `bg-card` to both the main header and fallback header in `AppHeader.tsx`. Sidebar already uses `bg-card`.

## 2026-04-09 21:58 (Dubai)
- Fixed thread name overflow in sidebar: added `min-w-0` + `overflow-hidden` to project `<li>`, replaced `w-full` with `min-w-0` on thread `<li>`, removed `w-full` from thread list `<ul>`. Thread names now truncate properly within the sidebar width, keeping the delete button visible on hover. Modified `TaskSidebar.tsx`.

## 2026-04-10 02:10 GST (Dubai, UTC+4)

### Added file/image attachment support to chat input

Added drag-and-drop, paste, and file picker support for attaching files and images to chat messages, with previews and a cute animated drag-over state.

**What was built:**

1. **Rust backend** (`fs_ops.rs`): Added `read_file_base64` command using the `base64` crate (v0.22) for reading binary files as base64 strings. Registered in `lib.rs`.

2. **Types** (`types/index.ts`): Added `Attachment` interface and `AttachmentType` union (`'image' | 'text' | 'binary'`).

3. **IPC bridge** (`ipc.ts`): Added `readFileBase64` function.

4. **AttachmentPreview component** (`AttachmentPreview.tsx`):
   - Image thumbnails: 64px with object-cover, gradient overlay showing file size
   - File pills: smart icon selection (FileCode for code files, FileText for text, etc.)
   - Animated remove buttons that appear on hover
   - Accessible with role=list/listitem and aria-labels

5. **DragOverlay component** (`DragOverlay.tsx`):
   - Cute cat SVG mascot with ears, big eyes with shine, whiskers, nose, mouth, and paws
   - Bouncing animation on the cat
   - Animated marching dashed border (CSS keyframe `dash-march`)
   - Semi-transparent backdrop blur overlay

6. **ChatInput integration** (`ChatInput.tsx`):
   - Attachment state via `useState<Attachment[]>`
   - Drag counter pattern (`dragCounterRef`) to prevent flicker on child element boundaries
   - Drop handler: tries `text/uri-list` first for native Tauri paths, falls back to browser File API
   - Paste handler: intercepts clipboard image items
   - Paperclip button in footer toolbar with hidden `<input type="file" multiple>`
   - AttachmentPreview strip renders between mentioned files and textarea
   - DragOverlay renders inside the card container when `isDragOver`
   - `handleSend` builds message with attachment content:
     - Images: base64 data URLs with `<image>` tags
     - Text files: fenced code blocks with language extension
     - Binary files: path references
   - `canSend` updated to allow sending with attachments even without text

**Files modified:**
- `src-tauri/Cargo.toml` (added base64 = "0.22")
- `src-tauri/src/commands/fs_ops.rs` (added read_file_base64)
- `src-tauri/src/lib.rs` (registered read_file_base64)
- `src/renderer/types/index.ts` (Attachment type)
- `src/renderer/lib/ipc.ts` (readFileBase64)
- `src/renderer/components/chat/AttachmentPreview.tsx` (new)
- `src/renderer/components/chat/DragOverlay.tsx` (new)
- `src/renderer/components/chat/ChatInput.tsx` (integration)

**Verification:** Both TypeScript (`tsc --noEmit`) and Rust (`cargo check`) compile clean.

## 2026-04-09 22:16 (Dubai)
- Added right-click context menu on project names in sidebar with: Open in Finder (uses existing `openUrl` IPC), Edit Name (inline input with rename via `projectNames` store), Archive Threads (removes all threads but keeps project), Delete (with visual separator). Added `archiveThreads` store method. Wired `projectNames` into the sidebar so custom names persist. Modified `TaskSidebar.tsx` and `taskStore.ts`.

## 2026-04-09 22:44 (Dubai)
- Code-split the app using rolldown-vite:
  - Switched bundler from Vite/Rollup to rolldown-vite 7.3.1 (4x faster builds: 1.24s vs ~5.3s)
  - Added `manualChunks` splitting 6 vendor chunks: react (181KB), markdown (135KB), xterm (279KB), diffs (474KB), icons (24KB), tauri (19KB)
  - Lazy-loaded 6 heavy components via `React.lazy()`: ChatPanel, Playground, CodePanel, DebugPanel, SettingsPanel, Onboarding
  - Main index chunk: 231KB (down from 1,385KB — 83% reduction)
  - Modified: `package.json`, `vite.config.ts`, `App.tsx`

## 2026-04-09 23:57 (Dubai)
- Added joke to README.md footer: "Why did the AI agent refuse to use `unwrap()`? It didn't want to panic in production."

## 2026-04-10 00:07 GST (Dubai, UTC+4)

### Escape key pauses running agent from ChatInput

Added Escape key handler so pressing Esc while the agent is running pauses it (same as clicking the pause button). After pausing, the user can type a follow-up message to resume with a new steering direction.

- Passed `isRunning` and `onPause` into `useChatInput` hook
- Added Escape check at end of `handleKeyDown` (after panel/picker dismissals)
- Resume flow already worked via `ipc.sendMessage` — no changes needed

**Build:** `tsc --noEmit` ✓

**Modified:** `src/renderer/hooks/useChatInput.ts`, `src/renderer/components/chat/ChatInput.tsx`

---

## 2026-04-10 09:55 (Dubai)

### ThreadItem: Right-click context menu

Added a right-click context menu to `ThreadItem` matching the `ProjectItem` style.

**What changed:**
- Right-click on any thread now opens a context menu with:
  - **Rename** — triggers inline edit (same as double-click)
  - **Delete** — shows an inline confirmation ("Delete this thread?" + Delete/Cancel buttons) before calling `onDelete`
- Removed the old hover-only `Trash2` button
- Context menu closes on outside click; confirmation resets on close

**Build:** `tsc --noEmit` ✓ · `vite build` ✓

**Modified:** `src/renderer/components/sidebar/ThreadItem.tsx`

## 2026-04-10 10:05 GST (Dubai, UTC+4)

### Added ValidationException context hint to error messages

When a prompt error contains `ValidationException`, the user-facing error message now includes a tip explaining the likely cause: prompt too large or too many concurrent requests. Suggests closing unused sessions and trimming `alwaysApply` context rules to reduce per-request token usage.

**Build:** `cargo check` ✓

**Modified:** `src-tauri/src/commands/acp.rs`

---

## 2026-04-10 10:22 (Dubai)

### ChatInput: Inline attachment display

Moved file attachment chips from the separate top strip into the textarea content area, appearing inline above the text input.

**What changed:**
- `ChatInput.tsx`: moved `<AttachmentPreview>` from outside the content `div` to inside it, above the `<textarea>`
- `AttachmentPreview.tsx`: removed outer padding (`px-3 pt-3 pb-1 sm:px-4`) and switched to `flex-wrap gap-2 pb-2` since it now lives inside the already-padded content area
- `useSidebarTasks.ts`: fixed pre-existing TS bug — removed `threadOrder` from `useMemo` dependency array where it was referenced but never declared

**Build:** `tsc --noEmit` ✓ · `vite build` ✓

**Modified:** `src/renderer/components/chat/ChatInput.tsx`, `src/renderer/components/chat/AttachmentPreview.tsx`, `src/renderer/hooks/useSidebarTasks.ts`

## 2026-04-10 10:28 GST (Dubai, UTC+4)

### Removed MCP loading states from chat, simplified error display, updated sidebar dot colors

Cleaned up MCP status display across the app. Loading indicators (connecting spinners, ready dots) no longer appear in chat messages. Errors show as minimal text lines instead of styled banners. The sidebar now reflects MCP failures via dot color.

**What changed:**

- `WorkingRow.tsx`: Removed `McpStatusLines`, `McpActionBanner`, and all MCP-related imports (`Circle`, `Key`, `cn`, `useKiroStore`). The working indicator now shows only the cycling "Thinking…" text.

- `MessageItem.tsx`: Replaced `McpStatusLines` + `McpActionBanner` (duplicated from WorkingRow) with a minimal `McpErrorLines` component. Shows only error/auth-required servers as simple `text-[10px] text-red-400/70` lines (e.g., "slack — auth required", "github — failed"). Removed `Circle`, `Key`, `ipc` imports.

- `KiroConfigPanel.tsx`: Updated `McpRow` dot color logic:
  - Red (`fill-red-500`) for `error` or `needs-auth` status
  - Green (`fill-emerald-400`) for enabled servers
  - Grey (`fill-muted-foreground/20`) for disabled servers
  - Added tooltip with error details on hover
  - Added `mcpErrorCount` to MCP `SectionToggle` header (shows red dot + count when servers are failing)

**Modified:**
- `src/renderer/components/chat/WorkingRow.tsx`
- `src/renderer/components/chat/MessageItem.tsx`
- `src/renderer/components/sidebar/KiroConfigPanel.tsx`

---

## 2026-04-10 10:31 (Dubai)

### Fix: deleted threads/projects re-appearing in UI

**Root cause:** `cancelTask` triggers a backend `task_update` event. That event arrives after `removeTask`/`removeProject` already cleared the task from the store, causing `upsertTask` to re-add it — making the UI appear to hang with the deleted item still visible.

**Fix:** Added `deletedTaskIds: Set<string>` to the store. `removeTask`, `removeProject`, and `archiveThreads` now populate this set. `upsertTask` bails out immediately if the incoming task ID is in `deletedTaskIds`.

**Build:** `tsc --noEmit` ✓ · `vite build` ✓

**Modified:** `src/renderer/stores/taskStore.ts`

---

## 2026-04-10 10:36 (Dubai)

### Remove IPC Playground feature

Removed the Playground feature entirely.

**What changed:**
- Deleted `src/renderer/components/Playground.tsx`
- `App.tsx`: removed lazy import, `showPlayground` variable, `<Playground />` render branch, and `!showPlayground` guard on side panel
- `taskStore.ts`: removed `'playground'` from `view` union type (both interface and setter)
- `SidebarFooter.tsx`: removed Playground button, `setView` subscription, and `FlaskConical` import

**Build:** `tsc --noEmit` ✓ · `vite build` ✓

**Modified:** `src/renderer/App.tsx`, `src/renderer/stores/taskStore.ts`, `src/renderer/components/sidebar/SidebarFooter.tsx`
**Deleted:** `src/renderer/components/Playground.tsx`

---

## 2026-04-10 11:35 (Dubai)

### TerminalDrawer: port t3code-acp terminal improvements

Ported key improvements from `t3code-acp/apps/web/src/components/ThreadTerminalDrawer.tsx`.

**What changed:**
- `terminalTheme()` — reads live CSS vars from `getComputedStyle(document.body)` instead of hardcoding colors at creation time
- `MutationObserver` on `document.documentElement` — updates all terminal themes instantly when dark/light class changes
- **Split** (`SquareSplitHorizontal`) — adds a terminal to the active group, displayed side-by-side via CSS grid
- **New** (`Plus`) — creates a new standalone tab with its own group
- **Sidebar** — appears automatically when multiple tabs exist; shows "Terminal N" or "Split N" labels; toolbar moves into sidebar header
- `groupId` concept — terminals in the same group are shown side-by-side; different groups are separate tabs

**Build:** `tsc --noEmit` ✓ · `vite build` ✓

**Modified:** `src/renderer/components/chat/TerminalDrawer.tsx`

## 2026-04-10 11:47 (Dubai)

**Fix: "Get Started" button not clickable on onboarding after removing a crashed app**

Root cause: Two issues.
1. `data-tauri-drag-region` on the outer Onboarding `div` intercepted all mouse events, making the "Get Started" button unclickable.
2. `hasOnboarded` was only in the frontend TypeScript type but missing from the Rust `AppSettings` struct, so it was never persisted to disk via confy. After a crash + restart, onboarding would show again.

Changes:
- `src-tauri/src/commands/settings.rs`: Added `has_onboarded: bool` with `#[serde(default)]` to `AppSettings` struct and its `Default` impl.
- `src/renderer/components/Onboarding.tsx`: Removed `data-tauri-drag-region` from the outer container div. Added a small fixed drag region div at the top (`h-10`) for window dragging that doesn't cover interactive content.

Build: TS ✓, Vite ✓, Cargo ✓

## 2026-04-10 12:01 (Dubai)

**UI: Replace project letter badge + chevron with folder icon in sidebar**

- `src/renderer/components/sidebar/ProjectItem.tsx`: Removed the `<span>` letter badge and replaced `<ChevronRight>` with `<FolderOpen>` icon. Cleaned up unused `ChevronRight` import.

Build: TS ✓, Vite ✓

## 2026-04-10 12:05 (Dubai)

Replaced all `lucide-react` imports with `@tabler/icons-react` in four chat component files:

1. `TerminalDrawer.tsx` — SquareSplitHorizontal→IconLayoutColumns, Plus→IconPlus, Trash2→IconTrash, TerminalSquare→IconTerminal2
2. `tool-call-utils.ts` — FileText→IconFileText, FileEdit→IconFilePencil, Trash2→IconTrash, FolderSearch→IconFolderSearch, Terminal→IconTerminal2, Brain→IconBrain, Globe→IconGlobe, ArrowRightLeft→IconArrowsRightLeft, Wrench→IconTool, LucideIcon type→TablerIcon (typeof IconTool)
3. `ToolCallDisplay.tsx` — ChevronDown→IconChevronDown, ChevronRight→IconChevronRight, Check→IconCheck, Loader2→IconLoader2, X→IconX, Zap→IconBolt
4. `ToolCallEntry.tsx` — ChevronDown→IconChevronDown, ChevronRight→IconChevronRight, Check→IconCheck, Loader2→IconLoader2, X→IconX, FileEdit→IconFilePencil, Terminal→IconTerminal2

TypeScript check passes with zero errors in modified files.

## 2026-04-10 12:05 GST — Batch 6: Replace lucide-react with @tabler/icons-react (remaining files)

Migrated 9 files from lucide-react to @tabler/icons-react:

1. `OpenInEditorGroup.tsx` — ChevronDown → IconChevronDown
2. `GitActionsGroup.tsx` — GitCommitHorizontal → IconGitCommit, ChevronDown → IconChevronDown
3. `AppHeader.tsx` — Pause → IconPlayerPause, Play → IconPlayerPlay, XCircle → IconCircleX, GitCompareArrows → IconGitCompare, TerminalSquare → IconTerminal2, PanelLeftClose → IconLayoutSidebarLeftCollapse, PanelLeftOpen → IconLayoutSidebarLeftExpand
4. `ErrorBoundary.tsx` — AlertCircle → IconAlertCircle, RotateCcw → IconRotate
5. `dashboard/TaskCard.tsx` — ShieldAlert → IconShieldExclamation
6. `dashboard/Dashboard.tsx` — Bot → IconRobot, Plus → IconPlus, FolderOpen → IconFolderOpen
7. `settings/SettingsPanel.tsx` — 21 icons: X → IconX, Check → IconCheck, AlertCircle → IconAlertCircle, Plus → IconPlus, Trash2 → IconTrash, ChevronDown → IconChevronDown, Loader2 → IconLoader2, Search → IconSearch, History → IconHistory, Keyboard → IconKeyboard, Settings2 → IconSettings2, Users → IconUsers, Paintbrush → IconPaintbrush, Wrench → IconTool, Terminal → IconTerminal, GitBranch → IconGitBranch, Shield → IconShield, Eye → IconEye, Type → IconTypography, Palette → IconPalette, Command → IconCommand, ArrowLeft → IconArrowLeft
8. `sidebar/KiroConfigPanel.tsx` — 26 icons: Bot → IconRobot, Zap → IconBolt, Compass → IconCompass, ChevronRight → IconChevronRight, FolderDot → IconFolderCode, CircleDot → IconCircleDot, CircleDashed → IconCircleDashed, Search → IconSearch, X → IconX, Layers → IconStack2, Database → IconDatabase, Globe → IconWorld, Terminal → IconTerminal, Cpu → IconCpu, Wrench → IconTool, FlaskConical → IconFlask, BookOpen → IconBook, Rocket → IconRocket, Shield → IconShield, Palette → IconPalette, BarChart2 → IconChartBar, Cloud → IconCloud, GitBranch → IconGitBranch, Boxes → IconBoxMultiple, Plug → IconPlug, Circle → IconCircle
9. `sidebar/KiroFileViewer.tsx` — X → IconX, ExternalLink → IconExternalLink

Remaining lucide-react imports (not in scope): `chat/QuestionCards.tsx`, `chat/MessageItem.tsx`

## 2026-04-10 12:03 (Dubai)

**Chore: Remove lucide-react, replace all icons with @tabler/icons-react**

- Migrated 40 files from `lucide-react` to `@tabler/icons-react`
- Removed `lucide-react` from `package.json` (1 package removed)
- Key icon mappings: Plus→IconPlus, Check→IconCheck, X→IconX, ChevronDown→IconChevronDown, Trash2→IconTrash, Copy→IconCopy, Loader2→IconLoader2, Image→IconPhoto, Rows2→IconLayoutRows, PanelLeftClose→IconLayoutSidebarLeftCollapse, etc.
- Fixed incorrect tabler names: IconRows→IconLayoutRows, IconPaintbrush→IconPaint

Build: TS ✓, Vite ✓

## 2026-04-10 12:24 (Dubai)

**Docs: Add icon steering rule and update CLAUDE.md**

- Updated `CLAUDE.md`: removed Lucide from tech stack, added icon convention (tabler only, never lucide-react)
- Created `.kiro/steering/icons.md` with `alwaysApply: true` rule enforcing `@tabler/icons-react` exclusively

## 2026-04-10 12:26 (Dubai)
- Removed "Author" section (Sabeur Thabti) from README.md