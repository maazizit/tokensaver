# Changelog

All notable changes to the "TokenSaver" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
