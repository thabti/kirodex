[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-%3E%3D1.78-orange.svg)](https://rustup.rs)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)]()

<img src="src-tauri/icons/icon.png" alt="Kirodex" height="80" width="80"/>

# Kirodex

A native macOS desktop client for [Kiro CLI](https://kiro.dev) AI coding agents, built with [Tauri v2](https://v2.tauri.app) (Rust) and React 19 (TypeScript).

Inspired by [OpenAI Codex](https://openai.com/codex/) and [T3 Code](https://github.com/pingdotgg/t3code).

![Kirodex screenshot](assets/chat-mode-task-progress.png)

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

### Prerequisites

- macOS (Apple Silicon or Intel)
- [Rust](https://rustup.rs) >= 1.78
- [Bun](https://bun.sh) >= 1.0 (or Node >= 20)
- [kiro-cli](https://kiro.dev) installed and in your PATH

### Clone and run

```bash
git clone https://github.com/thabti/kirodex.git
cd kirodex
bun install
bun run dev
```

This starts Vite on `localhost:5174`, compiles the Rust backend, and opens the Kirodex window.

The first build compiles ~430 crates and takes a few minutes. Subsequent builds are incremental (~2 s).

### kiro-cli detection

The app auto-detects kiro-cli at these paths (in order):

1. `~/.local/bin/kiro-cli`
2. `/usr/local/bin/kiro-cli`
3. `~/.kiro/bin/kiro-cli`
4. `/opt/homebrew/bin/kiro-cli`
5. Falls back to `which kiro-cli`

### Available commands

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

See [docs/architecture.md](docs/architecture.md) for the system diagram, backend module reference, and full tech stack.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to spawn kiro-cli" | Check kiro-cli is installed. Run `kiro-cli --version`. |
| Rust compilation errors | Run `rustup update`. Requires Rust >= 1.78. |
| Frontend type errors | Run `bun install`, then `bun run check:ts`. |
| First build is slow | Normal. Initial `cargo build` compiles ~430 crates. |
| DMG says "damaged" | Run `xattr -cr /path/to/Kirodex.app` (unsigned app). |

## Release and code signing

The CI produces an unsigned `.app` and `.dmg` via GitHub Actions artifacts. To distribute through the Mac App Store or pass Gatekeeper without user workarounds, you need to sign and notarize the app.

### 1. Build the production bundle

```bash
bun run build
```

This runs `cargo tauri build`, which compiles the Rust backend in release mode, bundles the Vite frontend, and produces:
- `src-tauri/target/release/bundle/macos/Kirodex.app`
- `src-tauri/target/release/bundle/dmg/Kirodex_0.6.0_aarch64.dmg`

### Running unsigned builds

If you don't have an Apple Developer account, users can run the unsigned build by clearing the quarantine flag:

```bash
xattr -cr /path/to/Kirodex.app
```

### 2. Sign the .app with your Apple Developer certificate

```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --options runtime \
  src-tauri/target/release/bundle/macos/Kirodex.app
```

Replace `Your Name (TEAM_ID)` with your certificate identity. List available identities with:

```bash
security find-identity -v -p codesigning
```

### 3. Notarize with Apple

```bash
# Create a zip for notarization
ditto -c -k --keepParent \
  src-tauri/target/release/bundle/macos/Kirodex.app \
  Kirodex.zip

# Submit to Apple
xcrun notarytool submit Kirodex.zip \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password" \
  --wait

# Staple the notarization ticket
xcrun stapler staple \
  src-tauri/target/release/bundle/macos/Kirodex.app
```

Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com/account/manage) under "Sign-In and Security" > "App-Specific Passwords".

### 4. Re-create the signed DMG

```bash
# Create a signed DMG from the notarized .app
hdiutil create -volname "Kirodex" -srcfolder \
  src-tauri/target/release/bundle/macos/Kirodex.app \
  -ov -format UDZO Kirodex-signed.dmg

codesign --sign "Developer ID Application: Your Name (TEAM_ID)" \
  Kirodex-signed.dmg
```



Or right-click the app > Open > Open (bypasses Gatekeeper once).

## Feature requests (PRs welcomed)

| Feature | Description |
|---------|-------------|
| Git worktree | Support for managing multiple working trees |
| Agent library | Browse and install agents from a curated registry |
| Skills library | Browse and install skills from a curated registry |
| UI improvements | General polish, layout, and interaction enhancements |
| Testing (Windows) | Windows platform support and test coverage |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, code style, and project layout.

## Author

Sabeur Thabti

## Sponsor

[Lastline.app](https://lastline.app)

## License

MIT
