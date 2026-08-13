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
| /effort [low\|medium\|high\|xhigh\|max] | Set reasoning depth for subsequent messages in this thread | No (restarts the thread's ACP session) |
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
| /goal \<objective\> | Start an autonomous goal loop (see [goal-mode.md](goal-mode.md)) | No (Rust orchestrator) |
| /goal | Show current goal status or open goal modal | Yes |
| /goal pause | Pause the goal loop after current turn | No (syncs via IPC) |
| /goal resume | Resume a paused goal | No (syncs via IPC) |
| /goal clear | Drop the goal and return to normal chat | No (syncs via IPC) |

## Notes

`/btw` (tangent mode) creates a conversation checkpoint, sends the question to the agent, and displays the response in a floating overlay. Press Escape to dismiss (discards the Q&A from history) or click Keep to preserve it. `/tangent` is an alias. The agent has full context visibility but the exchange is ephemeral by default.

`/plan` is special: it switches the mode optimistically on the client, then syncs with the backend via `ipc.setMode()` and `ipc.sendMessage()`. This means it works even before ACP connects.

`/effort` is handled locally and is never sent to the model as prompt text. Use `/effort` to open the reasoning-effort picker in the chat toolbar, or set a level directly, such as `/effort high`. The selection applies to subsequent messages, is stored per thread, and is reapplied after reconnection or app restart.

- `low`: quick checks and straightforward edits
- `medium`: balanced depth for everyday work
- `high`: more analysis for complex tasks
- `xhigh`: extended analysis for difficult problems
- `max`: deepest analysis for the hardest tasks

Higher levels can take longer. Kiro CLI 2.9 does not expose ACP session configuration options, so Kirodex recreates the idle thread's ACP process with `kiro-cli acp --effort <level>` and replays conversation context on the next prompt. Pause or finish the current turn before changing effort.

`/close` and `/exit` archive the thread instead of deleting it. The conversation is preserved and accessible in a read-only view.

Panel commands (`/model`, `/agent`, `/branch`, `/worktree`) toggle their respective panels; calling the same command again dismisses the panel.
