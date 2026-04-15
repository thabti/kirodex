## 2026-04-15 11:40 GST (Dubai)

### Sidebar: Soft-delete threads with 2-day retention and Recently Deleted section

Implemented soft-delete for threads: deleting a thread now moves it to a "Recently Deleted" section at the bottom of the sidebar instead of permanently removing it. Threads are automatically purged after 48 hours. Users can restore or permanently delete threads from the collapsible sidebar section. Added 30 new unit tests across taskStore, history-store, and RecentlyDeleted component.

**Modified:** `src/renderer/types/index.ts`, `src/renderer/lib/history-store.ts`, `src/renderer/lib/history-store.test.ts`, `src/renderer/stores/taskStore.ts`, `src/renderer/stores/taskStore.test.ts`, `src/renderer/App.tsx`, `src/renderer/components/sidebar/RecentlyDeleted.tsx`, `src/renderer/components/sidebar/RecentlyDeleted.test.tsx`, `src/renderer/components/sidebar/TaskSidebar.tsx`

## 2026-04-15 11:34 GST (Dubai)

### Chat: Redesign task completion report to plain text style

Removed alert-style colored card from TaskCompletionCard and ChangedFilesSummary report header. Both now render as a plain text line ("Done · summary") with +/- stats and a clickable file list. Removed unused status icon imports (IconCheck, IconAlertTriangle, IconBan).

**Modified:** `src/renderer/components/chat/TaskCompletionCard.tsx`, `src/renderer/components/chat/ChangedFilesSummary.tsx`

## 2026-04-15 11:28 GST (Dubai)

### Styling: Set base font size to 14px

Changed the root `html` font-size from 100% (16px) to 87.5% (14px) in `tailwind.css`. Adjusted the responsive breakpoint scaling to maintain the same proportional step-ups (93.75% at 900px, 100% at 1100px).

**Modified:** `src/tailwind.css`

## 2026-04-15 11:17 GST (Dubai)

### Model Icons: Show Kiro logo for "auto" model

Updated the provider detection regex in `model-icons.tsx` to match `auto` as a Kiro provider. The "auto" model option now displays the Kiro icon instead of the generic unknown icon.

**Modified:** `src/renderer/lib/model-icons.tsx`

## 2026-04-15 11:12 GST (Dubai)

### Chat: Wire font size setting to chat bubbles with 14px minimum

Changed the default font size from 13px to 14px and raised the minimum from 10px to 14px. Wired the settings store `fontSize` into ChatMarkdown (agent responses), UserMessageRow (user bubbles), and MessageItem (legacy user bubbles) via inline `style={{ fontSize }}`. The Appearance > Font size slider (14–18px) now controls chat bubble text in real time.

**Modified:** `src/renderer/stores/settingsStore.ts`, `src/renderer/components/settings/SettingsPanel.tsx`, `src/renderer/components/chat/ChatMarkdown.tsx`, `src/renderer/components/chat/UserMessageRow.tsx`, `src/renderer/components/chat/MessageItem.tsx`

## 2026-04-15 11:10 GST (Dubai)

### Notifications: Full UX overhaul — title, body, sound, errors, permissions, debounce

Rewrote the notification system end-to-end. Notification title now shows the task name instead of "Kirodex" (macOS already shows the app name). Body includes a status prefix (✓ Done / ⚠ Error / ⏳ Waiting for approval) plus a content preview with proper markdown stripping. Added notifications for agent errors and permission requests (not only turn_end). Wired the existing `playNotificationSound()` and `sound_notifications` backend field to a new Settings toggle. Replaced the single `lastNotifiedTaskId` with a `notifiedTaskIds` queue so multiple backgrounded notifications don't overwrite each other. Added 3-second per-task debouncing to prevent notification stacking from rapid turn ends.

**Modified:** `src/renderer/types/index.ts`, `src/renderer/lib/notifications.ts` (new), `src/renderer/stores/taskStore.ts`, `src/renderer/App.tsx`, `src/renderer/components/settings/SettingsPanel.tsx`

## 2026-04-15 11:06 GST (Dubai)

### Chat: Make FileMentionPill remove button visible with background

The X button on file mention pills was nearly invisible because it had no background and faint text color (`text-current/40`). Added `bg-muted/80` background and bumped icon color to `text-foreground/50`, with a `hover:bg-destructive/20` hover state so text no longer bleeds through behind it.

