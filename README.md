[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-%3E%3D1.78-orange.svg)](https://rustup.rs)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)]()

<img src="src-tauri/icons/icon.png" alt="Kirodex" height="80" width="80"/>

# Kirodex

A native macOS desktop client for [Kiro CLI](https://kiro.dev) AI coding agents, built with [Tauri v2](https://v2.tauri.app) (Rust) and React 19 (TypeScript).

<!-- TODO: add screenshot or GIF of the app here -->
<!-- Example: ![Kirodex screenshot](assets/screenshot.png) -->

## Features

**Chat and agents**
- Chat interface via the [Agent Client Protocol](https://github.com/anthropics/agent-client-protocol) SDK
- Slash commands (`/clear`, `/model`, `/agent`, `/plan`, `/chat`) with inline model picker and MCP server panels
- Task management: create, pause, resume, cancel, delete

**Code and diffs**
- Syntax-highlighted inline and side-by-side diff views ([Shiki](https://shiki.style))
- Click a file operation in chat to jump to that file

**Git**
- Branch, stage, commit, push, revert through [git2](https://crates.io/crates/git2) (no shell commands)

**Terminal and settings**
- Integrated PTY terminal (xterm.js)
- Settings panel for kiro-cli path, models, and per-project preferences

## Getting started

Prerequisites: macOS, [Rust](https://rustup.rs) >= 1.78, [Bun](https://bun.sh) >= 1.0 (or Node >= 20), [kiro-cli](https://kiro.dev) in your PATH.

```bash
git clone https://github.com/thabti/kirodex.git
cd kirodex
bun install
bun run dev
```

This starts Vite on `localhost:5174`, compiles the Rust backend, and opens the Kirodex window. The first build compiles ~430 crates and takes a few minutes. Subsequent builds are incremental (~2s).

The app auto-detects kiro-cli at `~/.local/bin/kiro-cli`, `/usr/local/bin/kiro-cli`, `~/.kiro/bin/kiro-cli`, or `/opt/homebrew/bin/kiro-cli`. Falls back to `which kiro-cli`.

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start dev mode (Vite + Tauri) |
| `bun run build` | Production build (.app + .dmg) |
| `bun run check:ts` | TypeScript type check |
| `bun run check:rust` | Rust type check (`cargo check`) |
| `bun run test:rust` | Run Rust tests |
| `bun run clean` | Remove build artifacts |

> The DMG is not code-signed. Run `xattr -cr /path/to/Kirodex.app` before opening, or right-click → Open.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│            React 19 + TypeScript                 │
│   Zustand stores ← invoke() / listen() → IPC    │
└────────────────────────┬────────────────────────┘
                         │ Tauri IPC
┌────────────────────────┴────────────────────────┐
│                    Backend                       │
│                 Rust (Tauri v2)                   │
│                                                  │
│  ┌──────────┐ ┌──────┐ ┌──────┐ ┌───────────┐   │
│  │   ACP    │ │  PTY │ │  Git │ │ Settings  │   │
│  │(kiro-cli)│ │      │ │(git2)│ │  (confy)  │   │
│  └──────────┘ └──────┘ └──────┘ └───────────┘   │
└─────────────────────────────────────────────────┘
```

| Module | Purpose |
|--------|---------|
| `acp.rs` | Spawns `kiro-cli acp` as a subprocess, implements the ACP `Client` trait. Runs on a dedicated OS thread with a single-threaded tokio runtime (`!Send` futures). Communicates with Tauri via `mpsc` channels. |
| `git.rs` | Git operations via `git2` (libgit2). Branch, stage, commit, push, revert, diff. |
| `settings.rs` | Config persistence via `confy`. Handles XDG/macOS paths. |
| `fs_ops.rs` | File operations, kiro-cli detection via `which`, project file listing via git2 index. |
| `kiro_config.rs` | `.kiro/` config discovery. Parses agents, skills, steering rules, MCP servers. Frontmatter via `serde_yaml`. |
| `pty.rs` | Terminal emulation via `portable-pty`. |
| `error.rs` | Shared `AppError` type via `thiserror` with `From` impls for git2, IO, JSON, confy errors. |

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, project layout, and architecture details.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 |
| Backend | Rust 2021, git2, thiserror, confy, serde_yaml, which |
| Frontend | React 19, TypeScript 5, Vite 6 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| UI | Radix UI, Lucide icons |
| Code | Shiki (syntax highlighting) |
| Terminal | xterm.js + portable-pty |
| Diff | @pierre/diffs |
| Markdown | react-markdown + remark-gfm |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to spawn kiro-cli" | Check kiro-cli is installed. Run `kiro-cli --version`. |
| Rust compilation errors | Run `rustup update`. Requires Rust >= 1.78. |
| Frontend type errors | Run `bun install`, then `bun run check:ts`. |
| First build is slow | Normal. Initial `cargo build` compiles ~430 crates. |
| DMG says "damaged" | Run `xattr -cr /path/to/Kirodex.app` (unsigned app). |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, code style, and project layout.

## Author

Sabeur Thabti

## License

MIT
