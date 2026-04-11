<p align="center">
  <a href="https://github.com/thabti/kirodex">
    <img src="src-tauri/icons/icon.png" alt="Kirodex" width="120" height="120" />
  </a>
  <h1 align="center">Kirodex</h1>
  <p align="center">
    AI coding agents on your desktop
    <br />
    Built with <a href="https://v2.tauri.app">Tauri v2</a> (Rust) and React 19 (TypeScript)
    <br />
    Inspired by <a href="https://github.com/openai/codex">OpenAI Codex</a> and <a href="https://github.com/pingdotgg/t3code">T3 Code</a>
    <br />
    <br />
    <a href="https://github.com/thabti/kirodex/releases/latest">Download</a>
    ·
    <a href="https://github.com/thabti/kirodex/issues">Report Bug</a>
    ·
    <a href="https://github.com/thabti/kirodex/issues">Request Feature</a>
  </p>
  <p align="center">
    <img src="assets/chat-mode-task-progress.png" alt="Kirodex screenshot" />
  </p>
</p>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-%3E%3D1.78-orange.svg)](https://rustup.rs)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)]()

</div>

---

## Install

<div align="center">

<a href="https://github.com/thabti/kirodex/releases/latest">
  🍎 macOS (Apple Silicon) .dmg
</a>
<br />
<a href="https://github.com/thabti/kirodex/releases/latest">
  🐧 Linux x64 .deb / .AppImage
</a>
<br />
<a href="https://github.com/thabti/kirodex/releases/latest">
  🪟 Windows x64 .exe / .msi
</a>

<br />
<br />

</div>

### Package managers

**macOS (Homebrew):**

```bash
brew install --cask thabti/tap/kirodex
```

**Linux:**

```bash
# Debian / Ubuntu — download from releases
sudo dpkg -i kirodex_*_amd64.deb

# AppImage — download and run
chmod +x Kirodex_*.AppImage && ./Kirodex_*.AppImage
```

**Windows:**

```powershell
# Download the .exe installer or .msi from releases
# winget and scoop support coming soon
```

> Requires [kiro-cli](https://kiro.dev) installed and in your PATH.

---

## Features

**Chat and agents**
- Chat interface via the [Agent Client Protocol](https://github.com/anthropics/agent-client-protocol) SDK
- Threaded agentic development — each conversation runs as an independent agent thread with its own context, tool calls, and execution history
- Slash commands (`/clear`, `/model`, `/agent`, `/plan`, `/chat`) with inline model picker and MCP server panels
- Task management: create, pause, resume, cancel, delete
- Question cards — agents can ask multi-choice questions; pick an option and reply inline
- Kiro config sidebar — browse agents (grouped by stack), skills, steering rules, and MCP servers from `.kiro/`

**Code and diffs**
- Syntax-highlighted inline and side-by-side diff views ([Shiki](https://shiki.style))
- Click a file operation in chat to jump to that file
- Changed files summary with per-file +/- stats and one-click stage/revert

**Git**
- Branch, stage, commit, push, pull, fetch through [git2](https://crates.io/crates/git2) with SSH + HTTPS credential support (no shell commands)
- Live diff stats in the header bar, always visible when a project is open

**Notifications**
- Native desktop notifications when the agent finishes a turn while the app is in the background
- Configurable — toggle on/off in Settings > General > Permissions

**Terminal and settings**
- Integrated PTY terminal (xterm.js)
- Full-screen settings panel: CLI path, default model, auto-approve, font size, keyboard shortcuts, git integration, and notification preferences

---

## Development

### Prerequisites

- macOS, Linux, or Windows
- [Rust](https://rustup.rs) >= 1.78
- [Bun](https://bun.sh) >= 1.0 (or Node >= 20)
- [Tauri CLI](https://v2.tauri.app/start/create-project/#cargo): `cargo install tauri-cli`
- [kiro-cli](https://kiro.dev) installed and in your PATH

### Clone and run

```bash
git clone https://github.com/thabti/kirodex.git
cd kirodex
cargo install tauri-cli  # if not already installed
bun install
bun run dev
```

This starts Vite on `localhost:5174`, compiles the Rust backend, and opens the Kirodex window.
The first build compiles ~430 crates and takes a few minutes. Subsequent builds are incremental (~2s).

### Commands

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start dev mode (Vite + Tauri) |
| `bun run build` | Production build (.app / .dmg / .exe / .deb) |
| `bun run check:ts` | TypeScript type check |
| `bun run check:rust` | Rust type check (`cargo check`) |
| `bun run test` | Run all tests (frontend + Rust) |
| `bun run bump:patch` | Bump version (patch) across all files |
| `bun run clean` | Remove build artifacts |

### kiro-cli detection

The app auto-detects kiro-cli at these paths (in order):

1. `~/.local/bin/kiro-cli`
2. `/usr/local/bin/kiro-cli`
3. `~/.kiro/bin/kiro-cli`
4. `/opt/homebrew/bin/kiro-cli`
5. Falls back to `which kiro-cli`

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for the system diagram, backend module reference, and full tech stack.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `no such command: tauri` | Run `cargo install tauri-cli` to install the Tauri CLI. |
| "Failed to spawn kiro-cli" | Check kiro-cli is installed. Run `kiro-cli --version`. |
| Rust compilation errors | Run `rustup update`. Requires Rust >= 1.78. |
| Frontend type errors | Run `bun install`, then `bun run check:ts`. |
| First build is slow | Normal. Initial `cargo build` compiles ~430 crates. |
| macOS DMG won't open | Unsigned build — run `xattr -cr /path/to/Kirodex.app`. |

## Feature requests (PRs welcomed)

| Feature | Description |
|---------|-------------|
| Git worktree | Support for managing multiple working trees |
| Agent library | Browse and install agents from a curated registry |
| Skills library | Browse and install skills from a curated registry |
| UI improvements | General polish, layout, and interaction enhancements |
| Winget / Scoop | Windows package manager support |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, code style, release process, and project layout.

## Author

Sabeur Thabti

## Sponsor

[Lastline.app](https://lastline.app)

## License

MIT
