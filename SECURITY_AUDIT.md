# Kirodex security audit

**Date:** 2026-04-17
**Scope:** Full codebase — Tauri config, Rust backend commands, frontend IPC, dependencies, secrets handling
**Auditor:** Automated review via source code analysis

---

## Executive summary

Kirodex is a Tauri v2 desktop app with a Rust backend and React frontend. The architecture is sound: IPC is mediated through Tauri's invoke system, git operations use libgit2 instead of shell commands, and the ACP sandbox has both loose and strict path-checking modes with good test coverage.

The main risks are **command injection in two `osascript` call sites**, **unrestricted file reads from the frontend**, and a **sandbox bypass when a user mentions `/`**. Most findings are medium severity and fixable with targeted changes.

---

## Findings

### Critical

#### C1. Sandbox bypass via root path `/`

**File:** `src-tauri/src/commands/acp/sandbox.rs` — `is_path_strictly_allowed`
**Evidence:** The test `strict_root_slash_not_allowed` asserts that when `/` is in the allowed set, `/etc/passwd` passes the check — and the test *expects this behavior*.

```rust
#[test]
fn strict_root_slash_not_allowed() {
    let mut allowed = BTreeSet::new();
    allowed.insert("/".to_string());
    assert!(is_path_strictly_allowed(&allowed, "/etc/passwd")); // passes!
}
```

If a user types a message containing `/` as a standalone token (e.g., "check the / directory"), `extract_paths_from_message` adds `/` to the allowed set, and the entire filesystem becomes accessible to the agent.

**Recommendation:** Reject `/` (and other overly broad paths like `/Users`, `/home`, `/tmp`) in `extract_paths_from_message` or add a minimum-depth check (require at least two path segments). The test should assert `false`, not `true`.

---

### High

#### H1. `read_text_file` and `read_file_base64` have no path validation

**File:** `src-tauri/src/commands/fs_ops.rs`

```rust
#[tauri::command]
pub fn read_text_file(path: String) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
}
```

These commands accept any absolute path from the frontend with zero validation. A compromised or malicious frontend script (XSS, malicious dependency) can read any file the process has access to — SSH keys, `.env` files, browser cookies, etc.

**Recommendation:** Restrict reads to the active workspace directory, or require the caller to pass a `taskId` and resolve the path against the task's workspace. At minimum, block reads of known sensitive paths (`~/.ssh/`, `~/.aws/`, `~/.gnupg/`).

#### H2. Command injection in `open_in_editor` via `osascript`

**File:** `src-tauri/src/commands/fs_ops.rs`

```rust
let escaped = path.replace('\\', "\\\\").replace('\'', "'\\''").replace('"', "\\\"");
std::process::Command::new("osascript")
    .arg("-e")
    .arg(format!(
        "tell application \"Terminal\"\n  activate\n  do script \"cd '{escaped}'\"\nend tell"
    ))
```

The escaping is incomplete. A path containing `'` followed by `\n` or AppleScript metacharacters can break out of the `do script` string. The `tmux` branch has the same pattern with `attach_cmd`.

**Recommendation:** Use `Command::new("open").arg("-a").arg("Terminal").arg("--args").arg(&path)` or pass the path via environment variable instead of interpolating into AppleScript. For terminal editors, use `Command::new(editor).arg(&path)` directly without a shell wrapper.

#### H3. Command injection in `open_terminal_with_command`

**File:** `src-tauri/src/commands/fs_ops.rs`

```rust
pub fn open_terminal_with_command(command: String) -> Result<(), AppError> {
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
            command.replace('\\', "\\\\").replace('"', "\\\"")
        ))
```

The `command` parameter comes directly from the frontend. The escaping only handles `\` and `"` but not newlines, which can inject arbitrary AppleScript. On Linux, the command is passed to `sh -c` via terminal emulators, which is also injectable.

**Recommendation:** If this is only used for `kiro-cli login`, hardcode the command or use an allowlist. Never pass arbitrary user strings into `osascript` or `sh -c`.

#### H4. `git_worktree_create` and `git_worktree_remove` shell out to `git`

**File:** `src-tauri/src/commands/git.rs`

