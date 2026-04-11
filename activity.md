# Activity Log

## 2026-04-11 19:22 (Dubai)
- Removed `xattr -cr` unsigned build reference from `.github/workflows/release.yml` release notes template
- Fixed delete button background bleed-through in `ThreadItem.tsx` — increased gradient opacity from 0.55 to 0.85 (active state) and tightened gradient stop from 40% to 35%

## 2026-04-11 19:30 (Dubai)
- Replaced violet/purple colors with brand blue across chat components (kept purple only on agent IconRobot)
  - `ChatPanel.tsx`: ArchivedBanner zigzag SVGs, history icon, and label text — violet → blue
  - `FileMentionPicker.tsx`: SVG file type badge — violet → blue
  - `FileMentionPicker.tsx`: Agent badge background in picker list — purple → blue
  - Preserved `text-purple-400` on `IconRobot` (line 206) as the agent icon color

## 2026-04-11 19:32 (Dubai)
- Reverted agent badge background in `FileMentionPicker.tsx` (line 366) back to `bg-purple-500/20 text-purple-400` — purple/violet stays for all agent icon elements

## 2026-04-11 19:34 (Dubai)
- Added thread name and project name filter dropdowns to the debug panel
  - `debugStore.ts`: Added `threadName` and `projectName` fields to filter state
  - `DebugPanel.tsx`: Imported `useTaskStore`, cross-references `entry.taskId` with tasks to derive unique thread/project names, added two conditional `<select>` dropdowns (only visible when threads/projects exist)
  - Filtering logic applies threadName and projectName alongside existing search, category, and errorsOnly filters — copy all and count reflect combined filtered results
  - `debugStore.test.ts`: Updated initial state to include new filter fields
  - TypeScript compiles clean

## 2026-04-11 19:40 (Dubai)
- Fixed inaccurate +/- line counts in `ChangedFilesSummary.tsx`
  - `computeLineDelta` was counting total lines in old/new text as deletions/additions (e.g., changing 1 line in a 100-line file showed +100/-100)
  - Replaced with line-level diff: splits both texts into lines, computes symmetric difference to count only actual additions and deletions
  - Removed unused `countLines` helper

## 2026-04-11 23:40 (Dubai)
- Added visual archive icon indicator for view-only/old threads in the sidebar
  - `useSidebarTasks.ts`: Added `isArchived` to `SidebarTask` interface, included it in structural sharing comparison and field mapping
  - `ThreadItem.tsx`: Imported `IconArchive`, renders a small archive icon to the right of the thread name when `task.isArchived` is true
  - TypeScript compiles clean

## 2026-04-12 00:21 (Dubai)
- Added optional task completion JSON report feature
  - `settings.rs`: Added `co_author_json_report` boolean (default false) to `AppSettings`
  - `types/index.ts`: Added `coAuthorJsonReport` to TS `AppSettings` interface
  - `acp.rs`: `task_create` conditionally appends `kirodex-report` code fence instructions when setting is enabled
  - `TaskCompletionCard.tsx`: New component with `parseReport`/`stripReport` helpers — renders a status card (done/partial/blocked) with file list and +/- line stats
  - `MessageItem.tsx`: Detects `kirodex-report` fences in assistant messages, strips them from markdown, renders `TaskCompletionCard` below
  - `SettingsPanel.tsx`: Added "Task completion report" toggle under Advanced > Git Integration

## 2026-04-12 00:28 (Dubai)
- Fixed messages not appearing until user scrolls/interacts (virtualizer stale measurement bug)
  - `MessageList.tsx`: Added `rowFingerprint` (joined row IDs) to detect structural timeline changes
  - Added `virtualizer.measure()` effect that fires when row structure changes, forcing recalculation of cached sizes
  - Changed auto-scroll dependency from `timelineRows.length` to `rowFingerprint` so it fires when rows are replaced (live → persisted), not just added
  - Bumped virtualizer `overscan` from 5 to 8 for smoother off-screen rendering
## 2026-04-11 20:32 (Dubai)

- Changed Agents icon color in Kiro side panel from `text-blue-400` (blue) to `text-violet-400` (purple/violet)
- File modified: `src/renderer/components/sidebar/KiroConfigPanel.tsx` line 434

## 2026-04-12 00:33 (Dubai)
- Moved archive icon to the left side of thread name in sidebar
  - `ThreadItem.tsx`: Moved `IconArchive` rendering block from after the thread name to before it
  - Thread item order is now: status dot → archive icon → thread name → relative time
  - Previously: status dot → thread name → archive icon → relative time

## 2026-04-12 00:32 (Dubai)
- Fixed excessive padding between squashed/grouped timeline rows in chat message list
  - `timeline.ts`: Added `squashed?: boolean` to `AssistantTextRow` and `WorkRow` types; set `squashed=true` on assistant-text rows followed by work rows, and on work rows followed by changed-files rows; also applied to live streaming rows
  - `AssistantTextRow.tsx`: Bottom padding reduced from `pb-4` to `pb-1` when squashed
  - `WorkGroupRow.tsx`: Bottom padding reduced from `pb-3` to `pb-0` when squashed
  - TypeScript compiles clean

