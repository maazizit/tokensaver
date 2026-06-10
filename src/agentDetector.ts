import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

/** Agents TokViz can install hooks for. */
export type TokVizAgent = "cursor" | "copilot" | "gemini";

export interface DetectedAgent {
  agent: TokVizAgent;
  reason: string;
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isCursorIde(): boolean {
  return vscode.env.appName.toLowerCase().includes("cursor");
}

function hasCopilotExtension(): boolean {
  return (
    !!vscode.extensions.getExtension("GitHub.copilot") ||
    !!vscode.extensions.getExtension("GitHub.copilot-chat")
  );
}

function hasCopilotData(home: string): boolean {
  return pathExists(path.join(home, ".copilot", "session-state"));
}

function hasGeminiOrAntigravity(home: string): boolean {
  return (
    pathExists(path.join(home, ".gemini", "hooks.json")) ||
    pathExists(path.join(home, ".gemini", "antigravity-cli")) ||
    pathExists(path.join(home, ".gemini", "antigravity")) ||
    pathExists(path.join(home, ".gemini", "antigravity-cli", "brain")) ||
    pathExists(path.join(home, ".gemini", "antigravity", "brain"))
  );
}

function hasClaudeData(home: string): boolean {
  return (
    pathExists(path.join(home, ".claude", "projects")) ||
    pathExists(path.join(home, ".config", "claude"))
  );
}

/**
 * Detect which AI agents are present on this machine.
 * Logic mirrors TokGuess watchers (copilot session-state, claude projects, antigravity brain).
 * TokViz hooks exist for cursor / copilot / gemini only — antigravity maps to gemini.
 */
export function detectActiveAgents(): DetectedAgent[] {
  const home = os.homedir();
  const found: DetectedAgent[] = [];

  if (isCursorIde() || pathExists(path.join(home, ".cursor"))) {
    found.push({
      agent: "cursor",
      reason: isCursorIde() ? "Cursor IDE" : "~/.cursor",
    });
  }

  if (hasCopilotExtension() || hasCopilotData(home)) {
    found.push({
      agent: "copilot",
      reason: hasCopilotExtension() ? "GitHub Copilot extension" : "~/.copilot",
    });
  }

  if (hasGeminiOrAntigravity(home)) {
    found.push({
      agent: "gemini",
      reason: pathExists(path.join(home, ".gemini", "antigravity-cli"))
        ? "Antigravity CLI"
        : "~/.gemini",
    });
  }

  // Dedupe by agent id.
  const seen = new Set<TokVizAgent>();
  const unique = found.filter((d) => {
    if (seen.has(d.agent)) {
      return false;
    }
    seen.add(d.agent);
    return true;
  });

  if (unique.length > 0) {
    return unique;
  }

  // Fallback: install for the IDE the user is actually in.
  if (isCursorIde()) {
    return [{ agent: "cursor", reason: "Cursor IDE (default)" }];
  }
  return [{ agent: "copilot", reason: "VS Code (default)" }];
}

/** Claude is visible to TokGuess but TokViz has no hooks for it yet. */
export function detectClaudePresent(): boolean {
  return hasClaudeData(os.homedir());
}
