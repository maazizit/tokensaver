# Changelog

All notable changes to the "TokenSaver" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-11

### Added

- New mascot logo — cat calculating tokens (icon, dashboard, sidebar SVG)
- Market benchmark doc (`docs/MARKET-BENCHMARK.md`) — competitive study vs Eating Token, TokenLens AI, RTK, Caveman
- Marketplace description clarifying zero-setup bundled TokViz and difference from TokGuess

### Changed

- Version bump for first marketplace-ready release of the bundled TokViz stack
- Dashboard header shows mascot image instead of lightning emoji
- README intro and install instructions aligned with v0.4.0

## [0.3.0] - 2026-06-11

### ✨ Added

- **🔋 Fully self-contained — no npm, no global CLI, no buttons**
  - The TokViz CLI is now **bundled inside the extension** (`bundled/cli.bundle.mjs`)
  - Hooks invoke the bundled CLI through VS Code's own Node runtime via `~/.tokviz/cli-path`
  - Works on a fresh machine with zero external dependencies (only `node` on PATH)

- **🤖 Auto-detect agents** — silent hook install for every detected agent
  - Cursor IDE (`~/.cursor` or app name)
  - GitHub Copilot (extension or `~/.copilot/session-state`)
  - Gemini / Antigravity (`~/.gemini`, Antigravity brain paths)
  - Re-checks every 5 minutes for newly installed agents
  - Claude detected → logged; use TokGuess for usage (no TokViz hooks yet)

- **📊 Autonomous dashboard** — reads `~/.tokviz/events.json` directly
  - Live updates via a file watcher (no CLI calls to render stats)
  - Per-agent breakdown, today's savings, compression efficiency bar
  - Real-time status bar: `⚡ -12.6K tokens (10%)`

### Changed

- **Breaking**: Removed the broken `npm install -g tokviz` auto-install flow
  (the public `tokviz` npm name belongs to an unrelated package)
- Removed the "Install TokViz Now" button and prompt-based setup
- Removed obsolete commands (`autoSetup`, `installHooks*`, `doctor`, `compareAgents`)
  and settings (`autoInstall`, `defaultAgent`, `enterpriseMode`, `notifyOnSavings`, `tokvizPath`)
- `Enable Tracking` now runs the bundled CLI instead of a global binary

### Fixed

- Installation no longer fails with `EEXIST` / wrong-package errors
- Detection no longer relies on the non-existent `tokviz --version` command

## [0.2.0] - 2026-06-10

### ✨ Added

- **🚀 Zero-Setup Auto-Installation** — Completely silent installation on first run
  - **No prompts, no buttons, no clicks required**
  - Automatically installs TokViz CLI via npm in background
  - Auto-configures compression hooks for detected AI agent
  - Just install extension and it works — users go from install to savings with 0 manual steps
  
