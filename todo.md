# Kirodex TODO

Native macOS desktop client for Kiro CLI AI coding agents. Tauri v2 (Rust) + React 19 (TypeScript).

## Current state (2026-04-10)

- Version: 0.6.0
- Working features: ACP chat, task management, git ops (git2), PTY terminal, settings, diff viewer, slash commands, file mentions, conversation history persistence, keyboard shortcuts
- Uncommitted work: keyboard shortcuts hook, PTY/settings backend tweaks, onboarding improvements, terminal drawer, error boundary updates, chat panel refinements

## Completed tasks

- [x] Core ACP integration (kiro-cli subprocess on dedicated OS threads)
- [x] Chat interface with slash commands, model picker, file mentions
- [x] Git operations via git2 (branch, stage, commit, push, revert, diff)
- [x] Integrated PTY terminal (xterm.js + portable-pty)
- [x] Settings panel with confy persistence
- [x] Diff viewer (inline + side-by-side via @pierre/diffs + Shiki)
- [x] .kiro/ config discovery (agents, skills, steering, MCP servers)
- [x] Zustand stores for state management
- [x] Conversation history persistence (tauri-plugin-store)
- [x] Onboarding flow with CLI detection
- [x] Drag-and-drop file attachments
- [x] Permission request handling (allow/deny)
- [x] Auto-approve toggle
- [x] Keyboard shortcuts system
- [x] Resize handles for panels

## In progress tasks

- [ ] Commit uncommitted changes (13 modified files + 1 new)
- [ ] Review and stabilize PTY terminal improvements
- [ ] Review settings backend changes

## Future tasks

- [ ] TBD (see questions below)

## Open questions for project owner

See below.

## Relevant files

- `src-tauri/src/commands/acp.rs` - ACP protocol, ~43KB, core backend logic
- `src-tauri/src/commands/git.rs` - Git operations via git2
- `src-tauri/src/commands/pty.rs` - PTY terminal emulation
- `src-tauri/src/commands/settings.rs` - Config persistence
- `src-tauri/src/commands/fs_ops.rs` - File ops, CLI detection
- `src-tauri/src/commands/kiro_config.rs` - .kiro/ config parsing
- `src-tauri/src/lib.rs` - Tauri app setup, command registration
- `src/renderer/App.tsx` - Root layout
- `src/renderer/stores/taskStore.ts` - Main state store (~23KB)
- `src/renderer/components/chat/` - Chat UI (35+ files)
- `src/renderer/components/sidebar/` - Sidebar with task list, kiro config
- `src/renderer/components/code/` - Code/diff viewer
- `src/renderer/components/settings/SettingsPanel.tsx` - Settings UI (~29KB)
