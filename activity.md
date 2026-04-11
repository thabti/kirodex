# Activity Log

## 2026-04-11 18:44 GST (Dubai)
### Config: Enable Cmd+/- zoom hotkeys via Tauri v2 native webview zoom
Added `zoomHotkeysEnabled: true` to the window config and `core:webview:allow-set-webview-zoom` permission to capabilities. No plugin or frontend code required.

**Modified:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

## 2026-04-11 22:42 GST (Dubai)
### Fix: Homebrew job 404 on draft release assets
The homebrew job in the release workflow failed with a 404 when downloading the DMG via `curl`. Root cause: `releaseDraft: true` means assets aren't publicly accessible via direct URL. Replaced `curl` with `gh release download` (authenticates via `GH_TOKEN`) and added a retry loop (10 attempts, 15s apart). Committed `87487cd` and pushed to main.
**Modified:** `.github/workflows/release.yml`

## 2026-04-11 16:39 GST (Dubai)
### CI: Commit and push release workflow, signing, Homebrew tap, and bundle metadata
Committed `ad9933a` to main with: reworked release workflow (setup + matrix build + homebrew jobs), macOS code signing/notarization support, Homebrew cask template, fixed bundle identifier to `com.kirodex.app`, added bundle metadata, and certificate patterns in `.gitignore`.
**Modified:** `.github/workflows/release.yml`, `.github/homebrew/Casks/kirodex.rb.template`, `.gitignore`, `src-tauri/tauri.conf.json`, `activity.md`

## 2026-04-11 16:33 GST (Dubai)
### Gitignore: Added certificate signing file patterns
Added `*.key`, `*.csr`, and `*.cer` glob patterns to `.gitignore` to prevent private keys, certificate signing requests, and certificates from being committed.

**Modified:** `.gitignore`
