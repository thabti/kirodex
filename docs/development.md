# Development guide

This guide covers setting up a local development environment, the build workflow, and common tasks for contributing to Kirodex.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Rust](https://rustup.rs) | >= 1.78 | Backend compilation |
| [Bun](https://bun.sh) | >= 1.0 | Package manager and script runner |
| [Tauri CLI](https://v2.tauri.app/start/create-project/#cargo) | ^2.0.0 | Desktop app build tooling |
| [kiro-cli](https://kiro.dev) | latest | Required at runtime for agent actions |

Install Tauri CLI via cargo:

```bash
cargo install tauri-cli --locked --version "^2.0.0"
```

## Quick start

```bash
git clone https://github.com/thabti/kirodex.git
cd kirodex
bun install
bun run dev
```

This starts Vite on `localhost:5174`, compiles the Rust backend, and opens the Kirodex window. The first build compiles ~430 crates and takes a few minutes. Subsequent builds are incremental (~2s).

## Frontend-only contributions

If you only touch files under `src/` (React, Zustand, Tailwind) and leave `src-tauri/` alone, you don't need Rust or `cargo` installed. The only verification gates you need:

```bash
bun run check:ts      # TypeScript type check
bun run test:ui       # Vitest (frontend tests)
```

## Available commands

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start dev mode (Vite + Tauri) |
| `bun run dev:renderer` | Start Vite dev server only (no Rust) |
| `bun run build` | Production build (.app / .dmg / .exe / .deb) |
| `bun run build:renderer` | Build frontend only |
| `bun run check:ts` | TypeScript type check (`tsc --noEmit`) |
| `bun run check:rust` | Rust type check (`cargo check`) |
| `bun run check` | Both TypeScript and Rust checks |
| `bun run lint` | Lint frontend with [oxlint](https://oxc.rs/docs/guide/usage/linter) |
| `bun run test:ui` | Run frontend tests (Vitest) |
| `bun run test:rust` | Run Rust tests |
| `bun run test` | Run all tests (frontend + Rust) |
| `bun run test:coverage` | Frontend tests with coverage report |
| `bun run bump:patch` | Bump version (patch) across all files |
| `bun run bump:minor` | Bump version (minor) |
| `bun run bump:major` | Bump version (major) |
| `bun run clean` | Remove build artifacts |

## Project structure

```
src/
├── renderer/                # React frontend
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root layout and routing
│   ├── types/index.ts       # Shared TypeScript types
│   ├── lib/
│   │   ├── ipc.ts           # Tauri invoke/listen wrappers
│   │   ├── timeline.ts      # Timeline rendering logic
│   │   ├── history-store.ts # Persistence layer (tauri-plugin-store)
│   │   └── utils.ts         # cn() helper
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand state stores
│   └── components/          # React components by feature
src-tauri/
├── src/
│   ├── main.rs              # Entry point
│   ├── lib.rs               # Tauri app setup, command registration
│   └── commands/            # Rust backend modules (33 modules)
├── Cargo.toml
├── tauri.conf.json
└── capabilities/            # Tauri v2 permission capabilities
```

See [architecture.md](architecture.md) for the full module breakdown.

## Development workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes.

3. Verify everything compiles:
   ```bash
   bun run check:ts
   bun run check:rust
   ```

4. Run tests:
   ```bash
   bun run test
   ```

5. Build to confirm no runtime issues:
   ```bash
   bun run build
   ```

6. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(chat): add message queue indicator"
   ```

## Code style

### TypeScript and React

- `const` arrow functions for components and handlers
- Prefix event handlers with `handle` (`handleClick`, `handleKeyDown`)
- Prefix booleans with verbs (`isLoading`, `hasError`, `canSubmit`)
- Use Tailwind classes for all styling; no inline CSS or `<style>` tags
- One export per component file
- Early returns for readability
- Zustand selectors (`useStore(s => s.field)`) instead of full-store subscriptions
- Icons from `@tabler/icons-react` only (never `lucide-react`)
- Path alias: `@/*` maps to `./src/renderer/*`

### Rust

- Use `git2` for git operations, not `Command::new("git")`
- Use `which::which()` for binary detection
- Use `confy` for config persistence
- Use `serde_yaml` for YAML parsing
- Return `Result<T, AppError>` from Tauri commands
- Never `unwrap()` in command handlers; use `?` with `From` impls
- Use `app.try_state::<T>()` to access managed state from closures

### CSS

- Use hex colors, not `oklch()` (older WebKit in Tauri may not support it)
- Theme tokens live in `src/tailwind.css` under `:root` and `.dark`
- `class="dark"` on `<html>` is required

## Testing

### Frontend tests

Frontend tests use Vitest with React Testing Library:

```bash
bun run test:ui                    # run all frontend tests
bun run test:ui -- --watch         # watch mode
bun run test:coverage              # with coverage
```

Test files live alongside their source files with a `.test.ts` or `.test.tsx` suffix.

### Rust tests

```bash
bun run test:rust                  # run all Rust tests
cd src-tauri && cargo test -- --nocapture  # with output
```

## Build validation

A task is not done until both pass with zero errors:

```bash
bun run check:ts    # must exit 0
bun run build       # must succeed
```

## kiro-cli detection

The app auto-detects kiro-cli at these paths (in order):

1. `~/.local/bin/kiro-cli`
2. `/usr/local/bin/kiro-cli`
3. `~/.kiro/bin/kiro-cli`
4. `/opt/homebrew/bin/kiro-cli`
5. Falls back to `which kiro-cli`

Without kiro-cli, the app launches but every agent action fails with "Failed to spawn kiro-cli."

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `no such command: tauri` | Run `cargo install tauri-cli --locked --version "^2.0.0"` |
| "Failed to spawn kiro-cli" | Install kiro-cli and verify with `kiro-cli --version` |
| Rust compilation errors | Run `rustup update`. Requires Rust >= 1.78. |
| Frontend type errors | Run `bun install`, then `bun run check:ts` |
| First build is slow | Normal. Initial `cargo build` compiles ~430 crates. |
| macOS DMG won't open | Unsigned build — run `xattr -cr /path/to/Kirodex.app` |
| Vite rebuilds on doc edits | Check `vite.config.ts` watch ignores include `*.md` and `src-tauri/**` |

## Related documentation

- [Architecture](architecture.md) — System design and module reference
- [IPC reference](ipc-reference.md) — Full command and event API
- [PR guidelines](pr-guidelines.md) — Pull request format
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Code style and release process
