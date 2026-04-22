# CLAUDE.md — Kirodex

## Project overview

Kirodex is a native macOS desktop app for managing AI coding agents via the Agent Client Protocol (ACP). It features a chat interface, task management, diff viewer, integrated terminal, git operations, and a settings panel. Built with Tauri v2 (Rust backend) and React 19 (TypeScript frontend).

## Tech stack

- **Desktop framework**: Tauri v2 (Rust backend, WebView frontend)
- **Backend**: Rust 2021 edition
- **Frontend**: React 19, TypeScript 5, Vite 6
- **Styling**: Tailwind CSS 4 (utility-first, dark theme)
- **UI components**: Radix UI primitives, Tabler icons (`@tabler/icons-react`)
- **State management**: Zustand 5 (stores in `src/renderer/stores/`)
- **Markdown**: react-markdown + remark-gfm
- **Virtualization**: @tanstack/react-virtual
- **Diffing**: diff + @pierre/diffs
- **Terminal**: xterm + @xterm/addon-fit + portable-pty (Rust)
- **Code highlighting**: Shiki
- **Build**: Vite (renderer), Cargo (Rust backend), bun as package manager
- **Protocol**: agent-client-protocol crate for ACP subprocess management
- **Rust crates**: git2 (libgit2 bindings), thiserror (error types), which (binary detection), serde_yaml (YAML parsing), confy (config persistence)

## Project structure

```
src/
├── renderer/                # React frontend
│   ├── main.tsx             # React entry
│   ├── App.tsx              # Root layout
│   ├── types/index.ts       # Shared types (TaskStatus, AgentTask, etc.)
│   ├── lib/
│   │   ├── ipc.ts           # Tauri invoke/listen wrappers
│   │   ├── timeline.ts      # Timeline rendering logic
│   │   └── utils.ts         # cn() helper
│   ├── hooks/
│   │   └── useSlashAction.ts # Client-side slash command handler
│   ├── stores/
│   │   ├── taskStore.ts     # Tasks, streaming, connection state
│   │   ├── settingsStore.ts # Agent profiles, models, appearance
│   │   ├── kiroStore.ts     # .kiro/ config state
│   │   ├── diffStore.ts     # Diff viewer state
│   │   └── debugStore.ts    # Debug panel state
│   └── components/
│       ├── ui/              # Radix-based primitives (button, input, dialog, etc.)
│       ├── chat/            # ChatPanel, MessageList, ChatInput, SlashPanels, etc.
│       ├── sidebar/         # TaskSidebar, KiroConfigPanel
│       ├── code/            # CodePanel, DiffViewer
│       ├── dashboard/       # Dashboard, TaskCard
│       ├── settings/        # SettingsPanel
│       ├── diff/            # DiffPanel
│       ├── debug/           # DebugPanel
│       ├── task/            # NewProjectSheet
│       ├── AppHeader.tsx
│       ├── ErrorBoundary.tsx
│       └── Playground.tsx
src-tauri/
├── src/
│   ├── main.rs              # Entry point
│   ├── lib.rs               # Tauri app setup, command registration, window events
│   └── commands/
│       ├── acp.rs           # ACP protocol (kiro-cli subprocess, ~42KB)
│       ├── error.rs         # Shared AppError type (thiserror)
│       ├── pty.rs           # Terminal emulation (portable-pty)
│       ├── git.rs           # Git operations via git2 (libgit2)
│       ├── settings.rs      # Config persistence via confy
│       ├── fs_ops.rs        # File ops, kiro-cli detection (which crate)
│       └── kiro_config.rs   # .kiro/ config discovery (serde_yaml for frontmatter)
├── Cargo.toml
├── tauri.conf.json
└── capabilities/            # Tauri v2 permission capabilities
```

## Commands

```bash
bun run dev           # Start dev (Vite + Tauri)
bun run build         # Production build (.app + .dmg)
bun run check:ts      # TypeScript type check
bun run check:rust    # Rust type check
bun run test:rust     # Run Rust tests
bun run clean         # Remove build artifacts
```

## Architecture decisions

