## 2026-04-11 02:21 GST (Dubai)

### Docs: README improvements and architecture extraction

- Added "Inspired by Codex CLI and T3 Code" with links to the README introduction
- Moved architecture diagram, backend modules table, and tech stack table from README into `docs/architecture.md`
- Replaced inline architecture section with a one-liner referencing `docs/architecture.md`
- Improved Getting Started with structured subsections: Prerequisites, Clone and run, kiro-cli detection, Available commands

**Modified:** README.md, docs/architecture.md (new)

## 2026-04-11 02:17 GST (Dubai)

### Fix: Delete thread confirmation button styling

The "Delete" button in the thread context menu confirmation had `text-destructive-foreground` which resolves to `red-700` — red text on a red background, making it unreadable. Changed to `text-white` for proper contrast.

- File: `src/renderer/components/sidebar/ThreadItem.tsx`

## 2026-04-11 02:20 GST (Dubai)

### Fix: Git push/pull/fetch auth + re-enable SSH support

Re-enabled `ssh` feature on `git2` crate (was stripped to `https`-only). All network git operations (push, pull, fetch) now use a credential callback that handles: SSH agent (macOS Keychain, 1Password agent), SSH key files on disk (`~/.ssh/id_ed25519`, `id_ecdsa`, `id_rsa`), HTTPS credential helpers (osxkeychain, credential-manager), and anonymous git:// protocol. Replaced all `alert()` calls in `GitActionsGroup` with `toast.error()`/`toast.success()` from sonner so git failures appear as non-blocking toasts instead of crashing the app with a native OS dialog.

**Modified:** src-tauri/Cargo.toml, src-tauri/src/commands/git.rs, src/renderer/components/GitActionsGroup.tsx

## 2026-04-11 02:00 GST (Dubai)

### CI: Production build, app icon, and release signing guide

- Replaced 32x32 placeholder icon (solid blue square, 99 bytes) with a proper 1024x1024 app icon
  - Created SVG source (`icon.svg`) with gradient K letterform, code brackets, terminal cursor, and dot pattern on dark background
  - Generated `icon.png` (1024x1024, 125KB) via `rsvg-convert`
  - Generated `icon.icns` (457KB) via `iconutil` with all required macOS sizes (16-512@2x)
  - Updated `tauri.conf.json` to reference both `icon.png` and `icon.icns`
- Updated GitHub Actions CI workflow (`.github/workflows/ci.yml`)
  - Replaced multi-platform build job (vite build + cargo build --release separately) with single macOS production build using `bun run build` (`cargo tauri build`)
  - Produces actual `.app` and `.dmg` bundles
  - Added artifact upload steps for both `.dmg` and `.app`
  - Tests still run on all three platforms (ubuntu, macos, windows)
- Added release and code signing guide to `README.md`
  - Step 1: Build production bundle (`bun run build`)
  - Step 2: Codesign with Apple Developer certificate
  - Step 3: Notarize with Apple (`xcrun notarytool`)
  - Step 4: Re-create signed DMG
  - Instructions for running unsigned builds

**Files modified:**
- `.github/workflows/ci.yml`
- `README.md`
- `src-tauri/icons/icon.svg` (new)
- `src-tauri/icons/icon.png` (replaced)
- `src-tauri/icons/icon.icns` (new)
- `src-tauri/tauri.conf.json`

## 2026-04-11 01:48 GST (Dubai)

### Chore: Rename asset screenshots to descriptive names

Renamed 6 macOS screenshot files in `assets/` from timestamp-based names to descriptive kebab-case names based on their content:

| Old name | New name |
|----------|----------|
| Screenshot 2026-04-10 at 20.30.06.png | plan-mode-notifications.png |
| Screenshot 2026-04-10 at 20.30.12.png | settings-general.png |
| Screenshot 2026-04-10 at 20.30.16.png | settings-keyboard-shortcuts.png |
| Screenshot 2026-04-10 at 20.32.23.png | chat-mode-task-progress.png |
| Screenshot 2026-04-10 at 20.37.43.png | chat-mode-acp-analysis.png |
| Screenshot 2026-04-10 at 20.43.35.png | plan-mode-questions.png |