## 2026-04-11 20:36 (Dubai)
- Added tooltip to thread items in project panel sidebar showing full title on hover
  - `ThreadItem.tsx`: Imported `Tooltip`, `TooltipTrigger`, `TooltipContent` from shadcn; wrapped the truncated thread name `<span>` with a tooltip that displays `task.name` on the right side
  - TypeScript compiles clean

## 2026-04-11 20:41 (Dubai)
- Committed all pending changes in logical groups:
  - `e6567a7` feat(chat): add task completion card with JSON report
  - `2b5eadd` feat(chat): aggregate task lists and add collapsible display
  - `07f44ab` fix(chat): improve changed-files summary layout and row height estimates
  - `e3cc44d` fix(sidebar): add thread tooltip, reorder archive icon, update agents color (also included plans, capabilities, activity)
  - `0f1a0c8` style(chat): fix indentation in ChangedFilesSummary

## 2026-04-11 20:39 (Dubai)
- Fixed squashed message bubbles by widening container max-width breakpoints from `max-w-2xl/3xl/4xl` to `max-w-3xl/4xl/5xl` across five chat components: `MessageList.tsx`, `ChatInput.tsx`, `ChatPanel.tsx`, `QueuedMessages.tsx`, `PermissionBanner.tsx`

## 2026-04-11 20:37 (Dubai)
- Fixed Send button appearing grey/invisible when disabled — changed `disabled:opacity-30` to `disabled:opacity-50` in `ChatInput.tsx` so the button stays visibly blue
- Changed Pause button color from purple (`rgba(139,92,246)`) to blue (`rgba(59,130,246)`) to match the Send button

## 2026-04-11 20:41 (Dubai)
- Fixed two bugs with task list (checklist) display inside tool calls:
  1. **Checklists now collapse** — `TaskListDisplay.tsx` got its own collapsible header with chevron toggle (expanded by default)
  2. **Checklists now show correct checked state** — Instead of reading tasks from a single tool call's `rawOutput` (which only has a snapshot from that specific `create`/`complete`/`add` call), the component now aggregates the latest task state across ALL sibling task-list tool calls. Only the last task-list tool call in a group renders the checklist (avoids duplicates).
- Modified files:
  - `src/renderer/components/chat/TaskListDisplay.tsx` — added collapse toggle, `aggregateLatestTasks()`, `isLastTaskListToolCall()`
  - `src/renderer/components/chat/ToolCallEntry.tsx` — accepts `allToolCalls` prop, passes it to `TaskListDisplay`
  - `src/renderer/components/chat/ToolCallDisplay.tsx` — passes `toolCalls` array down to each `ToolCallEntry`

## 2026-04-11 20:38 (Dubai)
- Fixed overlapping file changes and tool calls sections in chat UI
  - **Root cause**: The virtualizer uses absolute positioning with `translateY` for each row. Three issues combined to cause overlap:
    1. Row size estimates were too small (`work`: 40px, `changed-files`: 64px) for actual rendered content
    2. `ChangedFilesSummary` used CSS margins (`mt-2 mb-4`) which don't contribute to measured height on absolutely-positioned virtualizer children
    3. `WorkGroupRow` with `squashed=true` had `pb-0`, leaving zero spacing before the changed-files row
  - **Fixes applied**:
    - `MessageList.tsx`: Increased row estimates for `work` (40→120) and `changed-files` (64→140)
    - `ChangedFilesSummary.tsx`: Wrapped content in an outer `<div>` with `pt-2 pb-4` padding instead of margins (padding is included in box model measurement)
    - `WorkGroupRow.tsx`: Changed squashed padding from `pb-0` to `pb-1`
  - TypeScript compiles clean

## 2026-04-11 20:50 (Dubai) — Auto-update feature implementation

### Changes
- Installed `tauri-plugin-updater` and `tauri-plugin-process` (Rust + JS)
- Configured `tauri.conf.json`: `createUpdaterArtifacts: true`, updater plugin with GitHub endpoint
- Added `updater:default` and `process:default` permissions to capabilities
- Updated `release.yml` with `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars
- Created `updateStore.ts` (zustand) for cross-component update state
- Created `useUpdateChecker.ts` hook: auto-check on mount + every 4h, download with progress, restart via relaunch
- Added `UpdateNotifier` component in `App.tsx` for Sonner toast notifications
- Added `UpdatesCard` in Settings > General for manual update checks

### Files modified
- `.github/workflows/release.yml`
- `bun.lock`, `package.json`
- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- `src/renderer/App.tsx`
- `src/renderer/components/settings/SettingsPanel.tsx`
- `src/renderer/hooks/useUpdateChecker.ts` (new)
- `src/renderer/stores/updateStore.ts` (new)
