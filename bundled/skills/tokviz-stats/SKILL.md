---
name: tokviz-stats
description: >
  Show local token usage stats from ~/.tokviz. Trigger: /tokviz-stats.
  User should run `tokviz gain` or `tokviz stats` in terminal for live numbers.
---

# TokViz Stats

When user asks for token stats, run in terminal:

```bash
tokviz gain
tokviz stats --json
```

Data is stored locally in `~/.tokviz/events.json`. No cloud sync.

For enterprise mode (`tokviz init --enterprise`), command content is not logged — metrics only.
