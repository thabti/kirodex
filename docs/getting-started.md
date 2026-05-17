# Getting started

This guide walks you through installing Kirodex, connecting it to kiro-cli, and running your first agent conversation.

## Installation

### macOS (Homebrew)

```bash
brew install --cask thabti/tap/kirodex
```

To upgrade:

```bash
brew update && brew reinstall kirodex
```

### macOS (manual)

Download the `.dmg` from the [latest release](https://github.com/thabti/kirodex/releases/latest), open it, and drag Kirodex to Applications.

If macOS blocks the app (unsigned build), run:

```bash
xattr -cr /Applications/Kirodex.app
```

### Linux

```bash
# Debian / Ubuntu
sudo dpkg -i kirodex_*_amd64.deb

# AppImage
chmod +x Kirodex_*.AppImage && ./Kirodex_*.AppImage
```

### Windows

Download the `.exe` installer from [releases](https://github.com/thabti/kirodex/releases/latest). Winget and Scoop support coming soon.

## Prerequisites

Kirodex requires [kiro-cli](https://kiro.dev) installed and in your PATH. Without it, the app launches but agent actions fail.

Verify your installation:

```bash
kiro-cli --version
```

The app auto-detects kiro-cli at these paths:
1. `~/.local/bin/kiro-cli`
2. `/usr/local/bin/kiro-cli`
3. `~/.kiro/bin/kiro-cli`
4. `/opt/homebrew/bin/kiro-cli`
5. System PATH (`which kiro-cli`)

## First launch

On first launch, Kirodex shows an onboarding wizard that:

1. Detects your kiro-cli installation
2. Verifies authentication (prompts login if needed)
3. Lets you choose a theme (light or dark)

After onboarding, you land on the main interface.

## Creating your first thread

1. Click the **+** button in the sidebar (or press `Cmd+N` on the thread list)
2. Select a project folder — this is the working directory for the agent
3. Type your message in the chat input and press Enter
4. The agent connects via ACP and begins working

Each thread is an independent agent conversation with its own context, tool calls, and execution history.

## Core concepts

### Projects

A project is a folder on your filesystem. When you create a thread, you pick a project folder. The agent operates within that directory; it can read files, run commands, and make changes scoped to that project.

### Threads

Threads are conversations with the agent. Each thread:
- Has its own message history
- Runs as an independent ACP connection
- Can be paused, resumed, or cancelled
- Persists across app restarts

### Modes

- **Chat mode** (default) — the agent responds to your messages and executes tool calls
- **Plan mode** (`/plan`) — the agent plans before acting; useful for complex tasks where you want to review the approach first

### Auto-approve

By default, the agent asks permission before writing files or running commands. Toggle auto-approve in Settings or per-thread to let the agent work without interruption.

## Chat features

### Slash commands

Type `/` in the chat input to see available commands:

| Command | What it does |
|---------|-------------|
| `/clear` | Clear messages in the current thread |
| `/model` | Switch AI model |
| `/agent` | Switch agent |
| `/plan` | Toggle plan mode |
| `/goal <objective>` | Start an autonomous goal loop |
| `/btw <question>` | Ask a side question without polluting history |
| `/fork` | Fork thread into a new conversation |
| `/branch` | Create and checkout a new git branch |
| `/worktree` | Create a git worktree for isolated work |
| `/close` | Archive the thread |
| `/data` | Open analytics dashboard |

See [slash-commands.md](slash-commands.md) for the full reference.

### @mentions

Type `@` in the chat input to attach context:
- **Files** — attach project files with git status indicators
- **Agents** — mention a specific agent
- **Skills** — reference a skill
- **Prompts** — include a steering prompt

### Message queue

You can type messages while the agent is working. They queue up and send when the current turn ends.

### Selection toolbar

Select text in any message to copy it, add it to the chat input, or start a new thread from the selection.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+L` | Focus chat input |
| `Cmd+B` | Toggle sidebar / btw mode |
| `Cmd+D` | Toggle diff panel |
| `Cmd+J` | Toggle terminal |
| `Cmd+,` | Open settings |
| `Cmd+W` | Close thread |
| `Cmd+\` | Toggle split view |
| `Escape` | Stop running agent |
| `Cmd+Shift+[` / `]` | Previous / next thread |

See [keyboard-shortcuts.md](keyboard-shortcuts.md) for the full list.

## Split view

View two threads side by side:
- Drag a thread from the sidebar to open it in a split panel
- Right-click a thread and choose "Split left" or "Split right"
- `Cmd+\` to toggle split view
- Double-click the divider to reset 50/50

## File tree

Toggle the file tree panel to browse your project:
- Real-time filesystem watching updates the tree as files change
- Git status indicators show modified, added, and deleted files
- Drag files from the tree into chat to attach as context
- Right-click for rename, create, and delete actions

## Git integration

Kirodex has built-in git support:
- **Branch management** — create, switch, and delete branches from the branch selector
- **Staging and committing** — stage files and commit with AI-generated messages
- **Push, pull, fetch** — sync with remotes
- **Diff viewer** — see changes inline or side-by-side with syntax highlighting
- **Worktrees** — isolate thread work in separate git worktrees

The diff stats badge in the header shows unstaged changes at a glance.

## Goal mode

Goal mode turns a thread into an autonomous agent loop. Give it an objective and a verifiable stop condition, and the agent works through plan → implement → verify cycles until done.

```
/goal Implement user authentication with email/password login, registration, and password reset. All auth tests pass.
```

See [goal-mode.md](goal-mode.md) for configuration and details.

## Analytics

Type `/data` or `/usage` to open the analytics dashboard. It tracks:
- Coding hours and session activity
- Messages sent and tokens consumed
- Tool calls and their types
- Diff statistics (lines added/removed)
- Model and mode usage
- Slash command frequency

All data is stored locally in a `redb` database. Clear it from Settings > Advanced.

## Terminal

Press `Cmd+J` to open the integrated terminal. Each thread gets its own PTY session running in the project directory.

## Settings

Open settings with `Cmd+,` or the gear icon. Configure:
- **General** — CLI path, default model, auto-approve, notifications
- **Appearance** — Theme (light/dark), font size
- **Git** — Default branch, commit signing
- **Advanced** — Analytics, goal mode, experimental features

## Notifications

Kirodex sends native desktop notifications when the agent finishes a turn while the app is in the background. Toggle in Settings > General > Permissions.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to spawn kiro-cli" | Install kiro-cli and verify with `kiro-cli --version` |
| Agent not responding | Check connection status indicator in the header; try cancelling and resending |
| White flash on launch | Ensure `class="dark"` is on the HTML element (report as bug if persistent) |
| macOS blocks the app | Run `xattr -cr /Applications/Kirodex.app` |

## Related documentation

- [Keyboard shortcuts](keyboard-shortcuts.md) — Full shortcut reference
- [Slash commands](slash-commands.md) — All chat commands
- [Goal mode](goal-mode.md) — Autonomous agent loop
- [Architecture](architecture.md) — System design (for contributors)
- [Development guide](development.md) — Local dev setup (for contributors)
