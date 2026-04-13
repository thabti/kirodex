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