**Modified:** `src/renderer/components/chat/FileMentionPicker.tsx`

## 2026-04-15 11:04 GST (Dubai)

### Chat: Set ChatInput textarea font size to 14px

Added `text-sm` to the textarea in `ChatInput.tsx` so the input text renders at 14px instead of the default 16px.

**Modified:** `src/renderer/components/chat/ChatInput.tsx`

## 2026-04-15 11:04 GST (Dubai)

### Chat: Update DragOverlay subtitle text size to 14px

Changed the "Images, code, documents" subtitle in the drag-and-drop overlay from `text-[11px]` to `text-sm` (14px) to match the main "Drop files here" label size.

**Modified:** `src/renderer/components/chat/DragOverlay.tsx`

## 2026-04-15 10:59 GST (Dubai)

### Chat: Combine completion report card with changed files summary

When a message has both a completion report and changed files, the report now renders as a header inside the `ChangedFilesSummary` card instead of as a separate `TaskCompletionCard`. Added `report` field to `ChangedFilesRow` (populated during timeline derivation) and `hasChangedFiles` flag to `AssistantTextRow` so it skips the standalone card when the combined view handles it. The raw report JSON is always stripped from the markdown content.

**Modified:**
- `src/renderer/lib/timeline.ts`
- `src/renderer/components/chat/ChangedFilesSummary.tsx`
- `src/renderer/components/chat/AssistantTextRow.tsx`

## 2026-04-15 10:52 GST (Dubai)

### Chat: Render completion report card for summary JSON blocks

Extended `parseReport`/`stripReport` in `TaskCompletionCard.tsx` to detect three formats: `kirodex-report` fences, `json` fences, and bare JSON objects with `status`/`summary` fields. Wired the card into `AssistantTextRow` so it renders after the markdown content. Removed the word "JSON" from the settings page description.

**Modified:**
- `src/renderer/components/chat/TaskCompletionCard.tsx`
- `src/renderer/components/chat/AssistantTextRow.tsx`
- `src/renderer/components/settings/SettingsPanel.tsx`

## 2026-04-15 10:52 GST (Dubai)

### Chat: Fix floating panel background with hardcoded CSS (third attempt)

Tailwind v4's CSS variable chain (`bg-card` → `var(--color-card)` → `var(--card)`) doesn't resolve to an opaque background in Tauri's WebKit webview for light mode. Added a `.floating-panel` CSS class in `tailwind.css` with hardcoded `background-color` and `color` values using `!important` for both light (`#fafafa`/`#1a1a1a`) and dark (`#141414`/`#f0f0f0`) modes. Applied the class to all floating panel containers.

**Modified:**
- `src/tailwind.css`
- `src/renderer/components/chat/SlashPanels.tsx`
- `src/renderer/components/chat/FileMentionPicker.tsx`
- `src/renderer/components/chat/SlashCommandPicker.tsx`

## 2026-04-15 10:48 GST (Dubai)

### Chat: Fix floating panel background in light mode (second attempt)

The `bg-popover` Tailwind class was not rendering an opaque background in the Tauri WebKit webview for light mode, causing mention/slash/action panels to appear transparent. Replaced `bg-popover` with `bg-card` (which is proven to work since the chat input card container uses it) in all floating panel components. Also reverted the `--popover` CSS variable back to `#ffffff`.

**Modified:**
- `src/tailwind.css`
- `src/renderer/components/chat/SlashPanels.tsx`
- `src/renderer/components/chat/FileMentionPicker.tsx`
- `src/renderer/components/chat/SlashCommandPicker.tsx`

## 2026-04-15 10:46 GST (Dubai)

### ChatInput toolbar: Increase font size from 11px to 14px

Bumped the font size of all four chat input toolbar trigger buttons (Plan, Model, Full Access/Ask, Git branch) from `text-[11px]` to `text-[14px]` for better readability.

**Modified:** src/renderer/components/chat/PlanToggle.tsx, src/renderer/components/chat/ModelPicker.tsx, src/renderer/components/chat/AutoApproveToggle.tsx, src/renderer/components/chat/BranchSelector.tsx

## 2026-04-15 11:00 GST (Dubai)

### QuestionCards: Fix keyboard shortcuts intercepting chat input keystrokes

