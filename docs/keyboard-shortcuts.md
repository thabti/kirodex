# Keyboard shortcuts

Kirodex registers global keyboard shortcuts via the `useKeyboardShortcuts` hook, attached once in `App.tsx`. Shortcuts are ignored when focus is in an `INPUT` or `SELECT` element. The chat textarea handles its own key events separately.

On Windows/Linux, replace Cmd with Ctrl.

## Global shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Stop running agent (pause current task). Skipped when terminal has focus. |
| `Cmd+,` | Open settings |
| `Cmd+B` | Toggle btw (tangent) mode — opens `/btw` in chat input, or exits btw mode if active |
| `Cmd+D` | Toggle diff panel |
| `Cmd+Shift+D` | Toggle debug panel |
| `Cmd+J` | Toggle terminal for the active thread |
| `Cmd+K` | Open command palette |
| `Cmd+L` | Focus chat input (handled in ChatInput component) |
| `Cmd+W` | Close thread (cancel + delete), or dismiss pending workspace if no thread is selected |
| `Cmd+\` | Toggle split view |
| `Cmd+Shift+\` | Create new split view with current thread |
| `Cmd+Shift+[` | Previous thread (wraps around) |
| `Cmd+Shift+]` | Next thread (wraps around) |
| `Cmd+1` through `Cmd+9` | Jump to thread by position in the active project |

## Agent shortcuts

Agents defined in `.kiro/` can have custom keyboard shortcuts (e.g., `ctrl+a`, `shift+b`, `ctrl+shift+r`). These toggle the agent on/off — pressing the shortcut when the agent is already active switches back to the default agent.

Agent shortcuts are ignored when focus is in an input, select, or textarea element.

## Thread ordering

- `Cmd+Shift+[` / `]` navigates across all threads: project order first, then most-recent-first within each project.
- `Cmd+1` through `Cmd+9` jumps within the active project only, ordered by creation time (matching the sidebar).

## Chat input shortcuts

These are handled by the chat textarea component, not the global hook:

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Up` | Edit last message (when input is empty) |
| `Cmd+L` | Focus chat input from anywhere |