- **Smart Installation Flow**
  - `tokensaver.autoInstall` setting (default: `true`) — enables silent auto-install
  - Automatic retry logic if initial installation fails
  - Graceful fallback to manual install if npm not available
  - One-time installation attempt (won't spam on every launch)
  
- **Dashboard Fallback Button** — If auto-install fails or is disabled
  - "Install TokViz Now" button in empty state
  - Click to trigger manual installation flow

### Changed

- **Breaking (Opt-out vs Opt-in)**: Auto-installation now **enabled by default**
  - Old behavior: Users had to click a button
  - New behavior: Installation happens automatically
  - To disable: Set `tokensaver.autoInstall: false`
  
- Renamed setting: `autoInstallHooks` → `autoInstall` (clearer naming)
- Installation is now silent with progress notification instead of dialog prompts
- `installHooks()` automatically triggers TokViz installation if missing

### Improved

- **UX**: Reduced user friction from 1 click to 0 clicks
- **Onboarding**: First-time experience is now completely seamless
- **Error Handling**: Better messaging when auto-install fails
- **Documentation**: README emphasizes zero-setup installation

### Technical

- Added `checkNpmInstalled()` function
- Added `autoInstallTokviz()` function with progress notifications
- Added `autoSetup()` function for complete one-click setup
- Webview message handling for dashboard button clicks
- Global state tracking for first-time welcome message

## [0.1.3] - 2026-06-10

### Fixed

- **Empty sidebar dashboard** — register `WebviewViewProvider` for `tokensaver.dashboard` (panel was black)
- Empty state message when TokViz has no stats yet

### Removed

- Leftover Wayfind source files (`fiches.ts`, `generate.ts`, `skill.ts`, `tree.ts`)

## [0.1.2] - 2026-06-10

### Added

- **Antigravity CLI support** — `TokenSaver: Install TokViz Compression (Antigravity)` command
- `antigravity` option in `tokensaver.defaultAgent` setting
- Cat-only mascot asset (`media/cat.png`)

### Changed

- Extension icon cropped to cat mascot only (no bag/text — better marketplace display)
- Activity bar SVG simplified to cat silhouette
- README updated with Antigravity CLI installation and requirements

## [0.1.1] - 2026-06-10

### Added

- Official TokenSaver logo (`media/logo.png`) for README and branding
- High-resolution extension icon (`media/icon-256.png`)
- Activity bar icon redesign (`media/tokensaver.svg`) — cat + savings bag silhouette

### Changed

- Extension marketplace icon updated (`media/icon.png`, 128×128 crop of mascot)

## [0.1.0] - 2026-06-10

### 🎉 Initial Release

TokenSaver is born! Visual interface for [TokViz](https://github.com/maazizit/tokviz) compression.

### ✨ Features

- **Visual Dashboard** - Beautiful webview showing token savings with charts
- **One-Click Installation** - Install TokViz compression hooks for Cursor and Copilot
- **Status Bar Widget** - Live savings counter (e.g., "💎 -45.2K tokens (38%)")
- **Multi-Agent Support** - Works with Cursor, GitHub Copilot, and Gemini CLI
- **Doctor Command** - Verify TokViz installation and hooks status
- **Statistics View** - Detailed token usage stats via CLI integration
- **Agent Comparison** - Compare token usage between Cursor and Copilot
- **Enterprise Mode** - Metrics-only tracking without command content logging
- **Automatic Updates** - Status bar refreshes every 30 seconds

### 🎯 Commands

- `TokenSaver: Show Dashboard` - Open visual dashboard
- `TokenSaver: Install TokViz Compression (Cursor)` - Install Cursor hooks
- `TokenSaver: Install TokViz Compression (Copilot)` - Install Copilot hooks
- `TokenSaver: Check Installation` - Run diagnostics
- `TokenSaver: View Statistics` - Show detailed stats
- `TokenSaver: Compare Agents` - Compare Cursor vs Copilot usage

### ⚙️ Configuration

- `tokensaver.tokvizPath` - Path to TokViz CLI (default: "tokviz")
- `tokensaver.defaultAgent` - Default agent (cursor, copilot, or gemini)
- `tokensaver.showStatusBar` - Show/hide status bar widget
- `tokensaver.enterpriseMode` - Enable enterprise mode (no command logging)
- `tokensaver.notifyOnSavings` - Show notifications on large savings
- `tokensaver.autoInstallHooks` - Auto-install hooks on startup

### 📊 What You Get

- **30-70% token savings** on average
- Real-time compression of shell outputs (git diff, npm test, etc.)
- Visual tracking of savings over time
- Comparison across AI agents

### 🔧 Requirements

- VS Code 1.85.0 or higher
- TokViz CLI installed globally (`npm install -g @tokviz/cli`)
- At least one AI agent (Cursor, GitHub Copilot, or Gemini CLI)

### 📚 Documentation

- [README](README.md) - Full documentation
- [QUICKSTART](QUICKSTART.md) - Quick start guide
- [PUBLISH-GUIDE](PUBLISH-GUIDE.md) - How to publish to Marketplace

### 🎯 Transformation from Wayfind

This extension replaces "Wayfind" (documentation cards) with a more practical tool:
- ✅ Daily value for all developers
- ✅ Synergy with TokViz ecosystem
- ✅ Multi-agent support
- ✅ Measurable cost savings

### 🙏 Credits

- Powered by [TokViz](https://github.com/maazizit/tokviz)
- Inspired by [RTK](https://github.com/rtk-ai/rtk) and [Caveman](https://github.com/JuliusBrussee/caveman)
- Built by Zahra Maaziz

---

## Future Plans

### [0.2.0] - Planned

- [ ] Chart.js integration for historical graphs
- [ ] Export reports to PDF/HTML
- [ ] Session-by-session breakdown
- [ ] Integration with TokGuess (real-time monitoring)
- [ ] Custom notification thresholds
- [ ] Team sharing features (optional)

### [0.3.0] - Planned

- [ ] Antigravity CLI support
- [ ] Advanced filtering (by date range, command type)
- [ ] Cost calculator (estimate $ savings)
- [ ] Recommendations engine
- [ ] VS Code walkthrough tutorial

---

[0.1.0]: https://github.com/maazizit/tokensaver/releases/tag/v0.1.0
