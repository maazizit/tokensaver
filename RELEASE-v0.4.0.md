# Release v0.4.0 — TokenSaver

**Date:** 2026-06-11 · **Publisher:** maazizit

## What's in this release

First marketplace-ready build of TokenSaver with bundled TokViz:

- Zero-setup — install extension only, TokViz hooks auto-installed
- Auto-detects Cursor, Copilot, Gemini/Antigravity
- Shell output compression in Agent mode (`git diff`, tests, `grep`…)
- Live dashboard + status bar from `~/.tokviz/events.json`
- New cat-calculating-tokens mascot

## Package

```bash
cd tokensaver
npm install
npm run package
# → tokensaver-0.4.0.vsix
```

## Install locally

```bash
code --install-extension tokensaver-0.4.0.vsix
```

Reload VS Code. Use Agent mode. Check sidebar **TokenSaver**.

## Publish to VS Code Marketplace

```bash
# One-time: create PAT at https://dev.azure.com → Marketplace (Manage)
vsce login maazizit

# Publish
npm run package
vsce publish
```

## Verify before publish

- [ ] `npm run compile` passes
- [ ] `bundled/cli.bundle.mjs` present
- [ ] Icon `media/icon.png` (128×128)
- [ ] Reload IDE → hooks install silently
- [ ] Agent runs shell command → dashboard shows savings
- [ ] `vsce ls` shows no secrets or `src/` leaks

## Links

- Repo: https://github.com/maazizit/tokensaver
- TokViz: https://github.com/maazizit/tokviz
- Market study: docs/MARKET-BENCHMARK.md
