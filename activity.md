## 2026-04-10 17:30 GST (Dubai)

### Figma: Design all Kirodex screens

Designed all 6 screens of Kirodex in Figma using the dark theme (`#0f0f0f` background, `#6366f1` primary) with proper layout matching the real app code. Screens cover the full user journey: Onboarding (3 steps), Main Empty State, Chat View (active thread with streaming), Chat + Diff split panel, Settings modal, and Dashboard with task cards and activity feed.

**Modified:** https://www.figma.com/design/S0xSLrUpEOicfWBmNQYXQK/kirodex-UI

---

## 2026-04-10 15:05 GST (Dubai)

### Git commands: Use project path directly instead of taskId

Changed `git_push`, `git_pull`, `git_fetch`, and `git_commit` to accept `cwd` (workspace path) directly instead of resolving through `taskId`. All git operations now work against the project path, removing the dependency on ACP task state. Removed unused `taskId` prop from `GitActionsGroup`.

**Modified:** `src-tauri/src/commands/git.rs`, `src/renderer/lib/ipc.ts`, `src/renderer/components/GitActionsGroup.tsx`, `src/renderer/components/AppHeader.tsx`

## 2026-04-10 14:59 GST (Dubai)

### AppHeader: Merge diff stats + git dropdown into one split button

Diff stats button and git dropdown are now one combined pill: `[🔀 3 +45 -12][▼]`. Left side toggles the diff panel, right chevron opens the git menu (Commit, Push, Pull, Fetch, GitHub). Commit moved into the dropdown. When no task is active, only the diff icon shows without the chevron.

**Modified:** `src/renderer/components/AppHeader.tsx`, `src/renderer/components/GitActionsGroup.tsx`

# Activity Log

## 2026-04-10 14:58 GST (Dubai)
### MCP: Switched Figma MCP from npx to bunx
Diagnosed `figma-developer-mcp` failing via `npx` due to a vite override conflict in the project. Switched the MCP config to use `bunx` which resolves and runs the package without issues.
**Modified:** `~/.kiro/settings/mcp.json`