```rust
let output = Command::new("git")
    .args(["worktree", "add", "-B", &branch, &worktree_path, "HEAD"])
    .current_dir(&cwd)
    .output()?;
```

While `Command::arg()` prevents shell injection, this contradicts the project's own convention of using `git2` for all git operations. The `cwd` parameter is not validated — a malicious frontend could point it at any directory.

**Recommendation:** Migrate to `git2::Repository::worktree()` API, or at minimum validate that `cwd` is a known workspace. The `worktree_path` is constructed from a validated slug, which is good.

---

### Medium

#### M1. `pty_create` accepts arbitrary `cwd` without validation

**File:** `src-tauri/src/commands/pty.rs`

```rust
pub fn pty_create(
    state: tauri::State<'_, PtyState>,
    window: tauri::Window,
    id: String,
    cwd: String,
    ...
```

The `cwd` is passed directly to `CommandBuilder::cwd()`. A compromised frontend could spawn a shell in any directory.

**Recommendation:** Validate that `cwd` matches a known workspace or is under the user's home directory.

#### M2. macOS app sandbox is disabled

**File:** `src-tauri/Kirodex.entitlements`

```xml
<key>com.apple.security.app-sandbox</key>
<false/>
```

The comment explains this is needed for subprocess spawning and file access. This is a reasonable tradeoff for a developer tool, but it means the app has full filesystem and network access.

**Recommendation:** Document this in the README security section. Consider using temporary entitlements for specific operations if Apple's sandbox model evolves to support it.

#### M3. Devtools enabled in release builds

**File:** `src-tauri/Cargo.toml`

```toml
tauri = { version = "2", features = ["macos-private-api", "devtools"] }
```

The `devtools` feature is unconditional — it's active in release builds. An attacker with physical access can open the WebView inspector and execute arbitrary JavaScript in the app's context.

**Recommendation:** Gate devtools behind `#[cfg(debug_assertions)]` or a Cargo feature flag:

```toml
[features]
devtools = ["tauri/devtools"]

[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
```

#### M4. CSP allows `connect-src` to PostHog

**File:** `src-tauri/tauri.conf.json`

```
connect-src 'self' ipc: http://ipc.localhost https://*.posthog.com https://*.i.posthog.com
```

This opens a data exfiltration channel. If an XSS vulnerability exists, attacker-controlled JavaScript can send data to PostHog's domain (or any subdomain matching the wildcard).

**Recommendation:** Use the exact PostHog host (`https://us.i.posthog.com`) instead of wildcards. Better yet, proxy analytics through your own domain so the CSP stays tight.

#### M5. Inline `<script>` in `index.html` conflicts with CSP

**File:** `index.html`

```html
<script>
    (function(){
        var t='dark';try{t=localStorage.getItem('kirodex-theme')||'dark'}catch(e){}
        ...
    })();
</script>
```

The CSP is `script-src 'self'`, which blocks inline scripts. This script only works because Tauri injects a nonce or the WebView doesn't enforce CSP on the initial HTML. If CSP enforcement tightens, this will break.

**Recommendation:** Move the theme detection to a separate `.js` file loaded with `<script src>`, or use Tauri's `dangerousDisableAssetCspModification` explicitly if the inline script is intentional.

#### M6. `git_worktree_setup` uses `git ls-files` via shell

**File:** `src-tauri/src/commands/git.rs`

```rust
let output = Command::new("git")
    .args(["ls-files", "--others", "--ignored", "--exclude-standard"])
    .current_dir(&cwd_path)
    .output()?;
```

Same concern as H4 — shells out to `git` instead of using `git2`. The `cwd_path` is canonicalized, which is good, but the pattern matching for `.worktreeinclude` is simplistic and could match unintended files.

**Recommendation:** Use `git2`'s status API with `include_ignored(true)` to list ignored files programmatically.

#### M7. `vite` overridden with `rolldown-vite`

**File:** `package.json`

```json
"overrides": {
    "vite": "npm:rolldown-vite@latest"
}
```

This replaces the well-audited Vite with `rolldown-vite@latest` — a less mature alternative pinned to `latest`, meaning every `bun install` could pull a different version. Supply chain risk.

**Recommendation:** Pin to an exact version: `"vite": "npm:rolldown-vite@7.3.1"`. If rolldown-vite is experimental, document the risk and consider reverting to standard Vite for production builds.

