# Activity Log

## 2026-04-14 17:52 GST (Dubai)

### Rust: Fix unused variable warning and failing settings test

Moved `escaped` variable inside `#[cfg(target_os = "macos")]` block in `fs_ops.rs` to eliminate the unused variable warning on Linux CI. Prefixed `is_plan_mode` with underscore in `acp.rs`. Set `analytics_enabled` default to `false` (opt-in) to match the `default_settings_values` test assertion.

**Modified:** `src-tauri/src/commands/fs_ops.rs`, `src-tauri/src/commands/acp.rs`, `src-tauri/src/commands/settings.rs`

## 2026-04-14 17:28 GST (Dubai)

### ChatInput: Support mid-sentence slash commands and @ mentions

Refactored slash command detection from `value.startsWith('/')` to a cursor-position-based `slashTrigger` state that scans backwards from the cursor for `/` preceded by whitespace or start-of-input. This mirrors the existing `@` mention detection pattern. `handleSelectCommand` now replaces only the `/trigger` portion, preserving surrounding text. Escape dismisses the picker without clearing the input.

**Modified:** `src/renderer/hooks/useChatInput.ts`

## 2026-04-14 17:26 GST (Dubai)

### EmptyThreadSplash: Add per-command icon colors

Each splash command icon now has a distinct color: `/plan` teal, `/model` amber, `/agent` purple, `/clear` red, `/compact` sky, `/context` blue, `/tools` orange, `/usage` emerald, `@file` cyan, `@folder` indigo.

**Modified:** `src/renderer/components/chat/EmptyThreadSplash.tsx`

## 2026-04-14 17:13 GST (Dubai)

### EmptyThreadSplash: Open pickers on click

Clicking a splash `/` command now inserts the text into the input and opens the slash command picker. Clicking an `@` command inserts `@` and opens the file mention picker. The `splash-insert` event handler uses `requestAnimationFrame` to set cursor position and calls `detectMentionTrigger` so the mention picker activates immediately.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-14 17:09 GST (Dubai)

### EmptyThreadSplash: Make items clickable with hover states

Converted splash items from static divs to interactive buttons with `hover:bg-muted/50`, `active:bg-muted/70`, and `focus-visible:ring` states. Clicking a slash command inserts it into the chat input via a `splash-insert` custom event; clicking an @ command inserts `@` to trigger the file mention picker. Added the corresponding event listener in `ChatInput.tsx`.

**Modified:** `src/renderer/components/chat/EmptyThreadSplash.tsx`, `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-14 17:04 GST (Dubai)

### PendingChat: Replace empty state with splash screen

Replaced the plain "New thread" text in the pending chat view with a rich EmptyThreadSplash component. The splash shows eight slash commands (/plan, /model, /agent, /clear, /compact, /context, /tools, /usage) and two @ mention commands (@file, @folder) in a two-column grid with icons and descriptions.

**Modified:** `src/renderer/components/chat/EmptyThreadSplash.tsx`, `src/renderer/components/chat/PendingChat.tsx`

## 2026-04-14 16:49 GST (Dubai)

### BranchSelector: Refresh branch name on window focus

BranchSelector only fetched branches on mount and when the dropdown was opened, so the displayed branch name went stale after switching branches externally (e.g., in terminal). Added a `window` focus event listener that re-fetches branches when the user returns to the app. Also fixed the mount useEffect to properly depend on `fetchBranches` instead of suppressing the exhaustive-deps lint rule.

**Modified:** `src/renderer/components/chat/BranchSelector.tsx`

## 2026-04-14 16:46 GST (Dubai)

### SlashCommandPicker + SlashPanels: Add fuzzy search to slash commands and sub-menus

Extracted `fuzzyScore` into a shared `lib/fuzzy-search.ts` util. SlashCommandPicker now uses fuzzy matching (name + description) instead of `startsWith`. ModelPickerPanel shows a search input when >5 models with fuzzy filtering by name/ID. AgentListPanel shows a search input when >5 total items, fuzzy-filtering built-in agents, .kiro agents, and MCP servers with an empty-state message.

**Modified:** `src/renderer/lib/fuzzy-search.ts`, `src/renderer/components/chat/SlashCommandPicker.tsx`, `src/renderer/components/chat/SlashPanels.tsx`, `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-14 16:44 GST (Dubai)

