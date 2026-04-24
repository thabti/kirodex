# Keyboard shortcuts

Kirodex registers global keyboard shortcuts via the `useKeyboardShortcuts` hook, attached once in `App.tsx`. Shortcuts are ignored when focus is in an `INPUT` or `SELECT` element. The chat textarea handles its own key events separately.

On Windows/Linux, replace Cmd with Ctrl.

| Shortcut | Action |
|---|---|
| Escape | Stop running agent (pause current task). Skipped when terminal has focus. |
| Cmd+, | Open settings |
| Cmd+B | Toggle sidebar collapsed/expanded (App.tsx). Also toggles btw mode in the keyboard shortcuts hook. |
| Cmd+D | Toggle diff panel |
| Cmd+J | Toggle terminal for the active thread |
| Cmd+L | Focus chat input (handled in the ChatInput component) |
| Cmd+W | Close thread (cancel + delete), or dismiss pending workspace if no thread is selected |
| Cmd+Shift+[ | Previous thread (wraps around) |
| Cmd+Shift+] | Next thread (wraps around) |
| Cmd+1 through Cmd+9 | Jump to thread by position in the ordered list |

Thread ordering follows project order first, then most-recent-first within each project.
