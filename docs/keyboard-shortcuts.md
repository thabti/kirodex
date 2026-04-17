# Keyboard shortcuts

Kirodex registers global keyboard shortcuts via the `useKeyboardShortcuts` hook, attached once in `App.tsx`. Shortcuts are ignored when focus is in an `INPUT` or `SELECT` element. The chat textarea handles its own key events separately.

On Windows/Linux, replace Cmd with Ctrl.

| Shortcut | Action |
|---|---|
| Escape | Stop running agent (pause current task) |
| Cmd+, | Open settings |
| Cmd+B | Toggle btw mode (exit if active, prefill /btw if not) |
| Cmd+J | Toggle terminal for the active thread |
| Cmd+D | Toggle diff panel |
| Cmd+O | New project |
| Cmd+N | New thread in the current project (or the first project if none selected) |
| Cmd+W | Close thread (cancel + delete), or dismiss pending workspace if no thread is selected |
| Cmd+Shift+[ | Previous thread (wraps around) |
| Cmd+Shift+] | Next thread (wraps around) |
| Cmd+1 through Cmd+9 | Jump to thread by position in the ordered list |
| Cmd+L | Focus chat input (handled in the ChatInput component) |

Thread ordering follows project order first, then most-recent-first within each project.
