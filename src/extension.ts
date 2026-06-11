import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";
import {
  detectActiveAgents,
  detectClaudePresent,
  type TokVizAgent,
} from "./agentDetector";
import {
  calculateCompressionSnapshot,
  calculateEffectiveCompression,
  calculateProjections,
  type CompressionSnapshot,
  type EffectiveCompression,
  type TimeProjection,
} from "./calculator";
import {
  calculateCommandBreakdown,
  type CommandBreakdownRow,
} from "./commandBreakdown";

/**
 * TokenSaver — autonomous token-savings dashboard.
 *
 * TokViz compression runs via bundled CLI + hooks (zero user install).
 * On startup we detect Copilot / Cursor / Gemini-Antigravity and silently
 * run `tokviz init` for each. Stats read live from ~/.tokviz/events.json.
 */

interface TokVizEvent {
  id: string;
  sessionId: string;
  agent: string;
  timestamp: string;
  source: string;
  toolName: string;
  command?: string;
  tokensRaw: number;
  tokensOptimized: number;
  tokensSaved: number;
  metadata?: Record<string, unknown> & { commandType?: string };
}

interface AgentBreakdown {
  agent: string;
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savingsPercent: number;
  events: number;
}

interface TokenStats {
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savingsPercent: number;
  events: number;
  todaySaved: number;
  byAgent: AgentBreakdown[];
  hooks: HookStatus[];
  projections: TimeProjection;
  todayCompression: CompressionSnapshot;
  totalCompression: CompressionSnapshot;
  effectiveCompression: EffectiveCompression;
  todayEffectiveCompression: EffectiveCompression;
  commandBreakdown: CommandBreakdownRow[];
}

interface HookStatus {
  agent: string;
  installed: boolean;
}

const TOKVIZ_DIR = path.join(os.homedir(), ".tokviz");
const EVENTS_PATH = path.join(TOKVIZ_DIR, "events.json");

let statusBarItem: vscode.StatusBarItem;
let dashboardView: vscode.WebviewView | undefined;
let fileWatcher: fs.FSWatcher | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

// ---------------------------------------------------------------------------
// Data layer — read & aggregate TokViz events directly from disk
// ---------------------------------------------------------------------------

