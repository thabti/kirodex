## 2026-04-13 09:15 GST (Dubai)

### Analytics: Opt-in PostHog + Homebrew download snapshots

Added a privacy-forward, opt-in analytics pipeline (PostHog) covering feature usage, the auto-update funnel (check → available → downloaded → installed → dismissed), version spread, and settings changes. Events carry only enumerations and never prompts, file paths, or commit messages; the client is gated by both a build-time `VITE_POSTHOG_API_KEY` and a user-facing opt-in in Settings → Advanced → Privacy. Added a scheduled workflow that snapshots GitHub Releases asset downloads and Homebrew cask install counts into the `analytics-data` branch for a free historical distribution dashboard.

**Modified:** src-tauri/tauri.conf.json, src-tauri/src/commands/settings.rs, src/renderer/types/index.ts, src/renderer/lib/analytics.ts (new), src/renderer/App.tsx, src/renderer/hooks/useUpdateChecker.ts, src/renderer/hooks/useSlashAction.ts, src/renderer/stores/updateStore.ts, src/renderer/stores/taskStore.ts, src/renderer/stores/settingsStore.ts, src/renderer/components/settings/SettingsPanel.tsx, package.json, .github/workflows/release.yml, .github/workflows/analytics-snapshot.yml (new)

## 2026-04-12 23:45 GST (Dubai)

### Build: Fix icon.png RGBA format for Tauri compilation

The app icon at `src-tauri/icons/icon.png` was in RGB format (no alpha channel), causing `tauri::generate_context!()` to panic with "icon is not RGBA". Converted the icon to RGBA (PNG color-type 6) using ImageMagick. Build now compiles successfully.

**Modified:** src-tauri/icons/icon.png