The `useEffect` keydown handler in `QuestionCards.tsx` was attached to `window`, so it captured arrow keys, letter keys (a-z for option selection), Enter, and Escape globally, even when the user was typing in the chat input textarea. Added an early return guard that checks if the event target is an `INPUT`, `TEXTAREA`, or `contentEditable` element and skips all shortcut processing when it is.

**Modified:** src/renderer/components/chat/QuestionCards.tsx

## 2026-04-15 10:55 GST (Dubai)

### ModelPicker: Add provider-specific icons for each model

Created a model icon mapping utility (`model-icons.tsx`) that detects the provider from a model ID or name string (Anthropic, OpenAI, Amazon, Meta, Google, Mistral, Cohere, AI21, DeepSeek, Kiro) and returns a brand-colored inline SVG icon. Integrated these icons into the ModelPicker trigger button (replacing the generic sparkle icon) and the dropdown list (replacing the dot indicators).

**Modified:** src/renderer/lib/model-icons.tsx, src/renderer/components/chat/ModelPicker.tsx

## 2026-04-15 10:42 GST (Dubai)

### Settings: Add Cmd+L and Cmd+F to keyboard shortcuts list

Added "Focus chat input" (⌘/Ctrl+L) and "Search messages" (⌘/Ctrl+F) to the KEYMAP array in SettingsPanel. Both entries use the existing `MOD` constant so they display correctly on macOS, Windows, and Linux.

**Modified:** src/renderer/components/settings/SettingsPanel.tsx

## 2026-04-15 10:37 GST (Dubai)

### Chat: Fix yellow highlighter inside nested markdown elements

Made `wrapChildrenWithHighlight` recursive so it walks into nested React elements (strong, em, a, code, etc.) and wraps every string leaf with `HighlightText`. Previously it only handled direct string children, so text inside `<strong>`, `<em>`, `<a>`, and other inline tags was missed. Also added heading (h1-h6), blockquote, strong, and em overrides to the ReactMarkdown components config for completeness.

**Modified:**
- `src/renderer/components/chat/ChatMarkdown.tsx`

## 2026-04-15 10:30 GST (Dubai)

### Performance: Full audit of all changed files in git status

Conducted a comprehensive performance audit of 40+ changed files across the Rust backend (acp.rs, settings.rs) and React frontend (stores, hooks, components, libs). Identified 14 HIGH, 32 MEDIUM, and 20+ LOW severity issues. Key findings: serialize-then-navigate pattern in ACP hot path, full task cloning on emit, blocking fs ops in async, conditional hook violation, ChatMarkdown useMemo over-dependency, deriveTimeline creating new refs every call, persistHistory not debounced, SettingsPanel subscribing to entire store, and memory leaks in archived task streaming records.

**Modified:** activity.md (audit report only, no code changes)

# Activity Log

## 2026-04-15T10:31 (Dubai, GMT+4)

**Task:** Rust backend performance audit for Kirodex Tauri app
**Files audited:**
- `src-tauri/src/commands/acp.rs`
- `src-tauri/src/commands/settings.rs`

**Action:** Full read of both files, identified performance issues across eight categories (allocations, lock contention, string ops, error short-circuits, serde overhead, thread safety, blocking on async, memory/resource cleanup). Produced detailed audit with severity ratings.

## 2026-04-15 10:31 GST (Dubai) — Performance Audit: Remaining Components (Batch 2)

**Task:** Audited 15 React/TypeScript frontend files for performance issues.

**Files audited:**
1. SlashPanels.tsx
2. SlashCommandPicker.tsx
3. FileMentionPicker.tsx
4. InlineDiff.tsx
5. HighlightText.tsx
6. SearchBar.tsx
7. TaskSidebar.tsx
8. KiroConfigPanel.tsx
9. SettingsPanel.tsx
10. ThemeSelector.tsx
11. DiffPanel.tsx
12. DiffViewer.tsx (code/)
13. AppHeader.tsx
14. Onboarding.tsx
15. skeleton.tsx

**Findings:**
- 3 HIGH severity issues (FileMentionPicker unmemoized fuzzy scoring, SettingsPanel full-store subscription)
- 16 MEDIUM severity issues (missing useMemo/useCallback, stale closures, DOM queries in render, inline functions breaking memo)
- 10+ LOW severity issues (minor memoization gaps, index-as-key in static lists)
- SearchBar.tsx and skeleton.tsx had no significant issues
