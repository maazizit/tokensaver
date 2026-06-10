# Market Benchmark — Token Ecosystem Study

> *Yes, we studied the market. Yes, we took notes. No, we did not copy-paste their READMEs.* 🐱📊

**Author:** Zahra Maaziz · **Date:** June 2026 · **Scope:** AI token tools for VS Code / agent workflows

This document summarizes competitive research behind the **TokenSaver + TokViz + TokGuess** stack. It exists so we (and future contributors) know *why* we built what we built — and where we intentionally differ.

---

## Executive summary

The market splits into three lanes:

| Lane | Question answered | Compresses tokens? |
|------|-------------------|--------------------|
| **Shell compression** | "Can we shrink what the agent reads from terminal output?" | ✅ Yes |
| **Usage tracking** | "How many tokens did I spend?" | ❌ No (observes only) |
| **LLM middleware** | "Can we optimize every request before it hits the model?" | ⚠️ Sometimes (context/routing) |

**Our bet:** most devs need lane 1 *and* lane 2, but almost nobody ships both with zero setup. TokenSaver owns lane 1. TokGuess owns lane 2. Together they cover the full picture.

---

## Tools studied

### 1. [Eating Token](https://github.com/manishsat/eatingtoken) — Copilot usage tracker

**What it does:** Real-time Copilot token consumption + estimated cost. Status bar, dashboard, Jensen $250K/year benchmark, energy/CO2 estimates.

**How:** 4-layer tracking — session watcher (`events.jsonl`), log watcher, chat tracker, completion tracker. Dedup prefers actual counts over estimates.

**Compresses?** ❌ No.

**Closest to us:** **TokGuess** (same lane: "how much am I eating?")

| | Eating Token | TokGuess |
|--|--------------|----------|
| Agents | Copilot-focused | Copilot + Claude + Antigravity |
| Precision | session JSONL + heuristics | OTel precision mode + log watchers |
| Extra | energy/CO2, yearly benchmark | context budget alerts, learning mode |
| Compression | — | — |

**Takeaway:** Solid Copilot tracker. We don't compete — TokGuess goes wider on agents; TokenSaver does something Eating Token doesn't touch (shell compression).

---

### 2. [TokenLens AI](https://marketplace.visualstudio.com/items?itemName=tokenlensai.tokenlens-ai) — LLM middleware

**What it does:** Sits *between* developer and LLM. Task classification, context optimization (strip irrelevant files), smart model routing (Haiku/Sonnet/Opus/GPT-4o), PII warnings, MCP templates, prompt caching.

**How:** Middleware layer on requests — not shell hooks.

**Compresses?** ⚠️ Context/prompt level, not terminal output.

**Closest to us:** Partial overlap on "save money" — different mechanism entirely.

| | TokenLens AI | TokenSaver + TokViz |
|--|--------------|---------------------|
| Intercepts | LLM requests & context files | Shell command output (`git diff`, tests…) |
| Model routing | ✅ | ❌ |
| Agent mode required | No | Yes (hooks fire on agent shell) |
| Zero npm setup | Extension only | Extension bundles TokViz CLI |
| Savings metric | Per-request cost avoided | Per-shell-event tokens saved |

**Takeaway:** Impressive middleware play. Complementary, not a drop-in replacement. TokenLens optimizes *what you send*. TokViz optimizes *what the agent reads back from the terminal*.

---

### 3. [RTK](https://github.com/rtk-ai/rtk) — Rust Token Killer (inspiration)

**What it does:** Shell output compression via IDE hooks. `git diff`, test logs, etc. Inspector extension for savings dashboard.

**Compresses?** ✅ Yes — shell layer.

**Our relation:** TokViz implements the same *pattern* in TypeScript. TokenSaver is our dashboard layer (RTK Inspector equivalent). **Not a dependency** — original code.

---

### 4. [Caveman](https://github.com/JuliusBrussee/caveman) — Prose compression (inspiration)

**What it does:** Terse assistant replies via skills (`/caveman lite|full|ultra`). Token stats via hooks.

**Compresses?** ✅ Yes — prose/chat layer (instructions to model, not runtime transform).

**Our relation:** TokViz `tokviz-compress` skill = same idea, different triggers (`/tokviz`). Optional, not installed by TokenSaver by default.

---

### 5. Other "TokenLens" names (don't mix them up)

