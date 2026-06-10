#!/usr/bin/env bash
# TokViz hook for Cursor — fail-open, never block agent
set -euo pipefail

export TOKVIZ_AGENT=cursor

# Prefer global install; fallback to extension-bundled CLI / npx / local dev
if command -v tokviz >/dev/null 2>&1; then
  tokviz hook
elif [ -f "$HOME/.tokviz/cli-path" ] && command -v node >/dev/null 2>&1; then
  node "$(cat "$HOME/.tokviz/cli-path")" hook
elif command -v pnpm >/dev/null 2>&1 && [ -f "$HOME/.tokviz/dev-cli" ]; then
  node "$HOME/.tokviz/dev-cli" hook
else
  npx --yes @tokviz/cli@0.1.0 hook 2>/dev/null || echo '{"continue":true}'
fi