- **Tauri IPC**: All frontend↔backend communication uses `invoke()` for commands and `listen()` for events. No direct Node.js APIs.
- **ACP on dedicated OS threads**: The ACP Rust SDK uses `!Send` futures, so each connection runs on a dedicated OS thread with a single-threaded tokio runtime + `LocalSet`. Communication with the Tauri async runtime happens via `mpsc` channels.
- **Permission handling**: Permission requests from ACP go through a `oneshot` channel. The permission handler runs on the Tauri async runtime and accesses managed state via `app.try_state::<AcpState>()`, not a cloned copy.
- **State**: Zustand stores are the single source of truth. No Redux, no Context for global state.
- **Styling**: Tailwind utility classes only. No custom CSS files for components. Theme tokens in `src/tailwind.css`.
- **Components**: Radix UI primitives with `class-variance-authority` for variants, `clsx` + `tailwind-merge` via `cn()` helper.
- **Path aliases**: `@/*` maps to `./src/renderer/*` (configured in tsconfig.json and vite.config.ts).

## Conventions

- Use `const` arrow functions for components and handlers
- Prefix event handlers with `handle` (e.g., `handleClick`, `handleKeyDown`)
- Prefix boolean variables with verbs (`isLoading`, `hasError`, `canSubmit`)
- Use kebab-case for file names, PascalCase for components, camelCase for variables/functions
- One export per file for components
- Early returns for readability
- Accessibility: semantic HTML, ARIA attributes, keyboard navigation
- Icons: use `@tabler/icons-react` exclusively. Never use `lucide-react`. Tabler icons use the `Icon` prefix (e.g., `IconPlus`, `IconCheck`, `IconChevronDown`).
- Conventional Commits for git messages (`feat:`, `fix:`, `chore:`, etc.)
- Every commit must include: `Co-authored-by: Kirodex <274876363+kirodex@users.noreply.github.com>`

## Build validation

A task is not done until both pass with zero errors:

```bash
bun run check:ts
bun run build         # or: npx vite build
```

## Critical rules

- Never revert, discard, or `git checkout --` changes without explicit user confirmation
- Never run destructive git operations without being told to
- Always use Tailwind classes for styling; no inline CSS or `<style>` tags
- Keep the activity log updated in `activity.md`

---

## Engineering learnings

### Tauri + ACP concurrency model

The `agent-client-protocol` crate produces `!Send` futures. You cannot run them on the default multi-threaded tokio runtime. The solution: spawn a `std::thread` per ACP connection, create a `tokio::runtime::Builder::new_current_thread()` runtime inside it, and use `tokio::task::LocalSet::block_on()`. Commands from the Tauri async runtime reach the connection thread via `mpsc::unbounded_channel`. This pattern is stable and avoids all `Send` bound issues.

### Permission resolvers must use managed Tauri state

Early versions cloned the `AcpState` into the permission handler closure. This created a second copy; when `task_allow_permission` / `task_deny_permission` commands looked up the resolver in the managed state, it wasn't there. Fix: the permission handler accesses state via `app.try_state::<AcpState>()` so it reads/writes the same instance the Tauri commands use.

### ACP notifications need method normalization

The ACP SDK sometimes prefixes ext_notification methods with an underscore (e.g., `_kiro.dev/commands/available`). Always strip the leading `_` before matching: `method.strip_prefix('_').unwrap_or(method)`.

### Backend task updates wipe client-side messages

The ACP backend sends `task_update` events with `messages: []` because it doesn't track message history; only the client does. If `upsertTask()` does a full object replacement, every status change wipes all locally-accumulated messages. Fix: preserve existing messages when the incoming task has an empty messages array.

### Zustand store performance patterns

- **Bail-out guards**: Every setter should check if the value actually changed before calling `set()`. Without this, every ACP event triggers a React re-render even when nothing changed.
- **Batch multi-field updates**: Use a single `setState` callback instead of multiple `getState()` + `set()` calls. Multiple `getState()` calls can read stale data between them.
- **rAF batching for high-frequency events**: Debug log entries and streaming chunks arrive at hundreds per second. Buffer them and flush once per `requestAnimationFrame` using `concat + slice` instead of per-entry array copies.
- **Extract streaming selectors**: The ChatPanel was re-rendering on every streaming token. Extracting a `StreamingMessageList` child component that owns the four streaming selectors (`streamingChunk`, `liveToolCalls`, `liveThinking`, `messages`) isolates re-renders to the child only.

### Dead code traps in component wiring