function readEvents(): TokVizEvent[] {
  try {
    if (!fs.existsSync(EVENTS_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(EVENTS_PATH, "utf8");
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : parsed.events;
    return Array.isArray(events) ? events : [];
  } catch (error) {
    console.error("TokenSaver: failed to read events.json", error);
    return [];
  }
}

function isToday(timestamp: string): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function detectHooks(): HookStatus[] {
  const checks: Array<{ agent: string; paths: string[] }> = [
    {
      agent: "cursor",
      paths: [
        path.join(os.homedir(), ".cursor", "hooks.json"),
        path.join(TOKVIZ_DIR, "hooks", "cursor"),
      ],
    },
    {
      agent: "copilot",
      paths: [
        path.join(os.homedir(), ".copilot", "hooks", "tokviz-tracker.json"),
        path.join(TOKVIZ_DIR, "hooks", "copilot"),
      ],
    },
    {
      agent: "gemini",
      paths: [
        path.join(os.homedir(), ".gemini", "hooks.json"),
        path.join(TOKVIZ_DIR, "hooks", "gemini"),
      ],
    },
  ];

  return checks.map(({ agent, paths }) => ({
    agent,
    installed: paths.some((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }),
  }));
}

function computeStats(): TokenStats {
  const events = readEvents();

  let rawTokens = 0;
  let optimizedTokens = 0;
  let savedTokens = 0;
  let todaySaved = 0;

  const agentMap = new Map<string, AgentBreakdown>();

  for (const ev of events) {
    const raw = ev.tokensRaw || 0;
    const opt = ev.tokensOptimized || 0;
    const saved = ev.tokensSaved || 0;

    rawTokens += raw;
    optimizedTokens += opt;
    savedTokens += saved;

    if (ev.timestamp && isToday(ev.timestamp)) {
      todaySaved += saved;
    }

    const agent = ev.agent || "unknown";
    const bucket =
      agentMap.get(agent) ||
      {
        agent,
        rawTokens: 0,
        optimizedTokens: 0,
        savedTokens: 0,
        savingsPercent: 0,
        events: 0,
      };
    bucket.rawTokens += raw;
    bucket.optimizedTokens += opt;
    bucket.savedTokens += saved;
    bucket.events += 1;
    agentMap.set(agent, bucket);
  }

  const byAgent = Array.from(agentMap.values())
    .map((b) => ({
      ...b,
      savingsPercent: b.rawTokens > 0 ? (b.savedTokens / b.rawTokens) * 100 : 0,
    }))
    .sort((a, b) => b.savedTokens - a.savedTokens);

  const projectionEvents = events.map((ev) => ({
    timestamp: ev.timestamp,
    tokensSaved: ev.tokensSaved,
    tokensRaw: ev.tokensRaw,
    tokensOptimized: ev.tokensOptimized,
  }));

  const projections = calculateProjections(projectionEvents);
  const todayCompression = calculateCompressionSnapshot(projectionEvents, true);
  const totalCompression = calculateCompressionSnapshot(projectionEvents, false);
  const effectiveCompression = calculateEffectiveCompression(projectionEvents, false);
  const todayEffectiveCompression = calculateEffectiveCompression(projectionEvents, true);
  const shellEvents = events.filter((ev) => ev.source === "shell");
  const commandBreakdown = calculateCommandBreakdown(shellEvents);

  return {
    rawTokens,
    optimizedTokens,
    savedTokens,
    savingsPercent: rawTokens > 0 ? (savedTokens / rawTokens) * 100 : 0,
    events: events.length,
    todaySaved,
    byAgent,
    hooks: detectHooks(),
    projections,
    todayCompression,
    totalCompression,
    effectiveCompression,
    todayEffectiveCompression,
    commandBreakdown,
  };
}

// ---------------------------------------------------------------------------
// UI — status bar + dashboard, both fed from computeStats()
// ---------------------------------------------------------------------------

function updateStatusBar(stats: TokenStats): void {
  const config = vscode.workspace.getConfiguration("tokensaver");
  if (!config.get<boolean>("showStatusBar", true)) {
    statusBarItem.hide();
    return;
  }

  if (stats.savedTokens > 0) {
    const savedK = (stats.savedTokens / 1000).toFixed(1);
    statusBarItem.text = `$(zap) -${savedK}K tokens (${stats.savingsPercent.toFixed(0)}%)`;
    statusBarItem.tooltip = `TokenSaver: ${stats.savedTokens.toLocaleString()} tokens saved · ${stats.events} events`;
  } else {
    const anyHooks = stats.hooks.some((h) => h.installed);
    statusBarItem.text = "$(zap) TokenSaver";
    statusBarItem.tooltip = anyHooks
      ? "TokenSaver: tracking active — savings will appear as you work"
      : "TokenSaver: click to enable token tracking";
  }
  statusBarItem.show();
}

function pushStatsToDashboard(stats: TokenStats): void {
  if (dashboardView) {
    dashboardView.webview.postMessage({ type: "stats", stats });
  }
}

function refresh(): void {
  const stats = computeStats();
  updateStatusBar(stats);
  pushStatsToDashboard(stats);
}

// ---------------------------------------------------------------------------
// Live updates — watch events.json and refresh on change
// ---------------------------------------------------------------------------

function startWatching(context: vscode.ExtensionContext): void {
  try {
    if (!fs.existsSync(TOKVIZ_DIR)) {
      return;
    }
    fileWatcher = fs.watch(TOKVIZ_DIR, (_event, filename) => {
      if (!filename || filename === "events.json") {
        // Debounce rapid successive writes.
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(refresh, 300);
      }
    });
  } catch (error) {
    console.error("TokenSaver: failed to watch ~/.tokviz", error);
  }

  context.subscriptions.push({
    dispose: () => {
      fileWatcher?.close();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Self-contained hook setup — installs the bundled TokViz CLI + agent hooks
// ---------------------------------------------------------------------------

let extensionPath = "";

function bundledCliPath(): string {
  return path.join(extensionPath, "bundled", "cli.bundle.mjs");
}

function bundledRepoRoot(): string {
  return path.join(extensionPath, "bundled");
}

/** Point the installed hook scripts at the bundled CLI (no global install needed). */
function writeCliPath(): void {
  if (!extensionPath || !fs.existsSync(bundledCliPath())) {
    return;
  }
  try {
    fs.mkdirSync(TOKVIZ_DIR, { recursive: true });
    fs.writeFileSync(path.join(TOKVIZ_DIR, "cli-path"), bundledCliPath(), "utf8");
  } catch (error) {
    console.error("TokenSaver: failed to write cli-path", error);
  }
}

/**
 * Runs the bundled CLI's `init` using VS Code's own Node runtime, so no global
 * `tokviz` binary or npm install is required. TOKVIZ_REPO_ROOT points the CLI at
 * the bundled hook scripts shipped inside the extension.
 */
function runBundledInit(agent: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const cli = bundledCliPath();
    if (!fs.existsSync(cli)) {
      resolve({ ok: false, error: "bundled CLI not found" });
      return;
    }
    child_process.execFile(
      process.execPath,
      [cli, "init", "-g", "--agent", agent, "--enterprise"],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          TOKVIZ_REPO_ROOT: bundledRepoRoot(),
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: stderr || error.message });
        } else {
          resolve({ ok: true });
        }
      }
    );
  });
}