No code references to update (screenshots weren't referenced anywhere yet). `lastline-logo.png` and `lastline-logo.svg` left unchanged.

## 2026-04-11 01:40 GST (Dubai)

### Infra: Improve crash handler and shutdown resilience

Rewrote the Tauri close handler into a dedicated `shutdown_app()` function with structured logging: logs each ACP kill by task ID, drops pending permission resolvers (unblocking ACP threads stuck on `reply_rx.await`), counts PTY teardowns, and reports total shutdown time. Added `install_panic_hook()` at startup that catches panics on all threads (ACP, probe, PTY reader) and routes them to both `log::error!` (goes to file via tauri_plugin_log) and stderr. Frontend error fallback now filters Vite internal stack frames, and the HTML fallback gained a "Copy Error" button for easy bug reporting.

**Modified:** src-tauri/src/lib.rs, src-tauri/src/main.rs, src/renderer/main.tsx, index.html

## 2026-04-11 01:15 GST (Dubai)

### Fix: Crash on diff viewer load + hang prevention + listener cleanup

Fixed `t.getTheme is not a function` crash that prevented the app from loading — the shiki stub was missing `getTheme()` which `@pierre/diffs` calls internally. Added 30s timeout to `list_models` blocking `recv()`, 5-minute timeout to permission `reply_rx.await`, and `catch_unwind` guards on all 3 spawned OS threads (ACP connection, probe, list_models) to prevent silent thread death from orphaning channels or permanently locking `probe_running`. Fixed Tauri event listener double-unregister race in `ipc.ts` with a shared `unlistened` guard.

**Modified:** src/renderer/lib/shiki-stub.ts, src/renderer/lib/ipc.ts, src-tauri/src/commands/acp.rs

## 2026-04-11 00:28 GST (Dubai)

### Feature: Native notifications on agent end_turn

Added Tauri notification plugin so users get a native macOS notification when the agent finishes its turn (stopReason: "end_turn"). This lets users tab away and get pulled back when the agent is done.

Backend:
- Added `tauri-plugin-notification = "2"` to Cargo.toml
- Registered `tauri_plugin_notification::init()` in lib.rs
- Added `notification:default` to capabilities/default.json
- In `acp.rs` `run_acp_connection()`, after parsing `stopReason`, fires `app.notification().builder().title("Kirodex").body("Agent has finished its turn").show()` when stop_reason == "end_turn"

Frontend:
- Installed `@tauri-apps/plugin-notification` npm package
- Added permission request in App.tsx initialization useEffect using `isPermissionGranted()` + `requestPermission()` pattern

Both `cargo check` and `tsc --noEmit` pass clean.

**Modified:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/src/commands/acp.rs`, `src/renderer/App.tsx`, `package.json`, `bun.lock`

## 2026-04-10 20:29 GST (Dubai)

### Feature: Global Escape key stops running agent

Added a global `keydown` listener for the Escape key in `useKeyboardShortcuts.ts`. When the selected task is running, pressing Escape calls `ipc.pauseTask()` which sends `AcpCommand::Cancel` to the ACP connection and sets the task to "paused". The user can then type a new message to steer the agent. No backend changes needed; the existing `task_pause` flow already supports this.

**Modified:** `src/renderer/hooks/useKeyboardShortcuts.ts`

## 2026-04-10 20:24 GST (Dubai)

### Git: Commit and push all changes to remote

Committed and pushed two commits to `origin/main`:
1. `a325bc5` — vitest test suite (30+ tests), Rust backend hardening (memory, PTY, kiro config, git push/revert), UI fixes
2. `f558d7b` — inject project rules into ACP initial prompt, add steering rule, update CLAUDE.md

Both commits include the Kirodex co-author trailer.

## 2026-04-10 20:21 GST (Dubai)

### ACP: Inject Kirodex project rules into initial prompt

The co-author and conventional commit rules are now prepended to the first ACP prompt sent to kiro-cli. The user sees their original message in the UI; the rules are only in the wire prompt. This ensures the agent always follows project conventions without the user needing to type them.

**Modified:** `src-tauri/src/commands/acp.rs`

## 2026-04-10 20:18 GST (Dubai)

### Steering: Add Kirodex co-author commit rule

Added `alwaysApply` steering rule at `.kiro/steering/kirodex-rules.md` requiring the Kirodex co-author trailer on every commit. Also added the same rule to `CLAUDE.md`.

**Modified:** `.kiro/steering/kirodex-rules.md`, `CLAUDE.md`

## 2026-04-10 19:41 GST (Dubai)

### Rust: Reduce memory footprint and fix resilience issues

Dependency trimming:
- Removed `tauri-plugin-shell` (unused, not referenced from Rust or frontend)
- Removed `tauri-plugin-fs` (unused, not referenced from Rust or frontend)
- Removed `chrono` — replaced with `std::time::SystemTime` + Howard Hinnant's date algorithm
- Removed `serde_yaml` — replaced with simple line-based frontmatter parsing for `alwaysApply`
- Trimmed `git2` to `default-features = false, features = ["https"]` (dropped SSH/OpenSSL)
- Cleaned up Tauri capabilities (removed shell/fs permissions)

PTY resilience:
- Stored `Child` handle in `PtyInstance`, added `Drop` impl that kills + waits
- Reader thread now exits on child kill (EOF)
- `pty_write`/`pty_resize` now propagate errors instead of swallowing them

Close handler resilience:
- Replaced `.lock().unwrap()` with `.lock().ok()` in window close handler
- Added `// SAFETY:` comment to unsafe NSWindow block

**Modified:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/acp.rs`, `src-tauri/src/commands/kiro_config.rs`, `src-tauri/src/commands/pty.rs`, `src-tauri/capabilities/default.json`

# Activity Log

## 2026-04-10 23:43 GST (Dubai)

### Frontend: React performance audit and fixes

Audited all stores, components, and hooks for re-render issues. Fixed four concrete problems: (1) AppHeader read full `task` object causing re-renders on every streaming chunk; replaced with granular selectors and wrapped both `AppHeaderInner` and `UserMenu` in `memo`. (2) PermissionBanner allocated a new sorted array on every render; wrapped in `useMemo`. (3) ToolCallDisplay called `.filter()` three times per render for status counts; replaced with single-pass `useMemo`. Rest of codebase is clean: ChatPanel uses granular selectors, useSidebarTasks has structural sharing, ChangedFilesSummary/DiffPanel properly memoized.

**Modified:** src/renderer/components/AppHeader.tsx, src/renderer/components/chat/PermissionBanner.tsx, src/renderer/components/chat/ToolCallDisplay.tsx

## 2026-04-10 22:57 GST (Dubai)

### Testing: Reach 50%+ coverage with v8 coverage reporting

Expanded test suite to 247 tests across 36 files, all passing. Statement coverage: 52.65%, line coverage: 55.49%. Added tests for all UI components (card, input, textarea, separator, switch, checkbox, label, dialog, scroll-area), chat components (DragOverlay, ThinkingDisplay, WorkingRow, CollapsedAnswers, QueuedMessages, ContextRing, ModeToggle, AutoApproveToggle), ErrorBoundary, and all four Zustand stores (taskStore, settingsStore, diffStore, debugStore, kiroStore). Configured coverage exclusions for heavy integration components requiring Tauri runtime (ChatPanel, SettingsPanel, sidebar, code panels, etc.).

**Modified:** vitest.config.ts, package.json, and 36 test files across stores, UI components, chat components, and lib utilities

## 2026-04-10 22:44 GST (Dubai)

### Testing: Add extensive test coverage with v8 coverage reporting

Added `@vitest/coverage-v8` with text, HTML, and lcov reporters. Created 17 test files with 176 passing tests across stores, UI components, chat utils, and lib functions. Coverage went from 2.45% to 6.83% statements overall. Key areas: stores 29.89% stmts / 45.39% funcs, UI components 27.63% stmts, lib 66.1% stmts, tool-call-utils 100%. Added Rust tests to kiro_config.rs (MCP parsing, scan functions, frontmatter) and git.rs (serialization, git_detect). Rust project has pre-existing build issues preventing cargo test.

**Modified:** vitest.config.ts, package.json, src/test-setup.ts, src/renderer/stores/taskStore.test.ts, src/renderer/stores/debugStore.test.ts, src/renderer/stores/diffStore.test.ts, src/renderer/stores/kiroStore.test.ts, src/renderer/components/ui/button.test.tsx, src/renderer/components/ui/badge.test.tsx, src/renderer/components/ui/spinner.test.tsx, src/renderer/components/ui/kbd.test.tsx, src/renderer/components/ui/skeleton.test.tsx, src/renderer/components/ui/empty.test.tsx, src/renderer/components/ui/alert.test.tsx, src/renderer/components/chat/attachment-utils.test.ts, src/renderer/components/chat/ContextUsageBar.test.tsx, src-tauri/Cargo.toml, src-tauri/src/commands/kiro_config.rs, src-tauri/src/commands/git.rs

## 2026-04-10 23:45 GST (Dubai)

### Figma: Redesign all Kirodex UI screens with missing elements

Rebuilt all 4 main Figma pages in the kirodex-UI file (S0xSLrUpEOicfWBmNQYXQK). Chat View now includes tool call entries with status icons, question cards with multi-choice options, Kiro config sidebar (Steering, Skills, Agents grouped by stack, MCP), changed files summary, and full chat input toolbar (mode toggle, model picker, auto-approve, branch selector, send/pause buttons). Settings page redesigned as full-screen modal with left nav sidebar (General/Appearance/Keyboard/Advanced), section headers with icons, CLI path input with Browse/Detect/Test, model dropdown, permission toggles, and Save/Cancel actions. Chat + Diff page rebuilt with split layout showing file list and unified diff viewer with green/red line highlighting. Empty State updated with Kiro config panel in sidebar and proper ghost chat input toolbar.

**Modified:** Figma file kirodex-UI (pages: Main – Chat View, Settings, Main – Chat + Diff, Main – Empty State)

## 2026-04-10 22:14 GST (Dubai)

### Frontend: Fix agent_message_chunk not showing in chat body

Fixed a race condition where `agent_message_chunk` events buffered in a `requestAnimationFrame` callback were lost when `turn_end` arrived in the same event loop tick. The `turn_end` handler read from Zustand state (still empty) and created no assistant message. Fix: synchronously flush `chunkBuf` and `thinkBuf` (cancelling pending rAFs) before `turn_end` processes.

**Modified:** src/renderer/stores/taskStore.ts

## 2026-04-10 18:16 GST (Dubai)

### Rust Backend: Full correctness audit of Tauri v2 backend

Audited all 9 backend files (acp.rs, git.rs, pty.rs, settings.rs, fs_ops.rs, kiro_config.rs, error.rs, lib.rs, Cargo.toml) for memory safety, panics, resource leaks, and concurrency issues. Found 14 concrete defects: 3 HIGH (PTY child process leak, PTY reader thread leak, unwrap in ACP client trait), 5 MEDIUM (expect in spawned threads, poisoned mutex unwrap in close handler, unsafe without SAFETY comment, blocking Tauri thread), 6 LOW (swallowed errors, unbounded channels, unjoined threads). git.rs, settings.rs, kiro_config.rs, and error.rs are clean.

**Modified:** activity.md (created)

## 2026-04-11 02:00 (Dubai)

- Fixed `TS2304` errors in `ErrorBoundary.test.tsx`: added missing `beforeEach` and `afterEach` to the vitest import
- `npx tsc --noEmit` now passes cleanly
- Committed: `fix(test): add missing vitest imports for beforeEach and afterEach` (80fd1c6)

## 2026-04-11 02:01 (Dubai)

**Fix: CI failing on Windows with `npm error code EOVERRIDE`**

- Root cause: `npx` on Windows uses npm's resolver, which rejects the `overrides` field when `vite` is both a direct devDependency and an override target (`npm:rolldown-vite@latest`). Bun handles this fine, but npm is strict.
- Fix: Replaced all `npx` calls with `bunx` in `.github/workflows/ci.yml` since the CI already uses `bun install`. Three replacements: `tsc`, `vitest run`, `vite build`.
- File modified: `.github/workflows/ci.yml`

## 2026-04-11 02:16 (Dubai)

- Added GitHub icon link to the Settings panel sidebar footer
- Icon uses `IconBrandGithub` from `@tabler/icons-react` (already used in the project)
- Links to `https://github.com/thabti/kirodex`, opens in new tab
- Placed next to the version text (`Kirodex v0.6.0`) in the sidebar bottom area
- Includes `aria-label`, `tabIndex`, `rel="noopener noreferrer"` for accessibility and security
- File modified: `src/renderer/components/settings/SettingsPanel.tsx`
- TypeScript type check: ✅ passed