| Project | What it actually is |
|---------|---------------------|
| [prarysoft.tokenlens-copilot-insights](https://marketplace.visualstudio.com/items?itemName=prarysoft.tokenlens-copilot-insights) | Copilot/Cursor usage + duplicate pattern detection |
| [tokenlens npm](https://www.npmjs.com/package/tokenlens) | Dev library — context budgeting, cost estimation for AI apps |
| [Sonichigo/tokenlens](https://github.com/Sonichigo/tokenlens) | CLI observability for Claude Code / Codex / Cursor |

Same word, three different products. We studied all three so we wouldn't accidentally pitch TokenSaver as any of them.

---

## Feature matrix (the spreadsheet we actually used)

| Tool | Shell compress | Prose compress | Usage tracking | Model routing | Zero setup | Multi-agent |
|------|:-------------:|:--------------:|:--------------:|:-------------:|:----------:|:-----------:|
| **TokenSaver + TokViz** | ✅ | ⚠️ opt-in skill | via dashboard savings | ❌ | ✅ bundled | Cursor, Copilot, Gemini/AG |
| **TokGuess** | ❌ | ❌ | ✅ | ❌ | ✅ | Copilot, Claude, Antigravity |
| Eating Token | ❌ | ❌ | ✅ | ❌ | ✅ | Copilot |
| TokenLens AI | ⚠️ context | ❌ | ✅ cost | ✅ | ✅ | LLM-agnostic |
| RTK | ✅ | ❌ | ✅ | ❌ | hooks + CLI | Cursor, Copilot |
| Caveman | ❌ | ✅ | ✅ | ❌ | skill install | Cursor |

---

## Gap we fill

After this review, the gap was obvious:

```text
Everyone tracks spending.
Almost nobody auto-compresses shell output with zero user setup.
Nobody ships compression + multi-agent tracking as a clear duo.
```

Hence:

- **TokenSaver** — install one extension → TokViz bundled → hooks auto-installed → shell compressed → dashboard shows savings
- **TokGuess** — separate extension for "how much did I spend?" across Copilot, Claude, Antigravity

---

## Positioning one-liners (for marketplace / pitches)

| vs Eating Token | "Eating Token counts Copilot tokens. TokenSaver **reduces** them — especially shell output in Agent mode." |
| vs TokenLens AI | "TokenLens optimizes LLM requests. TokenSaver compresses terminal output before your agent even parses it." |
| vs RTK | "Same shell-hook idea, TypeScript stack, bundled inside a VS Code extension — no Rust toolchain, no separate install." |
| vs Caveman | "Caveman shortens chat replies. TokViz shortens `git diff`. Different layer, same goal: fewer tokens." |

---

## What we deliberately did NOT build (yet)

| Feature | Who does it well | Our call |
|---------|------------------|----------|
| Model routing (Haiku vs Opus) | TokenLens AI | Out of scope — we're hook-level, not request middleware |
| Energy / CO2 estimates | Eating Token | Fun idea; TokGuess focuses on precision + budget |
| Team cloud dashboard | TokenLens (prarysoft) | Local-first by design — `~/.tokviz/`, no account |
| Claude Code hooks | — | Gap in market; TokGuess tracks, TokViz doesn't compress yet |
| Prompt / file context optimizer | TokenLens AI | Future maybe; shell compression is the sharper MVP |

---

## Methodology (a.k.a. "how we studied the market")

1. **Marketplace scan** — VS Code extensions tagged tokens, AI, Copilot, cost
2. **GitHub scan** — RTK, Caveman, Eating Token, tokenlens variants
3. **Layer mapping** — shell vs prose vs middleware vs tracking
4. **Setup friction test** — does user need npm, hooks manual install, agent mode?
5. **Overlap check** — would TokenSaver + TokGuess duplicate an existing tool end-to-end?

**Conclusion:** No single tool covers bundled shell compression + multi-agent usage tracking with clear separation. That's the stack we ship.

---

## References

- [Eating Token](https://github.com/manishsat/eatingtoken) — MIT, Copilot token tracker
- [TokenLens AI](https://marketplace.visualstudio.com/items?itemName=tokenlensai.tokenlens-ai) — LLM middleware extension
- [RTK](https://github.com/rtk-ai/rtk) — shell compression hooks (Rust)
- [Caveman](https://github.com/JuliusBrussee/caveman) — prose compression skills
- [TokViz](https://github.com/maazizit/tokviz) — our compression engine
- [TokGuess](https://github.com/maazizit/tokguess) — our usage tracker

---

*Document maintained by the TokenSaver team. Updated when we find new competitors worth adding to the spreadsheet — or when someone ships shell compression with a cat mascot. We will notice.* 🐱
