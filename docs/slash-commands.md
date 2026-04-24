# Slash commands

Slash commands are typed in the chat input and matched via fuzzy search. The `useSlashAction` hook processes them and returns `{ handled: boolean }` so the caller knows whether to pass the input through to the agent.

Unknown commands return `handled: false` and are forwarded to ACP as regular messages.

| Command | Action | Client-side only? |
|---|---|---|
| /btw \<question\> | Ask a side question in an overlay without polluting conversation history | No (sends via ACP) |
| /btw tail | Exit btw mode and keep the Q&A in conversation | Yes |
| /tangent | Alias for /btw | — |
| /clear | Clear all messages in the current thread | Yes |
| /model | Open model picker panel | Yes |
| /agent | Open agent picker panel | Yes |
| /settings | Open settings panel | Yes |
| /upload | Trigger file upload dialog | Yes |
| /usage | Switch to analytics dashboard view | Yes |
| /data | Alias for /usage | Yes |
| /plan | Toggle plan mode (switches between `kiro_planner` and `kiro_default`) | No (syncs via IPC) |
| /close or /exit | Archive current thread (preserves history in read-only view) | Yes |
| /fork | Fork current thread into a new conversation | Yes |
| /branch | Open branch picker panel | Yes |
| /worktree | Open worktree creation panel | Yes |

## Notes

`/btw` (tangent mode) creates a conversation checkpoint, sends the question to the agent, and displays the response in a floating overlay. Press Escape to dismiss (discards the Q&A from history) or click Keep to preserve it. `/tangent` is an alias. The agent has full context visibility but the exchange is ephemeral by default.

`/plan` is special: it switches the mode optimistically on the client, then syncs with the backend via `ipc.setMode()` and `ipc.sendMessage()`. This means it works even before ACP connects.

`/close` and `/exit` archive the thread instead of deleting it. The conversation is preserved and accessible in a read-only view.

Panel commands (`/model`, `/agent`, `/branch`, `/worktree`) toggle their respective panels; calling the same command again dismisses the panel.