Adding logic to a component file that is never imported is a silent failure. The `DiffPanel.tsx` had `focusFile` logic but was dead code; the actual panel used `CodePanel` → `DiffViewer`. Always verify the import chain before adding features to a component.

### Slash commands: client-side vs pass-through

Some slash commands (`/clear`, `/model`, `/agent`) are handled entirely on the client. Others (`/plan`, `/chat`) need both a client-side action (mode switch, system message) and a backend sync (`ipc.setMode()`). The `useSlashAction` hook returns `{ handled: boolean }` so the caller knows whether to send the command to ACP.

### Forward all ACP notification data

The `commands/available` notification includes `mcpServers` with live `toolCount` and `status`, but the Rust backend initially only forwarded the `commands` array. Always forward the full notification payload (or at least all fields the frontend needs) rather than cherry-picking.

### Window cleanup on close

Tauri's `on_window_event` with `CloseRequested` is the place to kill ACP connections and PTY sessions. Drain the connections map and send `AcpCommand::Kill` to each, then clear the PTY state. Without this, orphaned `kiro-cli` processes survive after the app closes.

### probe_capabilities guard

`probe_capabilities` (which calls `list_models`) can be triggered multiple times during startup. Without an `AtomicBool` guard (`probe_running`), concurrent calls spawn duplicate ACP connections. Use `compare_exchange` to ensure only one probe runs at a time.

### Vite watch ignores

Add `README.md`, `activity.md`, and `src-tauri/**` to Vite's `server.watch.ignored` list. Otherwise, editing docs or Rust files triggers unnecessary frontend rebuilds.

### Tauri v2 state management

Always use `app.manage()` for shared state and access via `State<'_, T>` in commands. Never clone state into closures when the state needs to be shared across commands; use `app.try_state::<T>()` from the app handle instead.

### Rust error handling in Tauri commands

Tauri commands return `Result<T, AppError>` where `AppError` is a `thiserror` enum in `commands/error.rs`. It has `From` impls for `git2::Error`, `io::Error`, `serde_json::Error`, `confy::ConfyError`, and `PoisonError`, so `?` works directly. `AppError` implements `Serialize` for Tauri IPC. Exception: `acp.rs` still uses `Result<T, String>` because the ACP SDK's own error types and `!Send` async constraints make conversion impractical.

### Prefer community crates over shelling out

Use `git2` instead of `Command::new("git")` for git operations. Use `which::which()` instead of `Command::new("which")`. Use `confy` instead of hand-rolled JSON persistence. Use `serde_yaml` instead of string matching for YAML frontmatter. Shelling out is fragile (PATH dependency), slow (process spawn), and loses structured error info.

### React 19 + Zustand selector discipline

Always use selectors (`useStore(s => s.field)`) instead of `useStore()` to prevent full-store re-renders. For derived state, use `useMemo` over computing in render. Combine with `shallow` equality when selecting multiple fields.

### localStorage in Zustand store init

`localStorage.getItem()` and `setItem()` throw in private browsing, incognito, or quota-exceeded contexts. Always wrap in try-catch. For store init, use an IIFE: `(() => { try { return localStorage.getItem(key) } catch { return null } })()`. For setters, wrap in try-catch with `console.warn` fallback so the in-memory state still updates even if persistence fails.

### Module-level mutable variables in React hooks

A `let pendingUpdate` at module scope persists across component remounts and can reference a stale object from a previous mount. Use `useRef` instead to tie the mutable reference to the component instance lifecycle. This prevents version mismatches when the hook unmounts and remounts.

### import type for dynamically-imported modules

When a module is dynamically imported at runtime (`await import('@tauri-apps/plugin-updater')`) but you need its types at compile time for a `useRef<Update | null>`, use `import type { Update }` to avoid bundling the module eagerly while still getting type safety.

### IPC event cleanup

Always return the unlisten function from `listen()` calls inside `useEffect` cleanup. Leaked listeners cause memory leaks and duplicate event handling. Pattern: `const unlisten = await listen(...); return () => { unlisten(); };`

### PTY process lifecycle

Always kill PTY child processes on window close and on connection teardown. Check `child.try_wait()` before sending signals to avoid signaling already-dead processes. Clean up the reader thread when the PTY is destroyed.

### Git command injection prevention

When building git commands from user input (branch names, commit messages), validate and sanitize inputs. Never interpolate raw user strings into shell commands. Use `Command::arg()` instead of shell string concatenation to avoid injection. With `git2`, this is no longer a concern since the library API handles escaping.

