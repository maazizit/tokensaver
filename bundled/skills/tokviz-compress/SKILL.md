---
name: tokviz-compress
description: >
  Terse response mode to reduce assistant token usage. Levels: lite, full, ultra.
  Trigger: /tokviz, /tokviz lite, /tokviz ultra. Inspired by Caveman — prose only, no proxy.
---

# TokViz Compress (prose mode)

Reduce tokens in assistant responses. **Does not intercept data** — instructions only.

## Levels

| Level | Trigger | Effect |
|-------|---------|--------|
| off | default | Normal responses |
| lite | `/tokviz lite` | Drop filler, keep full sentences |
| full | `/tokviz` | Short, direct answers. No hedging. Code-only on code tasks |
| ultra | `/tokviz ultra` | Maximum compression. Fragments OK |

## Rules (full mode)

- Drop articles and filler (just, really, basically, sure, happy to)
- Keep technical terms, code, errors exact
- Code blocks unchanged
- Pattern: `[thing] [action] [reason]. [next step].`
- On code tasks: output code only unless user asks to explain

## Auto-clarity

Resume normal prose for: security warnings, irreversible actions, user confusion.

## Stop

Say "stop tokviz" or "normal mode" to revert.
