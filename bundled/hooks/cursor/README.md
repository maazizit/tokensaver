# Cursor hooks

Installed by `tokviz init -g --agent cursor` into `~/.cursor/hooks.json`.

Events:
- `preToolUse` (Shell) — track shell commands
- `afterShellExecution` — compress + track output
- `afterAgentResponse` — track response tokens

Restart Cursor after `init`.