---

### Low

#### L1. Updater public key is hardcoded (acceptable)

**File:** `src-tauri/tauri.conf.json`

The updater uses HTTPS endpoints and a hardcoded Ed25519 public key. This is the correct pattern — the key verifies update signatures. No issue here, noting for completeness.

#### L2. `confy` stores settings in plaintext TOML

**File:** `src-tauri/src/commands/settings.rs`

Settings are persisted via `confy` to `~/Library/Application Support/rs.kirodex/default-config.toml`. The file contains `analytics_anon_id` and `kiro_bin` path but no secrets. Acceptable for a desktop app.

**Recommendation:** If you ever store API keys or tokens in settings, encrypt the config file or use the OS keychain.

#### L3. Analytics implementation is privacy-forward

**File:** `src/renderer/lib/analytics.ts`

PostHog is configured with `autocapture: false`, `capture_pageview: false`, `disable_session_recording: true`. Only enumerated events are tracked (feature names, not content). The distinct ID is a random UUID, not tied to identity. Good implementation.

#### L4. Dependency versions use caret ranges

**File:** `package.json`

Most dependencies use `^` ranges (e.g., `"react": "^19.0.0"`). This is standard for npm but means minor/patch updates are pulled automatically.

**Recommendation:** For a desktop app shipping binaries, consider using a lockfile (`bun.lockb`) and pinning critical dependencies. Verify the lockfile is committed.

#### L5. `macOSPrivateApi: true` in Tauri config

**File:** `src-tauri/tauri.conf.json`

This enables private macOS APIs for window vibrancy and traffic light positioning. Required for the custom titlebar. Acceptable tradeoff, but note that Apple could reject this from the Mac App Store.

#### L6. `PoisonError` handling via `parking_lot`

The codebase uses `parking_lot::Mutex` instead of `std::sync::Mutex`, which means mutexes never poison on panic. This is intentional (panics are caught by the global panic hook), but a panicked thread could leave state inconsistent.

**Recommendation:** The current approach is fine given the panic hook logs and the app is single-window. No action needed unless multi-window support is added.

---

## Positive findings

These are things done well:

1. **Sandbox implementation** — The ACP sandbox (`sandbox.rs`) has both loose and strict modes, canonicalizes paths to prevent symlink escapes, and has 80+ unit tests including adversarial cases.

2. **git2 over shell commands** — Most git operations use libgit2 bindings, avoiding shell injection entirely. Credential handling supports SSH agent, key files, and system credential helpers.

3. **Tauri v2 capabilities** — The `default.json` permissions are minimal and scoped to the `main` window. No `shell:execute` or `fs:*` permissions are granted.

4. **IPC event cleanup** — The `tauriListen` wrapper handles HMR/StrictMode double-mount correctly with deferred cleanup.

5. **Panic hook** — Global panic hook catches panics on all threads (ACP, PTY, probe) and logs them instead of silently dying.

6. **Window close cleanup** — `shutdown_app` kills all ACP connections and PTY sessions on window close, preventing orphaned processes.

7. **Permission timeout** — Permission requests have a 5-minute timeout to prevent indefinite hangs.

8. **Worktree slug validation** — `validate_worktree_slug` rejects `..`, special characters, and overly long slugs.

---

## Recommended fixes by priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C1: Block `/` and shallow paths in allowed set | Small | Prevents full filesystem access via sandbox bypass |
| 2 | H1: Add path validation to `read_text_file`/`read_file_base64` | Small | Prevents arbitrary file reads from frontend |
| 3 | H2+H3: Replace `osascript` interpolation with safe alternatives | Medium | Eliminates command injection vectors |
| 4 | M3: Gate devtools behind debug builds | Small | Prevents inspector access in production |
| 5 | H4: Migrate worktree commands to git2 | Medium | Eliminates remaining shell-out surface |
| 6 | M4: Tighten CSP connect-src wildcards | Small | Reduces exfiltration surface |
| 7 | M1: Validate PTY cwd | Small | Prevents shell spawning in arbitrary directories |
| 8 | M7: Pin rolldown-vite version | Small | Reduces supply chain risk |
