import * as vscode from "vscode";
import * as child_process from "child_process";

interface TokVizStats {
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savingsPercent: number;
  topSavings?: Array<{
    command: string;
    saved: number;
    percent: number;
  }>;
}

let statusBarItem: vscode.StatusBarItem;

function getTokvizPath(): string {
  const config = vscode.workspace.getConfiguration("tokensaver");
  return config.get<string>("tokvizPath") || "tokviz";
}

function execTokviz(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokvizPath = getTokvizPath();
    child_process.exec(
      `${tokvizPath} ${args.join(" ")}`,
      { maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

async function checkTokvizInstalled(): Promise<boolean> {
  try {
    await execTokviz(["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function promptInstallTokviz(): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    "TokViz CLI not found. TokenSaver requires TokViz to be installed.",
    "Install Instructions",
    "Cancel"
  );

  if (choice === "Install Instructions") {
    vscode.env.openExternal(
      vscode.Uri.parse("https://github.com/maazizit/tokviz#quick-start")
    );
  }
}

async function installHooks(agent: "cursor" | "copilot" | "gemini" | "antigravity"): Promise<void> {
  const installed = await checkTokvizInstalled();
  if (!installed) {
    await promptInstallTokviz();
    return;
  }

  const config = vscode.workspace.getConfiguration("tokensaver");
  const enterpriseMode = config.get<boolean>("enterpriseMode");

  const args = ["init", "-g", "--agent", agent];
  if (enterpriseMode) {
    args.push("--enterprise");
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing TokViz compression hooks for ${agent}...`,
      cancellable: false,
    },
    async () => {
      try {
        const output = await execTokviz(args);
        vscode.window.showInformationMessage(
          `✅ TokViz hooks installed for ${agent}. Please restart your IDE to activate compression.`,
          "Restart Now"
        ).then((choice) => {
          if (choice === "Restart Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to install TokViz hooks: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}

async function runDoctor(): Promise<void> {
  const installed = await checkTokvizInstalled();
  if (!installed) {
    await promptInstallTokviz();
    return;
  }

  try {
    const output = await execTokviz(["doctor"]);
    const outputChannel = vscode.window.createOutputChannel("TokenSaver");
    outputChannel.clear();
    outputChannel.appendLine("=== TokViz Installation Check ===\n");
    outputChannel.appendLine(output);
    outputChannel.show();

    if (output.includes("✓") || output.includes("OK")) {
      vscode.window.showInformationMessage("✅ TokViz installation is healthy!");
    } else {
      vscode.window.showWarningMessage("⚠️ TokViz may have issues. Check output.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Doctor check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function getStats(): Promise<TokVizStats | null> {
  const installed = await checkTokvizInstalled();
  if (!installed) {
    return null;
  }

  try {
    const output = await execTokviz(["gain"]);
    
    // Parse TokViz gain output
    const rawMatch = output.match(/Raw:\s*([\d,]+)\s*tokens/i);
    const optimizedMatch = output.match(/Optimized:\s*([\d,]+)\s*tokens/i);
    const savedMatch = output.match(/Saved:\s*([\d,]+)\s*tokens\s*\(([\d.]+)%\)/i);

    if (rawMatch && optimizedMatch && savedMatch) {
      return {
        rawTokens: parseInt(rawMatch[1].replace(/,/g, "")),
        optimizedTokens: parseInt(optimizedMatch[1].replace(/,/g, "")),
        savedTokens: parseInt(savedMatch[1].replace(/,/g, "")),
        savingsPercent: parseFloat(savedMatch[2]),
      };
    }
  } catch (error) {
    console.error("Failed to get TokViz stats:", error);
  }

  return null;
}

async function updateStatusBar(): Promise<void> {
  const config = vscode.workspace.getConfiguration("tokensaver");
  const showStatusBar = config.get<boolean>("showStatusBar");

  if (!showStatusBar) {
    statusBarItem.hide();
    return;
  }

  const stats = await getStats();
  if (stats && stats.savedTokens > 0) {
    const savedK = (stats.savedTokens / 1000).toFixed(1);
    statusBarItem.text = `💎 -${savedK}K tokens (${stats.savingsPercent.toFixed(0)}%)`;
    statusBarItem.tooltip = `TokenSaver: ${stats.savedTokens.toLocaleString()} tokens saved today`;
    statusBarItem.show();
  } else {
    statusBarItem.text = "💎 TokenSaver";
    statusBarItem.tooltip = "Click to open dashboard";
    statusBarItem.show();
  }
}

async function showStats(): Promise<void> {
  const installed = await checkTokvizInstalled();
  if (!installed) {
    await promptInstallTokviz();
    return;
  }

  try {
    const output = await execTokviz(["stats"]);
    const outputChannel = vscode.window.createOutputChannel("TokenSaver Stats");
    outputChannel.clear();
    outputChannel.appendLine("=== TokViz Statistics ===\n");
    outputChannel.appendLine(output);
    outputChannel.show();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function compareAgents(): Promise<void> {
  const installed = await checkTokvizInstalled();
  if (!installed) {
    await promptInstallTokviz();
    return;
  }

  try {
    const output = await execTokviz(["compare", "--agents", "cursor,copilot", "--since", "7d"]);
    const outputChannel = vscode.window.createOutputChannel("TokenSaver Compare");
    outputChannel.clear();
    outputChannel.appendLine("=== Agent Comparison ===\n");
    outputChannel.appendLine(output);
    outputChannel.show();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to compare: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function refreshDashboard(webview: vscode.Webview): void {
  webview.html = getDashboardHtml();
  getStats().then((stats) => {
    if (stats) {
      webview.postMessage({ type: "updateStats", stats });
    } else {
      webview.postMessage({ type: "noStats" });
    }
  });
}

class DashboardViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = { enableScripts: true };
    refreshDashboard(webviewView.webview);
  }
}

function createDashboardPanel(_context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    "tokensaverDashboard",
    "TokenSaver Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  refreshDashboard(panel.webview);
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TokenSaver Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 300;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .stat-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: var(--vscode-charts-green);
            margin: 10px 0;
        }
        .stat-label {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .chart-container {
            margin: 30px 0;
            padding: 20px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
        }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: var(--vscode-input-background);
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .emoji {
            font-size: 48px;
            margin: 20px 0;
        }
        .empty-state {
            text-align: center;
            padding: 24px;
            margin: 20px 0;
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 8px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state.hidden { display: none; }
    </style>
</head>
<body>
    <div class="header">
        <div class="emoji">💎</div>
        <h1>TokenSaver Dashboard</h1>
        <p>Powered by TokViz Compression</p>
    </div>

    <div class="empty-state" id="emptyState">
        <p>No savings data yet.</p>
        <p>Install TokViz CLI, run <strong>TokenSaver: Install TokViz Compression</strong>, then use your AI agent in Agent mode.</p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Tokens Saved</div>
            <div class="stat-value" id="savedTokens">-</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Savings Rate</div>
            <div class="stat-value" id="savingsPercent">-</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Raw Tokens</div>
            <div class="stat-value" id="rawTokens">-</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Optimized</div>
            <div class="stat-value" id="optimizedTokens">-</div>
        </div>
    </div>

    <div class="chart-container">
        <h3>Compression Efficiency</h3>
        <div class="progress-bar">
            <div class="progress-fill" id="progressBar" style="width: 0%">
                0% saved
            </div>
        </div>
    </div>

    <div class="footer">
        <p>📊 Stats from ~/.tokviz/events.json</p>
        <p>Run commands in Agent mode (Cursor/Copilot) to see savings</p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'noStats') {
                document.getElementById('emptyState')?.classList.remove('hidden');
                return;
            }
            if (message.type === 'updateStats') {
                document.getElementById('emptyState')?.classList.add('hidden');
                const stats = message.stats;
                document.getElementById('savedTokens').textContent = 
                    (stats.savedTokens / 1000).toFixed(1) + 'K';
                document.getElementById('savingsPercent').textContent = 
                    stats.savingsPercent.toFixed(1) + '%';
                document.getElementById('rawTokens').textContent = 
                    (stats.rawTokens / 1000).toFixed(1) + 'K';
                document.getElementById('optimizedTokens').textContent = 
                    (stats.optimizedTokens / 1000).toFixed(1) + 'K';
                
                const progressBar = document.getElementById('progressBar');
                progressBar.style.width = stats.savingsPercent + '%';
                progressBar.textContent = stats.savingsPercent.toFixed(0) + '% saved';
            }
        });
    </script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log("TokenSaver extension activated");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "tokensaver.showDashboard";
  context.subscriptions.push(statusBarItem);

  // Check TokViz installation on startup
  checkTokvizInstalled().then((installed) => {
    if (!installed) {
      const config = vscode.workspace.getConfiguration("tokensaver");
      const autoInstall = config.get<boolean>("autoInstallHooks");
      
      if (!autoInstall) {
        vscode.window
          .showWarningMessage(
            "TokViz CLI not found. Install it to enable token compression.",
            "Install Instructions",
            "Don't Show Again"
          )
          .then((choice) => {
            if (choice === "Install Instructions") {
              vscode.env.openExternal(
                vscode.Uri.parse("https://github.com/maazizit/tokviz#quick-start")
              );
            }
          });
      }
    } else {
      updateStatusBar();
    }
  });

  // Sidebar webview (package.json: tokensaver.dashboard)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "tokensaver.dashboard",
      new DashboardViewProvider()
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("tokensaver.showDashboard", () => {
      createDashboardPanel(context);
    }),

    vscode.commands.registerCommand("tokensaver.installHooks", () => {
      installHooks("cursor");
    }),

    vscode.commands.registerCommand("tokensaver.installHooksCopilot", () => {
      installHooks("copilot");
    }),

    vscode.commands.registerCommand("tokensaver.installHooksAntigravity", () => {
      installHooks("antigravity");
    }),

    vscode.commands.registerCommand("tokensaver.doctor", runDoctor),

    vscode.commands.registerCommand("tokensaver.viewStats", showStats),

    vscode.commands.registerCommand("tokensaver.compareAgents", compareAgents)
  );

  // Update status bar every 30 seconds
  setInterval(() => {
    updateStatusBar();
  }, 30000);
}

export function deactivate(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

