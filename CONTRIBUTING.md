# Contributing to Kirodex

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Getting started

```bash
git clone https://github.com/thabti/kirodex.git
cd kirodex
cargo install tauri-cli  # required for `bun run dev` and `bun run build`
bun install
bun run dev
```

See the [README](README.md) for prerequisites (Rust, Bun, Tauri CLI, kiro-cli).

## Development workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes.

3. Verify everything compiles:
   ```bash
   bun run check:ts      # TypeScript
   bun run check:rust     # Rust
   ```

4. Build to confirm no runtime issues:
   ```bash
   bun run build
   ```

5. Commit and push.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add model switching in chat input
fix: prevent white flash on app launch
docs: update architecture diagram
chore: bump git2 to 0.20
refactor(git): replace Command::new with git2
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `ci`, `style`.

Include a scope when it helps: `feat(chat):`, `fix(git):`, `refactor(settings):`.

## Project layout

| Directory | What lives there |
|-----------|-----------------|
| `src/renderer/` | React frontend (components, stores, hooks, types) |
| `src-tauri/src/commands/` | Rust backend modules (acp, git, settings, pty, fs_ops, kiro_config, error) |
| `src/tailwind.css` | Theme tokens and global styles |
| `.kiro/steering/` | Kiro agent steering rules |

## Code style

### TypeScript / React

- `const` arrow functions for components and handlers
- Prefix event handlers with `handle` (`handleClick`, `handleKeyDown`)
- Prefix booleans with verbs (`isLoading`, `hasError`, `canSubmit`)
- Use Tailwind classes for all styling; no inline CSS or `<style>` tags
- One export per component file
- Early returns for readability
- Zustand selectors (`useStore(s => s.field)`) instead of full-store subscriptions

### Rust

- Use `git2` for git operations, not `Command::new("git")`
- Use `which::which()` for binary detection, not `Command::new("which")`
- Use `confy` for config persistence
- Use `serde_yaml` for YAML parsing
- Return `Result<T, AppError>` from Tauri commands (exception: `acp.rs` uses `String`)
- Never `unwrap()` in command handlers; use `?` with `From` impls
- Use `app.try_state::<T>()` to access managed state from closures

### CSS

- Use hex colors, not `oklch()` (older WebKit in Tauri may not support it)
- Theme tokens live in `src/tailwind.css` under `:root` and `.dark`
- `class="dark"` on `<html>` is required; don't remove it

## Architecture notes

- **ACP connections** run on dedicated OS threads with single-threaded tokio runtimes (the SDK uses `!Send` futures). Communication with the Tauri async runtime happens via `mpsc` channels.
- **Permission handling** uses `oneshot` channels bridging the ACP thread to the Tauri runtime. The handler accesses managed state via `app.try_state::<AcpState>()`.
- **Frontend state** lives in Zustand stores. No Redux, no React Context for global state.
- **IPC** uses Tauri's `invoke()` for commands and `listen()` for events. Always return unlisten functions in `useEffect` cleanup.

## Reporting issues

Open an issue with:
- What you expected to happen
- What happened instead
- Steps to reproduce
- macOS version and `rustc --version`

## Pull requests

- Keep PRs focused on a single change
- Include a description of what changed and why
- Make sure `bun run check:ts` and `bun run check:rust` pass
- Screenshots for UI changes are appreciated

## Releasing

### Version bump

The version lives in three files that must stay in sync. Use the bump script:

```bash
# Bump patch (0.7.0 → 0.7.1)
bun run bump:patch

# Bump minor (0.7.0 → 0.8.0)
bun run bump:minor

# Bump major (0.7.0 → 1.0.0)
bun run bump:major

# Set exact version
bash scripts/bump-version.sh 1.2.3
```

This updates `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

### Creating a release

```bash
# 1. Bump the version
bun run bump:patch

# 2. Commit the version bump
git add -A && git commit -m "chore: bump version to $(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')"

# 3. Tag and push (triggers the release workflow)
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
git tag "v$VERSION"
git push origin main --tags
```

The `v*` tag push triggers `.github/workflows/release.yml` which:

1. Builds for **macOS** (Apple Silicon), **Linux** (x86_64), and **Windows** (x86_64)
2. Signs and notarizes the macOS `.dmg` using Apple Developer ID
3. Creates a draft GitHub release with all platform artifacts
4. Updates the Homebrew tap (if `thabti/homebrew-tap` exists)

### Manual trigger

You can also trigger a release from the GitHub Actions UI:

1. Go to Actions → Release → Run workflow
2. Choose draft: `true` or `false`

### Code signing secrets

These GitHub secrets are required for macOS code signing and notarization:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` (Developer ID Application) |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` export |
| `APPLE_SIGNING_IDENTITY` | e.g., `Developer ID Application: Name (TEAM_ID)` |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `TEAM_ID` | Apple Developer Team ID |
| `KEYCHAIN_PASSWORD` | Arbitrary password for the CI temporary keychain |

To export the certificate:

```bash
security find-identity -v -p codesigning  # find your identity
security export -k ~/Library/Keychains/login.keychain-db -t identities -f pkcs12 -o cert.p12 -P "password"
base64 -i cert.p12 | gh secret set APPLE_CERTIFICATE
rm cert.p12
```

Without these secrets, the workflow still builds unsigned artifacts for all platforms.
