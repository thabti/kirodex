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