async function installTracking(
  agent: string,
  opts: { silent?: boolean } = {}
): Promise<boolean> {
  writeCliPath();
  const result = await runBundledInit(agent);
  refresh();

  if (!result.ok) {
    if (!opts.silent) {
      vscode.window.showWarningMessage(
        `TokenSaver: couldn't enable tracking for ${agent}. ${result.error ?? ""}`.trim()
      );
    }
    return false;
  }

  if (!opts.silent) {
    vscode.window
      .showInformationMessage(
        `TokenSaver: tracking enabled for ${agent}. Reload the window to activate.`,
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
  return true;
}

function installedAgentsKey(agent: TokVizAgent): string {
  return `tokensaver.hooks.${agent}`;
}

async function enableTracking(): Promise<void> {
  const detected = detectActiveAgents();
  const items = detected.map((d) => ({
    label: d.agent,
    description: d.reason,
    agent: d.agent as TokVizAgent,
  }));
  for (const extra of ["cursor", "copilot", "gemini"] as TokVizAgent[]) {
    if (!items.some((i) => i.agent === extra)) {
      items.push({ label: extra, description: "manual", agent: extra });
    }
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Select agent to enable TokViz compression hooks",
  });
  if (!pick) {
    return;
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Enabling compression for ${pick.agent}...`,
      cancellable: false,
    },
    () => installTracking(pick.agent)
  );
}

/**
 * Silent background setup: detect agents (like TokGuess watchers) and install
 * TokViz hooks for each that is not yet configured. No user action required.
 */
async function autoEnableDetectedAgents(
  context: vscode.ExtensionContext
): Promise<void> {
  writeCliPath();

  const hooks = detectHooks();
  const targets = detectActiveAgents();
  let installedAny = false;

  for (const { agent, reason } of targets) {
    const hook = hooks.find((h) => h.agent === agent);
    const marked = context.globalState.get<boolean>(installedAgentsKey(agent));
    if (hook?.installed && marked) {
      continue;
    }

    console.log(`TokenSaver: auto-install TokViz hooks for ${agent} (${reason})`);
    const ok = await installTracking(agent, { silent: true });
    if (ok) {
      await context.globalState.update(installedAgentsKey(agent), true);
      installedAny = true;
    }
  }

  if (installedAny) {
    console.log("TokenSaver: TokViz hooks installed — reload IDE to activate");
  }

  if (detectClaudePresent()) {
    console.log(
      "TokenSaver: Claude detected — use TokGuess for usage; TokViz compression hooks not available yet"
    );
  }
}

// ---------------------------------------------------------------------------
// Dashboard webview
// ---------------------------------------------------------------------------

class DashboardViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    dashboardView = webviewView;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media");
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };
    const catSrc = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, "cat.png")
    );
    webviewView.webview.html = getDashboardHtml(catSrc.toString());

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.type === "enableTracking") {
        vscode.commands.executeCommand("tokensaver.enableTracking");
      } else if (message?.type === "ready") {
        refresh();
      }
    });

    webviewView.onDidDispose(() => {
      if (dashboardView === webviewView) {
        dashboardView = undefined;
      }
    });

    refresh();
  }
}

function getDashboardHtml(catSrc: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TokenSaver</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
    margin: 0;
  }
  .header { text-align: center; padding: 18px 0 14px; }
  .header .mascot { width: 72px; height: 72px; object-fit: contain; }
  .header h1 { margin: 8px 0 2px; font-size: 22px; font-weight: 300; }
  .header p { margin: 0; font-size: 12px; color: var(--vscode-descriptionForeground); }

  .hero {
    margin: 18px 0;
    padding: 18px;
    border-radius: 10px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    text-align: center;
  }
  .hero .big {
    font-size: 40px;
    font-weight: 700;
    color: var(--vscode-charts-green);
    line-height: 1.1;
  }
  .hero .sub { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 14px 0;
  }
  .card {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .card .label {
    font-size: 10px;
    letter-spacing: .6px;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .card .value { font-size: 20px; font-weight: 600; margin-top: 6px; }

  .bar-wrap { margin: 16px 0; }
  .bar-wrap .caption { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
  .bar {
    height: 22px;
    border-radius: 11px;
    background: var(--vscode-input-background);
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border);
  }
  .bar > span {
    display: flex; align-items: center; justify-content: center;
    height: 100%;
    background: linear-gradient(90deg, #2ea043, #56d364);
    color: #fff; font-size: 11px; font-weight: 600;
    transition: width .4s ease;
    white-space: nowrap;
  }

  .agents { margin-top: 18px; }
  .agents h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
    color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
  .agent-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 10px; border-radius: 6px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    margin-bottom: 6px; font-size: 12px;
  }
  .agent-row .name { text-transform: capitalize; font-weight: 600; }
  .agent-row .meta { color: var(--vscode-descriptionForeground); }

  .cmd-section { margin-top: 18px; }
  .cmd-section h3 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
    color: var(--vscode-descriptionForeground); margin: 0 0 8px;
  }
  .cmd-table {
    width: 100%; border-collapse: collapse; font-size: 11px;
  }
  .cmd-table th, .cmd-table td {
    padding: 7px 8px; text-align: left;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .cmd-table th {
    color: var(--vscode-descriptionForeground); font-weight: 600;
    font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
  }
  .cmd-table td.num { text-align: right; font-family: var(--vscode-editor-font-family, monospace); }
  .cmd-table tr.total td {
    font-weight: 700; border-top: 2px solid var(--vscode-panel-border);
  }
  .cmd-table tr.other td { color: var(--vscode-descriptionForeground); }
  .cmd-hint {
    margin-top: 8px; font-size: 10px; line-height: 1.45;
    color: var(--vscode-descriptionForeground);
  }

  .empty {
    text-align: center; padding: 26px 18px; margin: 16px 0;
    border: 1px dashed var(--vscode-panel-border); border-radius: 10px;
    color: var(--vscode-descriptionForeground);
  }
  .empty.hidden, .content.hidden { display: none; }
  .btn {
    margin-top: 14px; padding: 9px 18px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 5px; font-size: 13px; cursor: pointer;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }

  .foot {
    text-align: center; margin-top: 22px; padding-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
    font-size: 10px; color: var(--vscode-descriptionForeground);
  }

  .projections-section {
    margin-top: 18px;
    padding: 14px;
    background: var(--vscode-input-background);
    border-radius: 10px;
    border: 1px solid var(--vscode-panel-border);
  }
  .projections-section .section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 4px;
  }
  .section-subtitle {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 12px;
  }
  .projections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }
  .projection-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px;
    text-align: center;
    transition: border-color .2s ease, background .2s ease;
  }
  .projection-card:hover {
    border-color: var(--vscode-charts-green);
    background: color-mix(in srgb, var(--vscode-charts-green) 8%, var(--vscode-editor-background));
  }
  .projection-card.highlight {
    border-color: var(--vscode-charts-green);
    background: color-mix(in srgb, var(--vscode-charts-green) 12%, var(--vscode-editor-background));
  }
  .projection-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }
  .projection-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--vscode-charts-green);
    margin-bottom: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .projection-unit {
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  .verify-section {
    margin-top: 14px;
    padding: 14px;
    border-radius: 10px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
  }
  .verify-section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 10px;
  }
  .verify-flow {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .verify-box {
    flex: 1 1 120px;
    text-align: center;
    padding: 10px;
    border-radius: 8px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
  }
  .verify-box.opt { border-color: var(--vscode-charts-green); }
  .verify-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
  }
  .verify-value {
    font-size: 17px;
    font-weight: 700;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .verify-box.opt .verify-value { color: var(--vscode-charts-green); }
  .verify-arrow {
    font-size: 18px;
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }
  .verify-summary {
    margin-top: 10px;
    text-align: center;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .verify-summary.active { color: var(--vscode-charts-green); }
  .verify-summary.none { color: var(--vscode-editorWarning-foreground, #cca700); }
</style>
</head>
<body>
  <div class="header">
    <img class="mascot" src="${catSrc}" alt="TokenSaver cat mascot" />
    <h1>TokenSaver</h1>
    <p>Live token savings · updated automatically</p>
  </div>

  <div class="empty hidden" id="empty">
    <h3>No tracking data yet</h3>
    <p id="emptyMsg">Token tracking starts automatically once enabled for your agent.</p>
    <button class="btn" id="enableBtn">Enable Tracking</button>
  </div>

  <div class="content hidden" id="content">
    <div class="hero">
      <div class="big" id="heroSaved">0</div>
      <div class="sub">tokens saved · <span id="heroPercent">0%</span> overall</div>
      <div class="sub" id="heroEffective" style="margin-top:6px;color:var(--vscode-charts-green)"></div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Today</div><div class="value" id="today">0</div></div>
      <div class="card"><div class="label">Events</div><div class="value" id="events">0</div></div>
      <div class="card"><div class="label">Raw (before)</div><div class="value" id="raw">0</div></div>
      <div class="card"><div class="label">Optimized (after)</div><div class="value" id="opt">0</div></div>
    </div>

    <div class="verify-section">
      <h3>Today — compression check</h3>
      <div class="verify-flow">
        <div class="verify-box">
          <div class="verify-label">Raw tokens</div>
          <div class="verify-value" id="todayRaw">0</div>
        </div>
        <div class="verify-arrow">→</div>
        <div class="verify-box opt">
          <div class="verify-label">After compression</div>
          <div class="verify-value" id="todayOpt">0</div>
        </div>
      </div>
      <div class="verify-summary" id="todayVerify">No events today yet.</div>
    </div>

    <div class="bar-wrap">
      <div class="caption">Compression when active</div>
      <div class="bar"><span id="bar" style="width:0%">0%</span></div>
      <div class="caption" id="barHint" style="margin-top:6px"></div>
    </div>

    <div class="projections-section">
      <h3 class="section-title">Projections</h3>
      <p class="section-subtitle">At today's pace, you'll save...</p>
      <div class="projections-grid">
        <div class="projection-card">
          <div class="projection-label">Per day</div>
          <div class="projection-value" id="projDaily">0</div>
          <div class="projection-unit">tokens</div>
        </div>
        <div class="projection-card">
          <div class="projection-label">Per week</div>
          <div class="projection-value" id="projWeekly">0</div>
          <div class="projection-unit">tokens</div>
        </div>
        <div class="projection-card">
          <div class="projection-label">Per month</div>
          <div class="projection-value" id="projMonthly">0</div>
          <div class="projection-unit">tokens</div>
        </div>
        <div class="projection-card highlight">
          <div class="projection-label">Monthly savings</div>
          <div class="projection-value" id="projCost">$0.00</div>
          <div class="projection-unit">per month</div>
        </div>
      </div>
    </div>

    <div class="cmd-section" id="cmdSection">
      <h3>Compression by command</h3>
      <table class="cmd-table" id="cmdTable">
        <thead>
          <tr><th>Command</th><th class="num">Count</th><th class="num">Compress.</th></tr>
        </thead>
        <tbody id="cmdBody"></tbody>
      </table>
      <div class="cmd-hint" id="cmdHint"></div>
    </div>

    <div class="agents" id="agents"></div>
  </div>

  <div class="foot">Reads ~/.tokviz/events.json · 100% local</div>

<script>
  const vscode = acquireVsCodeApi();

  function fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function fmtTokens(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function fmtUsd(amount) {
    const n = Number(amount || 0);
    if (n > 0 && n < 0.01) return '$0.01';
    return '$' + n.toFixed(2);
  }

  document.getElementById('enableBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'enableTracking' });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type !== 'stats') return;
    const s = msg.stats;

    const empty = document.getElementById('empty');
    const content = document.getElementById('content');

    if (!s.events || s.savedTokens <= 0) {
      empty.classList.remove('hidden');
      content.classList.add('hidden');
      const anyHooks = (s.hooks || []).some(h => h.installed);
      document.getElementById('emptyMsg').textContent = anyHooks
        ? 'Compression active — savings appear as your agent runs shell commands.'
        : 'Setting up TokViz compression in background… reload window if hooks just installed.';
      document.getElementById('enableBtn').style.display = anyHooks ? 'none' : '';
      return;
    }

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    document.getElementById('heroSaved').textContent = fmt(s.savedTokens);
    document.getElementById('heroPercent').textContent = s.savingsPercent.toFixed(1) + '%';
    const eff = s.effectiveCompression || {};
    const heroEff = document.getElementById('heroEffective');
    if (eff.activeEvents > 0) {
      heroEff.textContent = eff.compressionPercent.toFixed(1) + '% when compression fires (' +
        eff.activeEvents + '/' + eff.totalEvents + ' shell events)';
    } else {
      heroEff.textContent = '';
    }
    document.getElementById('today').textContent = fmt(s.todaySaved);
    document.getElementById('events').textContent = fmt(s.events);

    const total = s.totalCompression || {};
    document.getElementById('raw').textContent = fmtTokens(total.rawTokens);
    document.getElementById('opt').textContent = fmtTokens(total.optimizedTokens);

    const today = s.todayCompression || {};
    document.getElementById('todayRaw').textContent = fmtTokens(today.rawTokens);
    document.getElementById('todayOpt').textContent = fmtTokens(today.optimizedTokens);
    const verify = document.getElementById('todayVerify');
    if (!today.events) {
      verify.textContent = 'No events today yet.';
      verify.className = 'verify-summary';
    } else if (today.savedTokens > 0) {
      verify.textContent = fmtTokens(today.savedTokens) + ' saved today · ' +
        today.compressionPercent.toFixed(1) + '% compression · ' + today.events + ' events';
      verify.className = 'verify-summary active';
    } else {
      verify.textContent = 'No compression today — raw equals optimized (' + today.events + ' events)';
      verify.className = 'verify-summary none';
    }

    const bar = document.getElementById('bar');
    const barHint = document.getElementById('barHint');
    const barPct = eff.activeEvents > 0 ? eff.compressionPercent : s.savingsPercent;
    const pct = Math.max(0, Math.min(100, barPct));
    bar.style.width = pct + '%';
    bar.textContent = pct.toFixed(0) + '%';
    barHint.textContent = eff.activeEvents > 0
      ? 'Overall ' + s.savingsPercent.toFixed(1) + '% includes short outputs left unchanged.'
      : 'Verbose shell output (git diff, tests, logs) compresses more — keep working.';

    const p = s.projections || {};
    document.getElementById('projDaily').textContent = fmtTokens(p.dailyTokens);
    document.getElementById('projWeekly').textContent = fmtTokens(p.weeklyTokens);
    document.getElementById('projMonthly').textContent = fmtTokens(p.monthlyTokens);
    document.getElementById('projCost').textContent = fmtUsd(p.monthlyCostSavedUSD);

    const cmdBody = document.getElementById('cmdBody');
    const cmdHint = document.getElementById('cmdHint');
    const breakdown = (s.commandBreakdown || []).filter(r => r.command !== 'TOTAL');
    const totalRow = (s.commandBreakdown || []).find(r => r.command === 'TOTAL');
    if (breakdown.length) {
      const rowsHtml = breakdown.map(r => {
        const cls = r.command === 'other' ? ' class="other"' : '';
        return '<tr' + cls + '><td>' + r.command + '</td><td class="num">' + r.count +
          '</td><td class="num">' + r.compressionPercent.toFixed(1) + '%</td></tr>';
      }).join('');
      const totalHtml = totalRow
        ? '<tr class="total"><td>TOTAL</td><td class="num">' + totalRow.count +
          '</td><td class="num">' + totalRow.compressionPercent.toFixed(1) + '%</td></tr>'
        : '';
      cmdBody.innerHTML = rowsHtml + totalHtml;

      const other = breakdown.find(r => r.command === 'other');
      const specialized = breakdown.filter(r => r.command !== 'other');
      const specializedPct = specialized.reduce((n, r) => n + r.count, 0);
      const otherPct = totalRow && totalRow.count > 0
        ? Math.round((other?.count || 0) / totalRow.count * 100)
        : 0;
      if (other && other.count > 0 && specialized.length > 0) {
        cmdHint.textContent = 'Strong compressors (git, tests, logs) work well. ' +
          otherPct + '% of events are short/other commands with little to compress. ' +
          'Add kubectl, aws, grep compressors to raise global rate.';
      } else if (!specialized.length) {
        cmdHint.textContent = 'Command names were not logged on older events — reload after update; new shell runs will populate this table.';
      } else {
        cmdHint.textContent = 'Per-command rate uses raw vs optimized tokens for each shell event.';
      }
    } else {
      cmdBody.innerHTML = '';
      cmdHint.textContent = 'No shell events yet.';
    }

    const agents = document.getElementById('agents');
    const rows = (s.byAgent || []).filter(a => a.events > 0);
    if (rows.length) {
      agents.innerHTML = '<h3>By agent</h3>' + rows.map(a =>
        '<div class="agent-row"><span class="name">' + a.agent + '</span>' +
        '<span class="meta">' + fmt(a.savedTokens) + ' saved · ' +
        a.savingsPercent.toFixed(0) + '%</span></div>'
      ).join('');
    } else {
      agents.innerHTML = '';
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  console.log("TokenSaver extension activated");

  extensionPath = context.extensionPath;
  // Keep installed hooks pointed at this version's bundled CLI.
  writeCliPath();

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "tokensaver.showDashboard";
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "tokensaver.dashboard",
      new DashboardViewProvider(context.extensionUri)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tokensaver.showDashboard", () => {
      vscode.commands.executeCommand("tokensaver.dashboard.focus");
    }),
    vscode.commands.registerCommand("tokensaver.enableTracking", enableTracking),
    vscode.commands.registerCommand("tokensaver.refresh", refresh)
  );

  // React to relevant configuration changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tokensaver")) {
        refresh();
      }
    })
  );

  startWatching(context);

  // Silent TokViz setup: detect Copilot / Cursor / Gemini-Antigravity, install hooks.
  void autoEnableDetectedAgents(context);

  // Re-check every 5 min in case user installs a new agent later.
  const agentRecheck = setInterval(() => {
    void autoEnableDetectedAgents(context);
  }, 300_000);
  context.subscriptions.push({ dispose: () => clearInterval(agentRecheck) });

  // Lightweight periodic safety refresh (in case the watcher misses an event).
  const interval = setInterval(refresh, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  refresh();
}

export function deactivate(): void {
  fileWatcher?.close();
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  statusBarItem?.dispose();
}
