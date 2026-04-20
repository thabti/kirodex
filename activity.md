# Activity Log


## 2026-04-20 14:20 GST (Dubai)
### TaskStore: Restore soft-deleted threads when re-importing the same project
Fixed issue #17 — when a user removes a project and re-imports the same workspace, old threads are now automatically restored from the soft-deleted pool. The `addProject()` method filters `softDeleted` entries by workspace match, moves them back to `tasks` (as archived), removes their IDs from the `deletedTaskIds` blocklist, and persists the change.

**Modified:** `src/renderer/stores/taskStore.ts`

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
