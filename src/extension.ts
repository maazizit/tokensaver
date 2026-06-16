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
  filterEventsSince,
} from "./calculator";
import {
  buildAllPeriodStats,
  type DashboardPeriod,
  type PeriodStats,
} from "./periodStats";
import { validateEventsFile } from "./validation";
import type { TokVizEvent } from "./types";

/**
 * TokenSaver — autonomous token-savings dashboard.
 *
 * TokViz compression runs via bundled CLI + hooks (zero user install).
 * On startup we detect Copilot / Cursor / Gemini-Antigravity and silently
 * run `tokviz init` for each. Stats read live from ~/.tokviz/events.json.
 */

interface TokenStats {
  periods: Record<DashboardPeriod, PeriodStats>;
  defaultPeriod: DashboardPeriod;
  hooks: HookStatus[];
  versionCompression: ReturnType<typeof calculateCompressionSnapshot>;
  versionEffectiveCompression: ReturnType<typeof calculateEffectiveCompression>;
  versionLabel: string;
  /** @deprecated use periods.today */
  todaySaved: number;
  /** @deprecated use periods.all */
  savedTokens: number;
  /** @deprecated use periods.today.compression */
  todayCompression: ReturnType<typeof calculateCompressionSnapshot>;
  /** @deprecated use periods.all.compression */
  savingsPercent: number;
  events: number;
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
    // Use validation to ensure data integrity
    return validateEventsFile(parsed);
  } catch (error) {
    console.error("TokenSaver: failed to read events.json", error);
    return [];
  }
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
  const periods = buildAllPeriodStats(events);

  const projectionEvents = events.map((ev) => ({
    timestamp: ev.timestamp,
    tokensSaved: ev.tokensSaved,
    tokensRaw: ev.tokensRaw,
    tokensOptimized: ev.tokensOptimized,
  }));

  const versionEvents = filterEventsSince(projectionEvents, metricsBaselineAt);
  const allSaved = periods.all.savedTokens;
  const allRaw = periods.all.compression.rawTokens;

  return {
    periods,
    defaultPeriod: dashboardPeriod,
    hooks: detectHooks(),
    versionCompression: calculateCompressionSnapshot(versionEvents, false),
    versionEffectiveCompression: calculateEffectiveCompression(versionEvents, false),
    versionLabel: `v${extensionVersion}`,
    todaySaved: periods.today.savedTokens,
    savedTokens: allSaved,
    todayCompression: periods.today.compression,
    savingsPercent:
      allRaw > 0 ? (periods.all.compression.savedTokens / allRaw) * 100 : 0,
    events: events.length,
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
    const todayPct = stats.todayCompression.compressionPercent.toFixed(0);
    statusBarItem.text = `$(zap) -${savedK}K · today ${todayPct}%`;
    statusBarItem.tooltip =
      `TokenSaver ${stats.versionLabel}: today ${todayPct}% · ` +
      `${stats.versionCompression.compressionPercent.toFixed(0)}% since update · ` +
      `${stats.savedTokens.toLocaleString()} tokens saved total`;
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
let metricsBaselineAt: string | undefined;
let extensionVersion = "0.0.0";
let dashboardPeriod: DashboardPeriod = "today";
let extensionContext: vscode.ExtensionContext | undefined;

function ensureCompressionConfig(): void {
  const configPath = path.join(TOKVIZ_DIR, "config.json");
  const defaults = {
    enterpriseMode: false,
    noContentLog: false,
    trackOnly: false,
    retentionDays: 90,
  };
  let config: Record<string, unknown> = { ...defaults };
  try {
    if (fs.existsSync(configPath)) {
      config = { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
    }
    config.enterpriseMode = false;
    config.noContentLog = false;
    config.trackOnly = false;
    fs.mkdirSync(TOKVIZ_DIR, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    console.error("TokenSaver: failed to normalize tokviz config", error);
  }
}

function setupMetricsBaseline(context: vscode.ExtensionContext): void {
  extensionVersion = context.extension.packageJSON.version ?? "0.0.0";
  const key = "tokensaver.metricsBaseline";
  const stored = context.globalState.get<{ version: string; at: string }>(key);
  if (!stored || stored.version !== extensionVersion) {
    metricsBaselineAt = new Date().toISOString();
    void context.globalState.update(key, {
      version: extensionVersion,
      at: metricsBaselineAt,
    });
  } else {
    metricsBaselineAt = stored.at;
  }
}

async function resetMetricsBaseline(context: vscode.ExtensionContext): Promise<void> {
  metricsBaselineAt = new Date().toISOString();
  await context.globalState.update("tokensaver.metricsBaseline", {
    version: extensionVersion,
    at: metricsBaselineAt,
  });
  refresh();
  vscode.window.showInformationMessage(
    `TokenSaver: metrics reset — dashboard now tracks from v${extensionVersion} only.`
  );
}

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

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getProseMode(): string {
  return vscode.workspace.getConfiguration("tokensaver").get<string>("proseMode", "full");
}

/**
 * Runs the bundled CLI's `init` using VS Code's own Node runtime, so no global
 * `tokviz` binary or npm install is required. TOKVIZ_REPO_ROOT points the CLI at
 * the bundled hook scripts shipped inside the extension.
 */
function runBundledInit(
  agent: string,
  opts: { prose?: string; workspace?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const cli = bundledCliPath();
    if (!fs.existsSync(cli)) {
      resolve({ ok: false, error: "bundled CLI not found" });
      return;
    }

    const prose = opts.prose ?? getProseMode();
    const workspace = opts.workspace ?? getWorkspaceRoot();
    const args = [cli, "init", "-g", "--agent", agent];
    if (prose && prose !== "off") {
      args.push("--prose", prose);
      if (workspace) {
        args.push("--workspace", workspace);
      }
    }

    child_process.execFile(
      process.execPath,
      args,
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

function runBundledAuditMcp(workspace?: string): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const cli = bundledCliPath();
    if (!fs.existsSync(cli)) {
      resolve({ ok: false, error: "bundled CLI not found" });
      return;
    }
    const args = [cli, "audit-mcp"];
    const root = workspace ?? getWorkspaceRoot();
    if (root) {
      args.push("--workspace", root);
    }
    child_process.execFile(
      process.execPath,
      args,
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          TOKVIZ_REPO_ROOT: bundledRepoRoot(),
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: stderr || error.message });
        } else {
          resolve({ ok: true, output: stdout });
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

async function enableProseMode(): Promise<void> {
  const targets = detectActiveAgents();
  const agents =
    targets.length > 0
      ? targets.map((t) => t.agent)
      : (["cursor", "copilot"] as TokVizAgent[]);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing terse output rules…",
      cancellable: false,
    },
    async () => {
      for (const agent of agents) {
        await runBundledInit(agent, { prose: "full" });
      }
    }
  );

  vscode.window.showInformationMessage(
    "TokenSaver: prose rules installed. Reload the window to apply."
  );
}

async function auditMcp(): Promise<void> {
  const result = await runBundledAuditMcp();
  if (!result.ok) {
    vscode.window.showWarningMessage(
      `TokenSaver: MCP audit failed. ${result.error ?? ""}`.trim()
    );
    return;
  }
  const doc = await vscode.workspace.openTextDocument({
    content: result.output ?? "No MCP servers found.",
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function maybeAuditMcpOnStartup(): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration("tokensaver")
    .get<boolean>("auditMcpOnStartup", true);
  if (!enabled) return;
  const result = await runBundledAuditMcp();
  if (!result.ok || !result.output) return;
  if (result.output.includes("No MCP servers detected")) return;
  if (!result.output.includes("Estimated overhead")) return;
  const match = result.output.match(/~\d[\d,]*/);
  if (!match) return;
  const tokens = match[0];
  vscode.window.showInformationMessage(
    `TokenSaver: MCP overhead ~${tokens} tokens/step. Run "Audit MCP Servers" for details.`
  );
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
      } else if (message?.type === "enableProseMode") {
        vscode.commands.executeCommand("tokensaver.enableProseMode");
      } else if (message?.type === "auditMcp") {
        vscode.commands.executeCommand("tokensaver.auditMcp");
      } else if (message?.type === "setPeriod") {
        const period = message.period as DashboardPeriod;
        if (period === "today" || period === "yesterday" || period === "7d" || period === "30d" || period === "all") {
          dashboardPeriod = period;
          void extensionContext?.globalState.update("tokensaver.dashboardPeriod", period);
        }
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

  .alert-banner {
    margin: 12px 0;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--vscode-inputValidation-warningBorder, #cca700);
    background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #cca700) 15%, transparent);
    font-size: 12px;
    line-height: 1.4;
  }
  .alert-banner.action {
    border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, #f14c4c) 12%, transparent);
  }
  .alert-banner button {
    margin-top: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-size: 11px;
  }

  .period-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 14px;
  }
  .period-tab {
    flex: 1 1 auto;
    min-width: 58px;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s, border-color .15s, color .15s;
  }
  .period-tab:hover {
    border-color: var(--vscode-charts-green);
  }
  .period-tab.active {
    background: color-mix(in srgb, var(--vscode-charts-green) 18%, var(--vscode-input-background));
    border-color: var(--vscode-charts-green);
    color: var(--vscode-charts-green);
  }
  .period-tab .tab-count {
    display: block;
    font-size: 9px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }
  .period-tab.active .tab-count { color: var(--vscode-charts-green); }

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
    <nav class="period-tabs" id="periodTabs" aria-label="Time period">
      <button type="button" class="period-tab active" data-period="today">Today<span class="tab-count" data-count="today"></span></button>
      <button type="button" class="period-tab" data-period="yesterday">Yesterday<span class="tab-count" data-count="yesterday"></span></button>
      <button type="button" class="period-tab" data-period="7d">7 days<span class="tab-count" data-count="7d"></span></button>
      <button type="button" class="period-tab" data-period="30d">30 days<span class="tab-count" data-count="30d"></span></button>
      <button type="button" class="period-tab" data-period="all">All time<span class="tab-count" data-count="all"></span></button>
    </nav>

    <div class="hero">
      <div class="big" id="heroSaved">0</div>
      <div class="sub">tokens saved · <span id="heroPercent">0%</span> <span id="heroPeriodLabel">today</span></div>
      <div class="sub" id="heroEffective" style="margin-top:6px;color:var(--vscode-charts-green)"></div>
    </div>

    <div id="alerts"></div>

    <div class="grid">
      <div class="card"><div class="label" id="gridEventsLabel">Events</div><div class="value" id="periodEvents">0</div></div>
      <div class="card"><div class="label">Compression</div><div class="value" id="periodPct">0%</div></div>
      <div class="card"><div class="label">Raw (before)</div><div class="value" id="periodRaw">0</div></div>
      <div class="card"><div class="label">Optimized (after)</div><div class="value" id="periodOpt">0</div></div>
    </div>

    <div class="verify-section">
      <h3 id="verifyTitle">Period — compression check</h3>
      <div class="verify-flow">
        <div class="verify-box">
          <div class="verify-label">Raw tokens</div>
          <div class="verify-value" id="verifyRaw">0</div>
        </div>
        <div class="verify-arrow">→</div>
        <div class="verify-box opt">
          <div class="verify-label">After compression</div>
          <div class="verify-value" id="verifyOpt">0</div>
        </div>
      </div>
      <div class="verify-summary" id="verifySummary">No events in this period.</div>
    </div>

    <div class="bar-wrap">
      <div class="caption">Compression when active</div>
      <div class="bar"><span id="bar" style="width:0%">0%</span></div>
      <div class="caption" id="barHint" style="margin-top:6px"></div>
    </div>

    <div class="projections-section">
      <h3 class="section-title">Projections</h3>
      <p class="section-subtitle" id="projSubtitle">At today's pace, you'll save...</p>
      <div class="projections-grid">
        <div class="projection-card">
          <div class="projection-label">Avg / day</div>
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
          <div class="projection-unit">estimated</div>
        </div>
      </div>
    </div>

    <div class="cmd-section" id="cmdSection">
      <h3 id="cmdTitle">Compression by command</h3>
      <table class="cmd-table" id="cmdTable">
        <thead>
          <tr><th>Command</th><th class="num">Count</th><th class="num">Compress.</th></tr>
        </thead>
        <tbody id="cmdBody"></tbody>
      </table>
      <div class="cmd-hint" id="cmdHint"></div>
    </div>

    <div class="verify-section" id="versionSection">
      <h3>Since <span id="versionLabel">update</span></h3>
      <div class="verify-flow">
        <div class="verify-box">
          <div class="verify-label">Raw tokens</div>
          <div class="verify-value" id="versionRaw">0</div>
        </div>
        <div class="verify-arrow">→</div>
        <div class="verify-box opt">
          <div class="verify-label">After compression</div>
          <div class="verify-value" id="versionOpt">0</div>
        </div>
      </div>
      <div class="verify-summary" id="versionVerify">Waiting for shell events after update.</div>
    </div>

    <div class="agents" id="agents"></div>
  </div>

  <div class="foot">Reads ~/.tokviz/events.json · 100% local</div>

<script>
  const vscode = acquireVsCodeApi();
  let latestStats = null;
  let selectedPeriod = 'today';

  function fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n || 0));
  }

  function fmtTokens(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function fmtUsd(amount) {
    const n = Number(amount || 0);
    if (n > 0 && n < 0.01) return '$0.01';
    return '$' + n.toFixed(2);
  }

  function renderPeriod(period) {
    if (!latestStats || !latestStats.periods) return;
    selectedPeriod = period;
    const p = latestStats.periods[period];
    if (!p) return;

    document.querySelectorAll('.period-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-period') === period);
    });

    const comp = p.compression || {};
    const eff = p.effective || {};
    const proj = p.projections || {};

    document.getElementById('heroSaved').textContent = fmt(p.savedTokens);
    document.getElementById('heroPercent').textContent = comp.compressionPercent.toFixed(1) + '%';
    document.getElementById('heroPeriodLabel').textContent = p.label.toLowerCase();

    const heroEff = document.getElementById('heroEffective');
    if (eff.activeEvents > 0) {
      heroEff.textContent = eff.compressionPercent.toFixed(1) + '% when compression fires (' +
        eff.activeEvents + '/' + eff.totalEvents + ' events)';
    } else if (comp.events > 0) {
      heroEff.textContent = comp.events + ' event(s) — mostly short outputs with little to compress.';
    } else {
      heroEff.textContent = 'No activity in this period yet.';
    }

    document.getElementById('periodEvents').textContent = fmt(comp.events);
    document.getElementById('periodPct').textContent = comp.compressionPercent.toFixed(1) + '%';
    document.getElementById('periodRaw').textContent = fmtTokens(comp.rawTokens);
    document.getElementById('periodOpt').textContent = fmtTokens(comp.optimizedTokens);

    document.getElementById('verifyTitle').textContent = p.label + ' — compression check';
    document.getElementById('verifyRaw').textContent = fmtTokens(comp.rawTokens);
    document.getElementById('verifyOpt').textContent = fmtTokens(comp.optimizedTokens);
    const verify = document.getElementById('verifySummary');
    if (!comp.events) {
      verify.textContent = 'No events in this period.';
      verify.className = 'verify-summary';
    } else if (comp.savedTokens > 0) {
      verify.textContent = fmtTokens(comp.savedTokens) + ' saved · ' +
        comp.compressionPercent.toFixed(1) + '% · ' + comp.events + ' events';
      verify.className = 'verify-summary active';
    } else {
      verify.textContent = 'No compression in this period (' + comp.events + ' events).';
      verify.className = 'verify-summary none';
    }

    const barPct = eff.activeEvents > 0 ? eff.compressionPercent : comp.compressionPercent;
    const pct = Math.max(0, Math.min(100, barPct));
    const bar = document.getElementById('bar');
    bar.style.width = pct + '%';
    bar.textContent = pct.toFixed(0) + '%';
    document.getElementById('barHint').textContent = eff.activeEvents > 0
      ? p.label + ': ' + eff.compressionPercent.toFixed(1) + '% on ' + eff.activeEvents + ' compressed events.'
      : (comp.events > 0
        ? 'Run verbose shell via agent (git diff, tests, logs) to see higher rates.'
        : 'Switch period tabs to explore your history.');

    document.getElementById('projSubtitle').textContent = proj.subtitle || '';
    document.getElementById('projDaily').textContent = fmtTokens(proj.dailyAvg);
    document.getElementById('projWeekly').textContent = fmtTokens(proj.weeklyEst);
    document.getElementById('projMonthly').textContent = fmtTokens(proj.monthlyEst);
    document.getElementById('projCost').textContent = fmtUsd(proj.monthlyCostUSD);

    document.getElementById('cmdTitle').textContent = 'Compression by command — ' + p.label.toLowerCase();

    const cmdBody = document.getElementById('cmdBody');
    const cmdHint = document.getElementById('cmdHint');
    const breakdown = (p.commandBreakdown || []).filter(r => r.command !== 'TOTAL');
    const totalRow = (p.commandBreakdown || []).find(r => r.command === 'TOTAL');
    if (breakdown.length) {
      cmdBody.innerHTML = breakdown.map(r => {
        const cls = r.command === 'other' ? ' class="other"' : '';
        return '<tr' + cls + '><td>' + r.command + '</td><td class="num">' + r.count +
          '</td><td class="num">' + r.compressionPercent.toFixed(1) + '%</td></tr>';
      }).join('') + (totalRow
        ? '<tr class="total"><td>TOTAL</td><td class="num">' + totalRow.count +
          '</td><td class="num">' + totalRow.compressionPercent.toFixed(1) + '%</td></tr>'
        : '');
      cmdHint.textContent = breakdown.length
        ? 'Per-command rate for shell events in ' + p.label.toLowerCase() + '.'
        : '';
    } else {
      cmdBody.innerHTML = '';
      cmdHint.textContent = 'No shell events in ' + p.label.toLowerCase() + '.';
    }

    const agents = document.getElementById('agents');
    const rows = (p.byAgent || []).filter(a => a.events > 0);
    agents.innerHTML = rows.length
      ? '<h3>By agent — ' + p.label.toLowerCase() + '</h3>' + rows.map(a =>
        '<div class="agent-row"><span class="name">' + a.agent + '</span>' +
        '<span class="meta">' + fmt(a.savedTokens) + ' saved · ' +
        a.savingsPercent.toFixed(0) + '%</span></div>'
      ).join('')
      : '';

    const alerts = document.getElementById('alerts');
    const alertParts = [];
    if ((p.proseRatio || 0) > 40) {
      alertParts.push(
        '<div class="alert-banner action"><strong>High prose (' + p.proseRatio.toFixed(0) + '%)</strong><br>' +
        'Assistant replies dominate this period. Enable terse output rules.' +
        '<br><button data-action="enableProse">Enable prose compression</button></div>'
      );
    }
    if ((p.mcpRatio || 0) > 25) {
      alertParts.push(
        '<div class="alert-banner action"><strong>High MCP (' + p.mcpRatio.toFixed(0) + '%)</strong><br>' +
        'MCP outputs are heavy in this period.' +
        '<br><button data-action="auditMcp">Run MCP audit</button></div>'
      );
    }
    alerts.innerHTML = alertParts.join('');
  }

  function updateTabCounts(stats) {
    const periods = stats.periods || {};
    document.querySelectorAll('[data-count]').forEach((el) => {
      const key = el.getAttribute('data-count');
      const saved = periods[key]?.savedTokens || 0;
      el.textContent = saved > 0 ? fmt(saved) + ' saved' : '0 events';
    });
  }

  function renderVersion(s) {
    const version = s.versionCompression || {};
    const versionEff = s.versionEffectiveCompression || {};
    document.getElementById('versionLabel').textContent = s.versionLabel || 'update';
    document.getElementById('versionRaw').textContent = fmtTokens(version.rawTokens);
    document.getElementById('versionOpt').textContent = fmtTokens(version.optimizedTokens);
    const versionVerify = document.getElementById('versionVerify');
    if (!version.events) {
      versionVerify.textContent = 'No events since this extension version yet.';
      versionVerify.className = 'verify-summary';
    } else if (version.savedTokens > 0) {
      versionVerify.textContent = fmtTokens(version.savedTokens) + ' saved since update · ' +
        version.compressionPercent.toFixed(1) + '% · ' + version.events + ' events';
      versionVerify.className = 'verify-summary active';
    } else {
      versionVerify.textContent = version.events + ' events since update.';
      versionVerify.className = 'verify-summary none';
    }
  }

  document.getElementById('enableBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'enableTracking' });
  });

  document.getElementById('periodTabs').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-period]');
    if (!btn) return;
    const period = btn.getAttribute('data-period');
    selectedPeriod = period;
    renderPeriod(period);
    vscode.postMessage({ type: 'setPeriod', period: period });
  });

  document.getElementById('alerts').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === 'enableProse') {
      vscode.postMessage({ type: 'enableProseMode' });
    } else if (target.dataset.action === 'auditMcp') {
      vscode.postMessage({ type: 'auditMcp' });
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type !== 'stats') return;
    const s = msg.stats;
    latestStats = s;

    const empty = document.getElementById('empty');
    const content = document.getElementById('content');

    if (!s.events) {
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

    updateTabCounts(s);
    renderVersion(s);
    const period = s.defaultPeriod || selectedPeriod || 'today';
    renderPeriod(period);
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

  extensionContext = context;
  extensionPath = context.extensionPath;
  dashboardPeriod = context.globalState.get<DashboardPeriod>("tokensaver.dashboardPeriod", "today");
  setupMetricsBaseline(context);
  ensureCompressionConfig();
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
    vscode.commands.registerCommand("tokensaver.enableProseMode", enableProseMode),
    vscode.commands.registerCommand("tokensaver.auditMcp", auditMcp),
    vscode.commands.registerCommand("tokensaver.refresh", refresh),
    vscode.commands.registerCommand("tokensaver.resetMetrics", () =>
      resetMetricsBaseline(context)
    )
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
  void maybeAuditMcpOnStartup();

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