### FileMentionPicker: Apply fuzzy search to agents and skills in @ panel

Kiro items (built-in agents, .kiro agents, skills) in the @ mention picker now use the same `fuzzyScore` function as file search instead of simple `.includes()` filtering. Matches are scored and sorted by relevance (exact > starts-with > contains > subsequence). Agent descriptions are also fuzzy-matched with a lower priority weight.

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-14 16:40 GST (Dubai)

### FileMentionPicker: @ mention shows agents with styled pills

Built-in agents (Default, Planner) now appear at the top of the @ mention picker with their specific icons (IconCode/blue, IconListCheck/teal). .kiro agents follow with IconRobot/violet. FileMentionPill renders agent pills with the correct icon, color, and formatted full name (e.g. "Rust Senior Engineer" instead of "rust-senior-engineer").

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-14 16:35 GST (Dubai)

### KiroConfigPanel + SlashPanels: Fix agent grouping and /agent visibility

Custom .kiro agents (kirodex, rust-senior-engineer, react-expert) were grouped under "Other" in the sidebar because `getAgentStack()` only matched hardcoded framework prefixes. Renamed the fallback group from "other" to "custom" with a violet robot icon. Also added .kiro agents to the `/agent` slash panel, which previously only showed built-in agents (Default, Planner).

**Modified:** `src/renderer/components/sidebar/KiroConfigPanel.tsx`, `src/renderer/components/chat/SlashPanels.tsx`

## 2026-04-14 16:37 GST (Dubai)

### ChatInput: Increase border width to 2px

Changed the ChatInput container border from `border` (1px) to `border-2` (2px) so the blue/teal focus and idle borders are more visible and defined around the rounded edges.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-14 16:34 GST (Dubai)

### ChatInput: Improve background color from flat grey to darker surface

Replaced the hardcoded `#2c2e35` background with `#1a1b1e`, a darker and cooler surface tone that integrates better with the `#0D0D0D` dark theme background. Updated both the container background and the scroll shadow gradient to match.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-14 16:32 GST (Dubai)

### Chat: /close slash command archives threads instead of deleting

