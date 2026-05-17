## 2026-05-17 10:59 GST (Dubai)

### CI: Fix vcs_status test failing in detached HEAD

The `vcs_status_works_on_real_repo` test asserted branch is non-empty, but GitHub Actions checks out in detached HEAD state. Removed the assertion since detached HEAD is valid; test now only verifies the call succeeds.

**Modified:** src-tauri/src/commands/vcs_status.rs

---

## 2026-05-17 10:49 GST (Dubai)

### Build: fix gitignore excluding SelectionToolbar from CI

The `.gitignore` had an unanchored `diff/` pattern that matched `src/renderer/components/diff/`, preventing `SelectionToolbar.tsx` from being tracked by git. Changed to `/diff/` to only ignore a root-level directory. Committed the missing file and pushed to fix CI.

**Modified:** `.gitignore`, `src/renderer/components/diff/SelectionToolbar.tsx`