### Tauri CSP blocks inline scripts

Tauri's CSP (`script-src 'self'`) blocks inline `onclick` handlers and `<script>` tags in HTML. Attach event listeners via bundled JS (`addEventListener`) instead. The `index.html` error fallback reload button must use this pattern.

### oklch() CSS colors fail in older WebKit

Tauri's WebKit webview may not support `oklch()` color syntax. When it fails, the browser renders bright magenta/pink (the "invalid value" fallback). Use hex color values for CSS custom properties instead.

### Dark theme class must be applied before React renders

If the app uses a `.dark` CSS class for theme variables, add `class="dark"` to `<html>` in `index.html` AND set it in `main.tsx` before `ReactDOM.createRoot()`. Without both, there's a white flash or the app renders in light mode.

### Splash screen pattern for Tauri

Add a `#splash` div in `index.html` (pure HTML/CSS, no JS dependency) that shows immediately when the window opens. In `main.tsx`, after React renders, fade it out with `opacity: 0` transition and remove on `transitionend`. This gives instant visual feedback while the JS bundle loads.

### Cancel tasks before deleting them

When deleting a thread or removing a project, call `ipc.cancelTask()` before `ipc.deleteTask()` to stop any running agent. The cancel is fire-and-forget with `.catch(() => {})` so it's a no-op for already-stopped tasks.

### confy changes the config file location

`confy` stores config at its own XDG/macOS-standard path (e.g., `~/Library/Application Support/rs.kirodex/default-config.toml` on macOS), not the previous custom path. If migrating from hand-rolled persistence, existing settings at the old path won't be found. Consider a one-time migration or document the new location.

### LazyStore autoSave creates a self-write race

`tauri-plugin-store`'s `LazyStore` with `autoSave: 500` fires `onKeyChange` for same-window writes 500ms after `store.set()`. If `subscribeToChanges` triggers `loadTasks` on every `onKeyChange`, the window reloads its own writes, overwriting in-flight state. Fix: maintain a `_selfWriteCount` counter in `history-store.ts`. Increment before `store.set()`, decrement 600ms later (past the autoSave window). Check `isSelfWriting()` in the `subscribeToChanges` handler to skip self-triggered reloads.

### Every state-changing action must call persistHistory

Any Zustand action that modifies persisted data (`tasks`, `projects`, `softDeleted`, `projectIds`) must call `persistHistory()` after `set()`. Missing calls cause data loss on crash or reload. Audit checklist: `createDraftThread`, `updateCompactionStatus`, `reorderProject`, `renameTask`, `forkTask`, `removeProject`, `archiveThreads`, `softDeleteTask`, `restoreTask`, `permanentlyDeleteTask`, `resolveWorktreeCleanup`, `addProject` (conditional).

### Silent .catch(() => {}) hides persistence failures

Fire-and-forget `.catch(() => {})` on `persistHistory` calls silently swallows write errors. The user sees no indication that their data wasn't saved. Replace with `.catch((err) => console.warn(...))` so failures appear in the debug log. This applies to `saveThreads`, `saveSoftDeleted`, and any other async persistence call.

### Ack-based flush beats sleep-based flush on quit

The Rust quit handler originally used `sleep(300ms)` / `sleep(500ms)` to wait for the frontend to flush state. This is unreliable: slow machines miss the window, fast machines waste time. Replace with an ack-based protocol: Rust emits `app://flush-before-quit`, frontend flushes and emits `app://flush-ack`, Rust waits on an `mpsc::channel` with a 2-second timeout. This guarantees the flush completes or times out gracefully.

### Arrow function store actions can't have side effects

Zustand store actions defined as `action: (args) => set(...)` (arrow returning `set()`) can't call `persistHistory()` after the `set()`. Convert to `action: (args) => { set(...); get().persistHistory() }` when side effects are needed. Watch for this when adding persistence to existing actions.

## Activity log

After completing any task, update `activity.md` at the project root before finishing.

Each entry must include:
- A timestamp heading in Dubai time: `## YYYY-MM-DD HH:MM GST (Dubai)`
- A short descriptive title: `### Component: What changed`
- A one to three sentence summary of what was done
- A `**Modified:**` line listing changed files

Prepend new entries to the top of the file. Create the file if it doesn't exist.