Added `archiveTask` method to TaskStore that sets `isArchived=true`, marks status as completed, cancels the running agent, clears streaming state, deletes from backend, and persists history. Changed `/close` and `/exit` slash commands to call `archiveTask` instead of `removeTask` + `deleteTask`. Archived threads show an archive icon in the sidebar, a "Previous conversation — view only" zigzag banner, and a disabled input area.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/hooks/useSlashAction.ts`

## 2026-04-14 16:31 GST (Dubai)

### ACP: Fix undefined `question_format` compile error

Removed stale `{question_format}` placeholder from the `full_prompt` format string in `acp.rs`. The structured questions content had already been merged into the `system_prefix` concat block, so the variable reference was a leftover causing `E0425`.

**Modified:** `src-tauri/src/commands/acp.rs`

## 2026-04-14 16:30 GST (Dubai)

### SlashPanels: add built-in agents to /agent panel with selection

The /agent panel now shows Default (IconCode, blue) and Planner (IconListCheck, teal) agents at the top with active state indicator. Selecting an agent calls `/agent <id>` via sendMessage, sets the mode, and dismisses the panel. MCP servers listed below a separator.

**Modified:** `src/renderer/components/chat/SlashPanels.tsx`

## 2026-04-14 16:07 GST (Dubai)

### TaskStore: Per-thread plan mode

Made plan mode per-thread instead of global. Added `taskModes: Record<string, string>` to `taskStore` so each thread independently tracks its own mode. Switching threads restores the correct plan toggle state; new threads always start with plan mode off.

**Modified:** `src/renderer/stores/taskStore.ts`, `src/renderer/App.tsx`, `src/renderer/components/chat/PlanToggle.tsx`, `src/renderer/hooks/useSlashAction.ts`, `src/renderer/components/chat/PlanHandoffCard.tsx`, `src/renderer/components/chat/PendingChat.tsx`, `src/renderer/components/chat/ChatPanel.tsx`

## 2026-04-14 16:07 GST (Dubai)

### Chat: fix agent mode switching and PlanToggle visibility

Mode switching (plan ↔ default) now sends `/agent <modeId>` via `ipc.sendMessage` so kiro-cli actually switches the agent, not just the session mode. PlanToggle no longer depends on `availableModes` being populated; the button always renders since both modes are known client-side.

**Modified:** `src/renderer/hooks/useSlashAction.ts`, `src/renderer/components/chat/PlanToggle.tsx`

## 2026-04-14 16:04 GST (Dubai)

### QuestionCards & CollapsedAnswers: default open + require all answered

CollapsedAnswers now defaults to expanded so users see their answered questions immediately. QuestionCards submit button is disabled until every question with options is answered; the button shows "Next" to navigate to unanswered questions and only enables "Submit" when all are complete. Enter key shortcut and handleContinue are also guarded.

**Modified:** `src/renderer/components/chat/CollapsedAnswers.tsx`, `src/renderer/components/chat/QuestionCards.tsx`

## 2026-04-14 15:58 GST (Dubai)

### TaskListDisplay: Check rawInput for completed_task_ids

The `complete` command sends `completed_task_ids` in `rawInput` (the tool parameters), not `rawOutput` (the tool result). Updated `extractCompletedIds` to accept any raw object generically, and `aggregateLatestTasks` now falls back to `rawInput` when `rawOutput` doesn't contain `completed_task_ids`. This ensures the last task gets ticked when the agent marks it done.

**Modified:** `src/renderer/components/chat/TaskListDisplay.tsx`

## 2026-04-14 15:45 GST (Dubai)

### TaskListDisplay: Fix last task never ticked

Fixed two bugs preventing the last task from showing as completed. First, `aggregateLatestTasks` now handles `complete` command output that only returns `completed_task_ids` (no `tasks` array) by marking matching tasks as completed in the existing map. Second, moved `TaskListDisplay` rendering from `ToolCallEntry` to `ToolCallDisplay` so it always uses the full `toolCalls` array, unaffected by the `MAX_VISIBLE_DEFAULT` truncation that hides tool calls beyond the first six.

**Modified:** `src/renderer/components/chat/TaskListDisplay.tsx`, `src/renderer/components/chat/ToolCallDisplay.tsx`, `src/renderer/components/chat/ToolCallEntry.tsx`

## 2026-04-14 15:48 GST (Dubai)

### ChatInput: Set user message bubble background to #2c2e35

Changed the user message bubble from `bg-primary/10 dark:bg-primary/[0.08]` to `bg-[#2c2e35]`.

**Modified:** `src/renderer/components/chat/UserMessageRow.tsx`

## 2026-04-14 15:47 GST (Dubai)

### ChatInput: Set background to #2c2e35

Changed the ChatInput wrapper background from `bg-card` to `bg-[#2c2e35]`. Updated the scroll shadow gradient to match.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-14 15:25 GST (Dubai)

### UX: Complete Linear/Codex-inspired colour overhaul and sidebar density upgrade

Full 9-task UX overhaul: redesigned CSS colour tokens (dark bg #0D0D0D, card #141414, sidebar #111111, muted-foreground #9a9a9a, border 10% white, primary #6366f1 indigo; light mode: solid hex values, border #e5e5e5, foreground #1a1a1a). Bumped sidebar font sizes to 13px with h-8 row heights for Linear-like comfortable density. Applied ~130 contrast fixes across 35+ component files — all opacity modifiers on text, borders, and backgrounds bumped to meet WCAG AA contrast. Both `bun run check:ts` and `npx vite build` pass clean.

**Modified:** src/tailwind.css, tailwind.css, AppHeader.tsx, Onboarding.tsx, AttachmentPreview.tsx, BranchSelector.tsx, ChangedFilesSummary.tsx, ChatInput.tsx, ChatPanel.tsx, CollapsedAnswers.tsx, ExecutionPlan.tsx, FileMentionPicker.tsx, InlineDiff.tsx, MessageItem.tsx, PendingChat.tsx, QuestionCards.tsx, QueuedMessages.tsx, ReadOutput.tsx, SlashCommandPicker.tsx, SlashPanels.tsx, TaskCompletionCard.tsx, TaskListDisplay.tsx, TerminalDrawer.tsx, ToolCallDisplay.tsx, ToolCallEntry.tsx, UserMessageRow.tsx, WorkingRow.tsx, DiffViewer.tsx, DebugPanel.tsx, DiffPanel.tsx, SettingsPanel.tsx, KiroConfigPanel.tsx, KiroFileViewer.tsx, ProjectItem.tsx, SidebarFooter.tsx, TaskSidebar.tsx, ThreadItem.tsx

## 2026-04-14 15:19 (Dubai Time)

### Task 7: Fix settings, onboarding, and overlay panel contrast

Applied contrast improvement rules across 7 files to increase text/border/background visibility.

**Files modified:**
1. `src/renderer/components/settings/SettingsPanel.tsx` - 22 replacements
2. `src/renderer/components/Onboarding.tsx` - 21 replacements
3. `src/renderer/components/chat/BranchSelector.tsx` - 7 replacements
4. `src/renderer/components/chat/SlashCommandPicker.tsx` - 1 replacement
5. `src/renderer/components/chat/SlashPanels.tsx` - 6 replacements
6. `src/renderer/components/chat/FileMentionPicker.tsx` - 5 replacements
7. `src/renderer/components/chat/QuestionCards.tsx` - 6 replacements

**Rules applied:**
- `text-muted-foreground/25` → `/50`
- `text-muted-foreground/30` → `/60`
- `text-muted-foreground/40` → `/70`
- `text-muted-foreground/50` → `/70`
- `text-foreground/15` → `text-muted-foreground/50`
- `text-foreground/20` → `text-muted-foreground/60`
- `text-foreground/25` → `text-muted-foreground/70`
- `text-foreground/30` → `text-muted-foreground`
- `text-foreground/40` → `text-muted-foreground`
- `text-foreground/50` → `text-foreground/70`
- `text-foreground/60` → `text-foreground/80`
- `border-border/30` → `border-border/60`
- `border-border/40` → `border-border/60`
- `bg-card/30` → `bg-card/60`
- `bg-card/50` → `bg-card/70`
- `bg-muted/20` → `bg-muted/40`
- `bg-muted/30` → `bg-muted/50`

## 2026-04-14 15:19 (Dubai Time)

### Task 8: Fix secondary panels contrast

Applied contrast improvement rules across 17 files (some had no matching patterns).

**Files modified:**
1. `src/renderer/components/debug/DebugPanel.tsx` - 13 replacements
2. `src/renderer/components/diff/DiffPanel.tsx` - 11 replacements
3. `src/renderer/components/code/DiffViewer.tsx` - 9 replacements
4. `src/renderer/components/code/CodePanel.tsx` - 0 replacements (no matching patterns)
5. `src/renderer/components/code/DebugLog.tsx` - 0 replacements (no matching patterns)
6. `src/renderer/components/code/TerminalOutput.tsx` - 0 replacements (no matching patterns)
7. `src/renderer/components/chat/TerminalDrawer.tsx` - 1 replacement
8. `src/renderer/components/dashboard/Dashboard.tsx` - 1 replacement
9. `src/renderer/components/dashboard/TaskCard.tsx` - 0 replacements (no matching patterns)
10. `src/renderer/components/chat/ChangedFilesSummary.tsx` - 9 replacements
11. `src/renderer/components/chat/TaskListDisplay.tsx` - 6 replacements
12. `src/renderer/components/chat/ExecutionPlan.tsx` - 1 replacement
13. `src/renderer/components/chat/TaskCompletionCard.tsx` - 1 replacement
14. `src/renderer/components/chat/PlanHandoffCard.tsx` - 0 replacements (no matching patterns)
15. `src/renderer/components/chat/QueuedMessages.tsx` - 6 replacements
16. `src/renderer/components/chat/AttachmentPreview.tsx` - 9 replacements
17. `src/renderer/components/chat/InlineDiff.tsx` - 3 replacements

**Rules applied:**
- `text-muted-foreground/25` → `/50`
- `text-muted-foreground/30` → `/60`
- `text-muted-foreground/40` → `/70`
- `text-muted-foreground/50` → `/70`
- `text-foreground/25` → `text-muted-foreground/70`
- `text-foreground/30` → `text-muted-foreground`
- `text-foreground/40` → `text-muted-foreground`
- `text-foreground/50` → `text-foreground/70`
- `text-foreground/60` → `text-foreground/80`
- `text-foreground/70` → `text-foreground/85`
- `border-border/30` → `border-border/60`
- `border-border/40` → `border-border/60`
- `bg-card/30` → `bg-card/60`
- `bg-card/45` → `bg-card/70`
- `bg-muted/10` → `bg-muted/30`
- `bg-muted/20` → `bg-muted/40`
- `bg-muted/30` → `bg-muted/50`