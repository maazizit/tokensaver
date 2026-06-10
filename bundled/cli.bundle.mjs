#!/usr/bin/env node

// src/index.ts
import { readFileSync as readFileSync4 } from "node:fs";

// src/commands/init.ts
import { cpSync, existsSync as existsSync3, mkdirSync as mkdirSync3 } from "node:fs";
import { join as join4 } from "node:path";

// ../core/dist/types.js
var DEFAULT_CONFIG = {
  enterpriseMode: false,
  noContentLog: false,
  trackOnly: false,
  retentionDays: 90
};

// ../core/dist/tokens.js
function estimateTokens(text) {
  if (!text)
    return 0;
  return Math.ceil(text.length / 4);
}
function redactSecrets(text) {
  return text.replace(/(api[_-]?key|password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

// ../core/dist/db.js
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
function getTokvizHome() {
  return process.env.TOKVIZ_HOME ?? join(homedir(), ".tokviz");
}
var TOKVIZ_HOME = join(homedir(), ".tokviz");
var EVENTS_FILE = () => join(getTokvizHome(), "events.json");
var CONFIG_FILE = () => join(getTokvizHome(), "config.json");
function ensureHome() {
  const home = getTokvizHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
}
function readStore() {
  ensureHome();
  if (!existsSync(EVENTS_FILE()))
    return { events: [] };
  try {
    return JSON.parse(readFileSync(EVENTS_FILE(), "utf8"));
  } catch {
    return { events: [] };
  }
}
function writeStore(store) {
  ensureHome();
  const eventsFile = EVENTS_FILE();
  const tmp = `${eventsFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, eventsFile);
}
function getConfig() {
  ensureHome();
  if (!existsSync(CONFIG_FILE()))
    return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE(), "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(config) {
  const merged = { ...getConfig(), ...config };
  ensureHome();
  writeFileSync(CONFIG_FILE(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
function recordEvent(input) {
  const config = getConfig();
  const event = {
    id: randomUUID(),
    sessionId: input.sessionId,
    agent: input.agent,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    source: input.source,
    toolName: input.toolName,
    command: config.noContentLog ? void 0 : input.command?.slice(0, 200),
    tokensRaw: input.tokensRaw,
    tokensOptimized: input.tokensOptimized,
    tokensSaved: Math.max(0, input.tokensRaw - input.tokensOptimized),
    metadata: input.metadata
  };
  const store = readStore();
  store.events.push(event);
  purgeOldEvents(store, config.retentionDays);
  writeStore(store);
  return event;
}
function purgeOldEvents(store, retentionDays) {
  if (retentionDays <= 0)
    return;
  const cutoff = Date.now() - retentionDays * 864e5;
  store.events = store.events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}
function getAllEvents() {
  return readStore().events;
}
function getSessionStatsForEvents(events, sessionId) {
  const bySession = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (sessionId && e.sessionId !== sessionId)
      continue;
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }
  return [...bySession.entries()].map(([sid, evts]) => buildSessionStats(sid, evts)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
function getSessionStats(sessionId) {
  return getSessionStatsForEvents(getAllEvents(), sessionId);
}
function buildSessionStats(sessionId, events) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let tokensIn = 0;
  let tokensOut = 0;
  let tokensSaved = 0;
  const byTool = {};
  const bySource = {};
  let cumulative = 0;
  const timeline = [];
  for (const e of sorted) {
    tokensIn += e.tokensRaw;
    tokensOut += e.tokensOptimized;
    tokensSaved += e.tokensSaved;
    cumulative += e.tokensSaved;
    timeline.push({ ts: e.timestamp, cumulativeSaved: cumulative });
    bySource[e.source] = (bySource[e.source] ?? 0) + e.tokensRaw;
    const tool = e.toolName ?? e.source;
    const entry = byTool[tool] ?? { in: 0, out: 0, saved: 0 };
    entry.in += e.tokensRaw;
    entry.out += e.tokensOptimized;
    entry.saved += e.tokensSaved;
    byTool[tool] = entry;
  }
  const savingsPercent = tokensIn > 0 ? Math.round(tokensSaved / tokensIn * 1e3) / 10 : 0;
  return {
    sessionId,
    agent: sorted[0]?.agent ?? "cursor",
    startedAt: sorted[0]?.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
    tokensIn,
    tokensOut,
    tokensSaved,
    savingsPercent,
    byTool,
    bySource,
    timeline
  };
}
function getGlobalStatsForEvents(events) {
  const totalRaw = events.reduce((s, e) => s + e.tokensRaw, 0);
  const totalOptimized = events.reduce((s, e) => s + e.tokensOptimized, 0);
  const totalSaved = events.reduce((s, e) => s + e.tokensSaved, 0);
  const sessions = new Set(events.map((e) => e.sessionId)).size;
  return {
    totalRaw,
    totalOptimized,
    totalSaved,
    savingsPercent: totalRaw > 0 ? Math.round(totalSaved / totalRaw * 1e3) / 10 : 0,
    eventCount: events.length,
    sessions
  };
}
function getGlobalStats() {
  return getGlobalStatsForEvents(getAllEvents());
}

// ../core/dist/compressor/shell.js
var MAX_LINES = 80;
var MAX_DIFF_LINES = 120;
function truncateLines(text, max) {
  const lines = text.split("\n");
  if (lines.length <= max)
    return text;
  const kept = lines.slice(0, max);
  kept.push(`
[tokviz] \u2026 ${lines.length - max} lines truncated`);
  return kept.join("\n");
}
function compressGitStatus(output) {
  const lines = output.split("\n");
  const important = lines.filter((l) => l.startsWith("On branch") || l.startsWith("Changes") || l.startsWith("modified:") || l.startsWith("new file:") || l.startsWith("deleted:") || l.startsWith("Untracked") || l.trim() === "");
  const untrackedIdx = important.findIndex((l) => l.startsWith("Untracked"));
  if (untrackedIdx >= 0) {
    const before = important.slice(0, untrackedIdx + 1);
    const untracked = important.slice(untrackedIdx + 1).filter((l) => l.trim());
    if (untracked.length > 10) {
      before.push(`  \u2026 ${untracked.length} untracked files (tokviz summary)`);
      return before.join("\n");
    }
  }
  return important.join("\n") || output;
}
function compressGitDiff(output) {
  return truncateLines(output, MAX_DIFF_LINES);
}
function compressGitLog(output) {
  return truncateLines(output, 30);
}
function compressTestOutput(output) {
  const lines = output.split("\n");
  const errors = lines.filter((l) => /FAIL|ERROR|error:|failed|AssertionError/i.test(l) || l.trim().startsWith("E ") || l.includes("\u2717") || l.includes("\u2718"));
  const summary = lines.filter((l) => /passed|failed|tests?/i.test(l)).slice(-5);
  if (errors.length === 0 && summary.length > 0) {
    return `[tokviz] test summary
${summary.join("\n")}`;
  }
  if (errors.length > 0) {
    const body = truncateLines(errors.join("\n"), 40);
    return `[tokviz] errors only
${body}`;
  }
  return truncateLines(output, MAX_LINES);
}
function compressShellOutput(command, output) {
  const tokensRaw = estimateTokens(output);
  if (!output.trim()) {
    return { output, tokensRaw, tokensOptimized: tokensRaw, compressed: false };
  }
  const cmd = command.trim().toLowerCase();
  let compressed = output;
  if (/\bgit\s+status\b/.test(cmd)) {
    compressed = compressGitStatus(output);
  } else if (/\bgit\s+diff\b/.test(cmd)) {
    compressed = compressGitDiff(output);
  } else if (/\bgit\s+log\b/.test(cmd)) {
    compressed = compressGitLog(output);
  } else if (/\b(pytest|cargo test|npm test|pnpm test|jest|vitest)\b/.test(cmd)) {
    compressed = compressTestOutput(output);
  } else if (/\b(grep|rg|find|ls|docker ps|kubectl get)\b/.test(cmd)) {
    compressed = truncateLines(output, MAX_LINES);
  }
  const tokensOptimized = estimateTokens(compressed);
  const didCompress = compressed !== output && tokensOptimized < tokensRaw;
  return {
    output: didCompress ? compressed : output,
    tokensRaw,
    tokensOptimized: didCompress ? tokensOptimized : tokensRaw,
    compressed: didCompress
  };
}

// ../core/dist/tracker.js
function trackShellOutput(input) {
  const config = getConfig();
  const trackOnly = input.trackOnly ?? config.trackOnly;
  const safeOutput = redactSecrets(input.output);
  const safeCommand = config.noContentLog ? "[redacted]" : input.command;
  if (trackOnly) {
    const tokens = estimateTokens(safeOutput);
    recordEvent({
      sessionId: input.sessionId,
      agent: input.agent,
      source: "shell",
      toolName: "Shell",
      command: safeCommand,
      tokensRaw: tokens,
      tokensOptimized: tokens
    });
    return { output: input.output, saved: 0 };
  }
  const result = compressShellOutput(input.command, safeOutput);
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: "shell",
    toolName: "Shell",
    command: safeCommand,
    tokensRaw: result.tokensRaw,
    tokensOptimized: result.tokensOptimized,
    metadata: { compressed: result.compressed }
  });
  return {
    output: result.compressed ? result.output : input.output,
    saved: result.tokensRaw - result.tokensOptimized
  };
}
function trackAgentResponse(input) {
  const tokens = estimateTokens(redactSecrets(input.text));
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: input.source ?? "prose",
    toolName: input.toolName,
    tokensRaw: tokens,
    tokensOptimized: tokens
  });
}
function trackToolUse(input) {
  const raw = estimateTokens(redactSecrets(input.inputText));
  const out = input.outputText ? estimateTokens(redactSecrets(input.outputText)) : 0;
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: "tool",
    toolName: input.toolName,
    tokensRaw: raw + out,
    tokensOptimized: raw + out
  });
}

// ../core/dist/filters.js
function parseDateInput(value) {
  const trimmed = value.trim();
  if (!trimmed)
    return void 0;
  const duration = trimmed.match(/^(\d+)(d|h)$/i);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2].toLowerCase();
    const ms = unit === "d" ? amount * 864e5 : amount * 36e5;
    return new Date(Date.now() - ms);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? void 0 : parsed;
}
function filterEvents(events, filter = {}) {
  const sinceDate = filter.since ? parseDateInput(filter.since) : void 0;
  const untilDate = filter.until ? parseDateInput(filter.until) : void 0;
  return events.filter((event) => {
    const ts = new Date(event.timestamp).getTime();
    if (sinceDate && ts < sinceDate.getTime())
      return false;
    if (untilDate && ts > untilDate.getTime())
      return false;
    if (filter.agent && event.agent !== filter.agent)
      return false;
    return true;
  });
}

// ../core/dist/recommendations.js
function topCommandShare(events) {
  const total = events.reduce((sum, event) => sum + event.tokensRaw, 0);
  if (total === 0)
    return null;
  const byCommand = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (!event.command)
      continue;
    const key = event.command.split(/\s+/).slice(0, 2).join(" ");
    byCommand.set(key, (byCommand.get(key) ?? 0) + event.tokensRaw);
  }
  const top = [...byCommand.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top)
    return null;
  return { command: top[0], share: Math.round(top[1] / total * 1e3) / 10 };
}
function buildRecommendations(sessions, events, opts = {}) {
  if (opts.includeRecommendations === false)
    return [];
  const recommendations = [];
  if (events.length === 0) {
    recommendations.push({
      severity: "action",
      message: "Aucun \xE9v\xE9nement enregistr\xE9. Lance `tokviz doctor`, reload VS Code, ouvre Copilot en mode Agent, puis demande une commande shell (ex. run git log --oneline -50)."
    });
    return recommendations;
  }
  const globalIn = events.reduce((sum, event) => sum + event.tokensRaw, 0);
  const globalSaved = events.reduce((sum, event) => sum + event.tokensSaved, 0);
  const globalSavings = globalIn > 0 ? globalSaved / globalIn * 100 : 0;
  if (globalSavings < 15) {
    recommendations.push({
      severity: "warning",
      message: "\xC9conomie globale < 15 %. V\xE9rifie les hooks avec `tokviz doctor`, reload VS Code, puis relance une commande shell via Copilot Agent."
    });
  }
  const proseIn = events.filter((event) => event.source === "prose").reduce((sum, event) => sum + event.tokensRaw, 0);
  if (globalIn > 0 && proseIn / globalIn * 100 > 40) {
    recommendations.push({
      severity: "action",
      message: "Prose > 40 % des tokens IN. Active le mode `/tokviz full` ou `/tokviz lite` pour r\xE9duire les r\xE9ponses."
    });
  }
  const topCommand = topCommandShare(events);
  if (topCommand && topCommand.share > 60) {
    recommendations.push({
      severity: "action",
      message: `> 60 % des tokens viennent de \`${topCommand.command}\`. Envisage un alias ou un filtre pour cette commande.`
    });
  }
  const lowSavingsSessions = sessions.filter((session) => session.savingsPercent < 15 && session.tokensIn > 500);
  if (lowSavingsSessions.length > 0) {
    const sample = lowSavingsSessions[0].sessionId.slice(0, 12);
    recommendations.push({
      severity: "warning",
      message: `Session \`${sample}\u2026\` : \xE9conomie faible malgr\xE9 gros volume. Hooks peut-\xEAtre inactifs pendant cette session.`
    });
  }
  const byAgent = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const entry = byAgent.get(session.agent) ?? { in: 0, saved: 0 };
    entry.in += session.tokensIn;
    entry.saved += session.tokensSaved;
    byAgent.set(session.agent, entry);
  }
  const agentRates = [...byAgent.entries()].filter(([, stats]) => stats.in > 0).map(([agent, stats]) => ({ agent, rate: stats.saved / stats.in * 100 }));
  if (agentRates.length >= 2) {
    const sorted = [...agentRates].sort((a, b) => b.rate - a.rate);
    if (sorted[0].rate >= sorted[1].rate * 2) {
      recommendations.push({
        severity: "info",
        message: `Pr\xE9f\xE9rer \`${sorted[0].agent}\` pour les t\xE2ches shell-heavy (${Math.round(sorted[0].rate)} % vs ${Math.round(sorted[1].rate)} %).`
      });
    }
  }
  if (recommendations.length === 0) {
    recommendations.push({
      severity: "info",
      message: "Consommation stable. Continue \xE0 exporter `tokviz stats --json` pour suivre l\u2019\xE9volution."
    });
  }
  return recommendations;
}

// ../core/dist/report.js
function topCommands(events, limit = 10) {
  const byCommand = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (!event.command)
      continue;
    const key = event.command.split(/\s+/).slice(0, 2).join(" ");
    const entry = byCommand.get(key) ?? { raw: 0, saved: 0 };
    entry.raw += event.tokensRaw;
    entry.saved += event.tokensSaved;
    byCommand.set(key, entry);
  }
  return [...byCommand.entries()].map(([command, stats]) => ({
    command,
    raw: stats.raw,
    saved: stats.saved,
    savingsPercent: stats.raw > 0 ? Math.round(stats.saved / stats.raw * 1e3) / 10 : 0
  })).sort((a, b) => b.raw - a.raw).slice(0, limit);
}
function aggregateByAgent(sessions) {
  const map = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const entry = map.get(session.agent) ?? { tokensIn: 0, tokensSaved: 0 };
    entry.tokensIn += session.tokensIn;
    entry.tokensSaved += session.tokensSaved;
    map.set(session.agent, entry);
  }
  return [...map.entries()].map(([agent, stats]) => ({
    agent,
    tokensIn: stats.tokensIn,
    tokensSaved: stats.tokensSaved,
    savingsPercent: stats.tokensIn > 0 ? Math.round(stats.tokensSaved / stats.tokensIn * 1e3) / 10 : 0
  })).sort((a, b) => b.tokensIn - a.tokensIn);
}
function aggregateBySource(events) {
  const bySource = {};
  for (const event of events) {
    bySource[event.source] = (bySource[event.source] ?? 0) + event.tokensRaw;
  }
  return bySource;
}
function buildReport(opts = {}) {
  const events = filterEvents(getAllEvents(), opts);
  const sessions = getSessionStatsForEvents(events);
  const global = getGlobalStatsForEvents(events);
  const recommendations = buildRecommendations(sessions, events, opts);
  const mostExpensive = [...sessions].sort((a, b) => b.tokensIn - a.tokensIn).slice(0, 3);
  const bestSavings = [...sessions].filter((session) => session.tokensIn > 100).sort((a, b) => b.savingsPercent - a.savingsPercent).slice(0, 3);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    period: { since: opts.since, until: opts.until, agent: opts.agent },
    global,
    sessions,
    byAgent: aggregateByAgent(sessions),
    bySource: aggregateBySource(events),
    topCommands: topCommands(events),
    extremeSessions: { mostExpensive, bestSavings },
    recommendations
  };
}
function formatNumber(value) {
  return value.toLocaleString("en-US");
}
function formatPeriod(period) {
  const parts = [];
  if (period.since)
    parts.push(period.since);
  if (period.until)
    parts.push(period.until);
  return parts.length > 0 ? parts.join(" \u2192 ") : "all time";
}
function formatReportMarkdown(data) {
  const lines = [
    "# TokViz \u2014 Rapport tokens",
    "",
    `**G\xE9n\xE9r\xE9 :** ${data.generatedAt.slice(0, 19).replace("T", " ")} UTC`,
    `**P\xE9riode :** ${formatPeriod(data.period)}`,
    "",
    "## Synth\xE8se",
    "",
    "| M\xE9trique | Valeur |",
    "|----------|--------|",
    `| Sessions | ${data.global.sessions} |`,
    `| \xC9v\xE9nements | ${data.global.eventCount} |`,
    `| Tokens bruts | ${formatNumber(data.global.totalRaw)} |`,
    `| Tokens optimis\xE9s | ${formatNumber(data.global.totalOptimized)} |`,
    `| \xC9conomie | ${formatNumber(data.global.totalSaved)} (${data.global.savingsPercent} %) |`,
    ""
  ];
  if (data.byAgent.length > 0) {
    lines.push("## Par agent", "", "| Agent | Tokens IN | \xC9conomie | % |", "|-------|-----------|----------|---|");
    for (const row of data.byAgent) {
      lines.push(`| ${row.agent} | ${formatNumber(row.tokensIn)} | ${formatNumber(row.tokensSaved)} | ${row.savingsPercent} % |`);
    }
    lines.push("");
  }
  if (Object.keys(data.bySource).length > 0) {
    lines.push("## Par source", "", "| Source | Tokens IN |", "|--------|-----------|");
    for (const [source, value] of Object.entries(data.bySource)) {
      lines.push(`| ${source} | ${formatNumber(value)} |`);
    }
    lines.push("");
  }
  if (data.topCommands.length > 0) {
    lines.push("## Top commandes", "", "| Commande | Brut | \xC9conomie | % |", "|----------|------|----------|---|");
    for (const row of data.topCommands) {
      lines.push(`| \`${row.command}\` | ${formatNumber(row.raw)} | ${formatNumber(row.saved)} | ${row.savingsPercent} % |`);
    }
    lines.push("");
  }
  if (data.extremeSessions.mostExpensive.length > 0) {
    lines.push("## Sessions les plus consommatrices", "", "| Session | Agent | Tokens IN | \xC9conomie | % |", "|---------|-------|-----------|----------|---|");
    for (const session of data.extremeSessions.mostExpensive) {
      lines.push(`| ${session.sessionId.slice(0, 12)}\u2026 | ${session.agent} | ${formatNumber(session.tokensIn)} | ${formatNumber(session.tokensSaved)} | ${session.savingsPercent} % |`);
    }
    lines.push("");
  }
  if (data.recommendations.length > 0) {
    lines.push("## Recommandations", "");
    for (const rec of data.recommendations) {
      const icon = rec.severity === "warning" ? "\u26A0\uFE0F" : rec.severity === "action" ? "\u2192" : "\u2139\uFE0F";
      lines.push(`- ${icon} ${rec.message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatReportHtml(data) {
  const md = formatReportMarkdown(data);
  const body = md.replace(/^# (.+)$/m, "<h1>$1</h1>").replace(/^## (.+)$/gm, "<h2>$1</h2>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^- (.+)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`).replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (_match, header, rows) => {
    const headers = header.split("|").filter(Boolean).map((cell) => `<th>${cell.trim()}</th>`);
    const bodyRows = rows.trim().split("\n").map((row) => {
      const cells = row.split("|").filter(Boolean).map((cell) => `<td>${cell.trim()}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    }).join("");
    return `<table><thead><tr>${headers.join("")}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  }).replace(/\n\n/g, "<br><br>");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>TokViz Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { margin-top: 2rem; color: #444; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f5; }
    ul { padding-left: 1.5rem; }
    li { margin: 0.4rem 0; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
function formatReportJson(data) {
  return JSON.stringify(data, null, 2);
}

// ../core/dist/compare.js
function toRow(session, eventCount) {
  const shell = session.bySource.shell ?? 0;
  const prose = session.bySource.prose ?? 0;
  const total = session.tokensIn || 1;
  return {
    sessionId: session.sessionId,
    agent: session.agent,
    startedAt: session.startedAt,
    tokensIn: session.tokensIn,
    tokensOut: session.tokensOut,
    tokensSaved: session.tokensSaved,
    savingsPercent: session.savingsPercent,
    shellRatio: Math.round(shell / total * 1e3) / 10,
    proseRatio: Math.round(prose / total * 1e3) / 10,
    eventCount,
    costScore: Math.round(session.tokensIn * (1 - session.savingsPercent / 100))
  };
}
function countEventsBySession(events) {
  const counts = /* @__PURE__ */ new Map();
  for (const event of events) {
    counts.set(event.sessionId, (counts.get(event.sessionId) ?? 0) + 1);
  }
  return counts;
}
function filterSessions(sessions, opts) {
  let filtered = sessions;
  if (opts.sessions?.length) {
    filtered = filtered.filter((session) => opts.sessions.includes(session.sessionId));
  }
  if (opts.agents?.length) {
    filtered = filtered.filter((session) => opts.agents.includes(session.agent));
  }
  if (opts.before || opts.after) {
    const beforeDate = opts.before ? new Date(opts.before) : void 0;
    const afterDate = opts.after ? new Date(opts.after) : void 0;
    filtered = filtered.filter((session) => {
      const ts = new Date(session.startedAt).getTime();
      if (beforeDate && ts >= beforeDate.getTime())
        return false;
      if (afterDate && ts < afterDate.getTime())
        return false;
      return true;
    });
  }
  return filtered;
}
function buildDelta(a, b) {
  return {
    tokensIn: a.tokensIn - b.tokensIn,
    tokensOut: a.tokensOut - b.tokensOut,
    tokensSaved: a.tokensSaved - b.tokensSaved,
    savingsPercent: Math.round((a.savingsPercent - b.savingsPercent) * 10) / 10
  };
}
function aggregateAgents(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const entry = map.get(row.agent) ?? { tokensIn: 0, tokensSaved: 0, sessions: 0 };
    entry.tokensIn += row.tokensIn;
    entry.tokensSaved += row.tokensSaved;
    entry.sessions += 1;
    map.set(row.agent, entry);
  }
  return [...map.entries()].map(([agent, stats]) => ({
    agent,
    tokensIn: stats.tokensIn,
    tokensSaved: stats.tokensSaved,
    savingsPercent: stats.tokensIn > 0 ? Math.round(stats.tokensSaved / stats.tokensIn * 1e3) / 10 : 0,
    sessions: stats.sessions
  })).sort((a, b) => b.tokensIn - a.tokensIn);
}
function runCompare(opts = {}) {
  const events = filterEvents(getAllEvents(), opts);
  const eventCounts = countEventsBySession(events);
  const sessions = filterSessions(getSessionStatsForEvents(events), opts);
  const rows = sessions.map((session) => toRow(session, eventCounts.get(session.sessionId) ?? 0));
  if (opts.rank === "top") {
    const limit2 = opts.limit ?? 10;
    const ranked = [...rows].sort((a, b) => b.costScore - a.costScore).slice(0, limit2);
    return { mode: "rank", rows: ranked };
  }
  if (opts.baseline === "median" && opts.sessions?.length === 1) {
    const target = rows.find((row) => row.sessionId === opts.sessions[0]);
    const others = rows.filter((row) => row.sessionId !== opts.sessions[0]);
    const medianIn = others.length > 0 ? [...others].sort((a, b) => a.tokensIn - b.tokensIn)[Math.floor(others.length / 2)].tokensIn : 0;
    const baselineRow = {
      sessionId: "baseline-median",
      agent: "baseline",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      tokensIn: medianIn,
      tokensOut: medianIn,
      tokensSaved: 0,
      savingsPercent: 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: 0,
      costScore: medianIn
    };
    return {
      mode: "baseline",
      rows: target ? [target, baselineRow] : [baselineRow],
      delta: target ? buildDelta(target, baselineRow) : void 0
    };
  }
  if (opts.before && opts.after) {
    const beforeEvents = filterEvents(getAllEvents(), { until: opts.before });
    const afterEvents = filterEvents(getAllEvents(), { since: opts.after });
    const beforeSessions = getSessionStatsForEvents(beforeEvents);
    const afterSessions = getSessionStatsForEvents(afterEvents);
    const beforeTotal = beforeSessions.reduce((sum, session) => sum + session.tokensIn, 0);
    const afterTotal = afterSessions.reduce((sum, session) => sum + session.tokensIn, 0);
    const beforeSaved = beforeSessions.reduce((sum, session) => sum + session.tokensSaved, 0);
    const afterSaved = afterSessions.reduce((sum, session) => sum + session.tokensSaved, 0);
    const beforeRow = {
      sessionId: `before-${opts.before}`,
      agent: "period",
      startedAt: opts.before,
      tokensIn: beforeTotal,
      tokensOut: beforeTotal - beforeSaved,
      tokensSaved: beforeSaved,
      savingsPercent: beforeTotal > 0 ? Math.round(beforeSaved / beforeTotal * 1e3) / 10 : 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: beforeEvents.length,
      costScore: beforeTotal - beforeSaved
    };
    const afterRow = {
      sessionId: `after-${opts.after}`,
      agent: "period",
      startedAt: opts.after,
      tokensIn: afterTotal,
      tokensOut: afterTotal - afterSaved,
      tokensSaved: afterSaved,
      savingsPercent: afterTotal > 0 ? Math.round(afterSaved / afterTotal * 1e3) / 10 : 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: afterEvents.length,
      costScore: afterTotal - afterSaved
    };
    return {
      mode: "before-after",
      rows: [beforeRow, afterRow],
      delta: buildDelta(afterRow, beforeRow)
    };
  }
  if (opts.agents && opts.agents.length >= 2) {
    const agentSummary = aggregateAgents(rows);
    return { mode: "agents", rows, agentSummary };
  }
  if (opts.sessions && opts.sessions.length === 2) {
    const selected = opts.sessions.map((id) => rows.find((row) => row.sessionId === id)).filter((row) => !!row);
    return {
      mode: "sessions",
      rows: selected,
      delta: selected.length === 2 ? buildDelta(selected[0], selected[1]) : void 0
    };
  }
  const limit = opts.limit ?? rows.length;
  const recent = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  return {
    mode: "sessions",
    rows: recent,
    delta: recent.length === 2 ? buildDelta(recent[0], recent[1]) : void 0
  };
}
function formatNumber2(value) {
  return value.toLocaleString("en-US");
}
function formatDelta(value, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber2(value)}${suffix}`;
}
function formatCompareTerminal(result) {
  const lines = ["TokViz \u2014 Session Compare", "\u2500".repeat(56), ""];
  if (result.mode === "agents" && result.agentSummary) {
    lines.push("Par agent:", "");
    lines.push(padRow(["AGENT", "SESSIONS", "TOKENS_IN", "SAVED", "%"]), padRow(["\u2500".repeat(8), "\u2500".repeat(8), "\u2500".repeat(10), "\u2500".repeat(8), "\u2500".repeat(5)]));
    for (const row of result.agentSummary) {
      lines.push(padRow([
        row.agent,
        String(row.sessions),
        formatNumber2(row.tokensIn),
        formatNumber2(row.tokensSaved),
        `${row.savingsPercent}%`
      ]));
    }
    lines.push("");
  }
  if (result.rows.length > 0) {
    lines.push(padRow(["SESSION", "AGENT", "IN", "OUT", "SAVED", "%", "SCORE"]), padRow(["\u2500".repeat(12), "\u2500".repeat(8), "\u2500".repeat(8), "\u2500".repeat(8), "\u2500".repeat(8), "\u2500".repeat(5), "\u2500".repeat(8)]));
    for (const row of result.rows) {
      lines.push(padRow([
        `${row.sessionId.slice(0, 12)}\u2026`,
        row.agent,
        formatNumber2(row.tokensIn),
        formatNumber2(row.tokensOut),
        formatNumber2(row.tokensSaved),
        `${row.savingsPercent}%`,
        formatNumber2(row.costScore)
      ]));
    }
    lines.push("");
  } else {
    lines.push("Aucune session trouv\xE9e pour cette comparaison.");
    lines.push("");
  }
  if (result.delta && result.rows.length === 2) {
    lines.push("Delta (A \u2212 B):");
    lines.push(`  Tokens IN:    ${formatDelta(result.delta.tokensIn)}`);
    lines.push(`  Tokens OUT:   ${formatDelta(result.delta.tokensOut)}`);
    lines.push(`  Saved:        ${formatDelta(result.delta.tokensSaved)}`);
    lines.push(`  Savings %:    ${formatDelta(result.delta.savingsPercent, " pts")}`);
    lines.push("");
  }
  return lines.join("\n");
}
function formatCompareMarkdown(result) {
  const lines = [formatCompareTerminal(result)];
  if (result.rows.length === 2) {
    const [a, b] = result.rows;
    if (a.savingsPercent > b.savingsPercent + 5) {
      lines.push(`Verdict: Session \`${a.sessionId.slice(0, 12)}\u2026\` \xE9conomise plus (${a.savingsPercent}% vs ${b.savingsPercent}%).`);
    } else if (b.savingsPercent > a.savingsPercent + 5) {
      lines.push(`Verdict: Session \`${b.sessionId.slice(0, 12)}\u2026\` \xE9conomise plus (${b.savingsPercent}% vs ${a.savingsPercent}%).`);
    }
  }
  return lines.join("\n");
}
function padRow(cells) {
  const widths = [14, 10, 10, 10, 10, 7, 10];
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? 10)).join("  ");
}
function formatCompareJson(result) {
  return JSON.stringify(result, null, 2);
}

// src/hooks-merge.ts
import {
  readFileSync as readFileSync2,
  writeFileSync as writeFileSync2,
  mkdirSync as mkdirSync2,
  copyFileSync,
  existsSync as existsSync2,
  chmodSync
} from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";

// src/paths.ts
import { homedir as homedir2 } from "node:os";
import { join as join2, dirname } from "node:path";
import { fileURLToPath } from "node:url";
var TOKVIZ_HOME2 = join2(homedir2(), ".tokviz");
var REPO_ROOT = process.env.TOKVIZ_REPO_ROOT ?? join2(dirname(fileURLToPath(import.meta.url)), "../../..");
function cursorHooksPath(global) {
  return global ? join2(homedir2(), ".cursor", "hooks.json") : join2(process.cwd(), ".cursor", "hooks.json");
}
function copilotHooksPath(global) {
  return global ? join2(homedir2(), ".copilot", "hooks", "tokviz-tracker.json") : join2(process.cwd(), ".github", "hooks", "tokviz-tracker.json");
}
function geminiHooksPath(global) {
  return global ? join2(homedir2(), ".gemini", "hooks.json") : join2(process.cwd(), ".gemini", "hooks.json");
}

// src/hooks-merge.ts
var TOKVIZ_MARKER = "tokviz";
function normalizeMatcher(raw) {
  if (raw.hooks && Array.isArray(raw.hooks)) {
    return { matcher: raw.matcher, hooks: raw.hooks };
  }
  if (typeof raw.command === "string") {
    return {
      matcher: raw.matcher,
      hooks: [{ type: raw.type ?? "command", command: raw.command }]
    };
  }
  return { matcher: raw.matcher, hooks: [] };
}
function readHooks(path) {
  if (!existsSync2(path)) return { version: 1, hooks: {} };
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    const normalized = { version: parsed.version ?? 1, hooks: {} };
    for (const [event, matchers] of Object.entries(parsed.hooks ?? {})) {
      normalized.hooks[event] = (matchers ?? []).map(normalizeMatcher);
    }
    return normalized;
  } catch {
    return { version: 1, hooks: {} };
  }
}
function writeHooks(path, data) {
  mkdirSync2(dirname2(path), { recursive: true });
  writeFileSync2(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}
function isTokvizHook(entry) {
  return entry.command.includes(TOKVIZ_MARKER);
}
function mergeMatchers(existing, incoming) {
  const result = [...existing ?? []].map((m) => {
    const norm = normalizeMatcher(m);
    return {
      matcher: norm.matcher,
      hooks: (norm.hooks ?? []).filter((h) => !isTokvizHook(h))
    };
  });
  for (const inc of incoming) {
    const normInc = normalizeMatcher(inc);
    const idx = result.findIndex((r) => r.matcher === normInc.matcher);
    if (idx >= 0) {
      result[idx] = {
        matcher: normInc.matcher,
        hooks: [...result[idx].hooks ?? [], ...normInc.hooks ?? []]
      };
    } else {
      result.push({
        matcher: normInc.matcher,
        hooks: normInc.hooks ?? []
      });
    }
  }
  return result;
}
function installHookScripts(agent) {
  const src = join3(REPO_ROOT, "hooks", agent, "hook.sh");
  const destDir = join3(TOKVIZ_HOME2, "hooks", agent);
  const dest = join3(destDir, "hook.sh");
  mkdirSync2(destDir, { recursive: true });
  copyFileSync(src, dest);
  try {
    chmodSync(dest, 493);
  } catch {
  }
}
function hookCommand(agent) {
  return join3(TOKVIZ_HOME2, "hooks", agent, "hook.sh");
}
function cursorHooksPayload(agent) {
  const cmd = hookCommand(agent);
  return {
    version: 1,
    hooks: {
      afterChatCreated: [
        {
          hooks: [{ type: "command", command: cmd }]
        }
      ],
      afterShellExecution: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: cmd }]
        }
      ],
      afterAgentResponse: [
        {
          hooks: [{ type: "command", command: cmd }]
        }
      ],
      preToolUse: [
        {
          matcher: "Shell",
          hooks: [{ type: "command", command: cmd }]
        }
      ]
    }
  };
}
function copilotVsCodeHooksPayload(agent) {
  const cmd = hookCommand(agent);
  const entry = { type: "command", command: cmd, timeout: 15 };
  return {
    hooks: {
      PreToolUse: [entry],
      PostToolUse: [entry]
    }
  };
}
function mergeCopilotVsCodeHooks(targetPath, incoming) {
  mkdirSync2(dirname2(targetPath), { recursive: true });
  let existing = { hooks: {} };
  if (existsSync2(targetPath)) {
    try {
      existing = JSON.parse(readFileSync2(targetPath, "utf8"));
    } catch {
      existing = { hooks: {} };
    }
  }
  const merged = { hooks: { ...existing.hooks } };
  for (const [event, commands] of Object.entries(incoming.hooks)) {
    const current = (merged.hooks[event] ?? []).filter((cmd) => !isTokvizHook(cmd));
    merged.hooks[event] = [...current, ...commands];
  }
  writeFileSync2(targetPath, `${JSON.stringify(merged, null, 2)}
`, "utf8");
  return { path: targetPath, merged: true };
}
function geminiHooksPayload(agent) {
  const cmd = hookCommand(agent);
  return {
    hooks: {
      onConversationStart: [
        {
          hooks: [{ type: "command", command: cmd }]
        }
      ],
      BeforeTool: [
        {
          matcher: "shell",
          hooks: [{ type: "command", command: cmd }]
        }
      ],
      AfterTool: [
        {
          matcher: "shell",
          hooks: [{ type: "command", command: cmd }]
        }
      ]
    }
  };
}
function mergeHooksFile(targetPath, incoming) {
  const existing = readHooks(targetPath);
  const merged = {
    version: incoming.version ?? existing.version ?? 1,
    hooks: { ...existing.hooks }
  };
  for (const [event, matchers] of Object.entries(incoming.hooks)) {
    merged.hooks[event] = mergeMatchers(merged.hooks[event], matchers);
  }
  writeHooks(targetPath, merged);
  return { path: targetPath, merged: true };
}
function removeTokvizHooks(targetPath) {
  if (!existsSync2(targetPath)) return false;
  const data = readHooks(targetPath);
  let changed = false;
  for (const [event, matchers] of Object.entries(data.hooks)) {
    const cleaned = matchers.map((m) => {
      const norm = normalizeMatcher(m);
      return {
        matcher: norm.matcher,
        hooks: (norm.hooks ?? []).filter((h) => !isTokvizHook(h))
      };
    }).filter((m) => (m.hooks ?? []).length > 0);
    if (cleaned.length !== matchers.length) changed = true;
    data.hooks[event] = cleaned;
  }
  if (changed) writeHooks(targetPath, data);
  return changed;
}

// src/commands/init.ts
function copySkillsAndRules(targetDir, prose) {
  if (prose && prose !== "off") {
    const skillsSrc = join4(REPO_ROOT, "skills");
    const rulesSrc = join4(REPO_ROOT, "rules", "cursor");
    const skillsDest = join4(targetDir, ".cursor", "skills");
    const rulesDest = join4(targetDir, ".cursor", "rules");
    mkdirSync3(skillsDest, { recursive: true });
    mkdirSync3(rulesDest, { recursive: true });
    for (const skill of ["tokviz-compress", "tokviz-stats"]) {
      const src = join4(skillsSrc, skill);
      if (existsSync3(src)) {
        cpSync(src, join4(skillsDest, skill), { recursive: true });
      }
    }
    const ruleFile = join4(rulesSrc, "tokviz.mdc");
    if (existsSync3(ruleFile)) {
      cpSync(ruleFile, join4(rulesDest, "tokviz.mdc"));
    }
  }
}
function runInit(opts) {
  const messages = [];
  const agentKey = opts.agent;
  installHookScripts(agentKey);
  let hooksPath;
  let payload;
  switch (opts.agent) {
    case "copilot":
      hooksPath = copilotHooksPath(opts.global);
      mergeCopilotVsCodeHooks(hooksPath, copilotVsCodeHooksPayload(agentKey));
      messages.push(`Hooks merged \u2192 ${hooksPath}`);
      if (opts.enterprise || opts.trackOnly) {
        saveConfig({
          enterpriseMode: !!opts.enterprise,
          noContentLog: !!opts.enterprise,
          trackOnly: !!opts.trackOnly
        });
        messages.push(
          opts.enterprise ? "Enterprise mode: no content log, metrics only" : "Track-only mode: no shell compression"
        );
      }
      messages.push(`Restart ${opts.agent} to activate hooks.`);
      return { hooksPath, messages };
    case "gemini":
      hooksPath = geminiHooksPath(opts.global);
      payload = geminiHooksPayload(agentKey);
      break;
    default:
      hooksPath = cursorHooksPath(opts.global);
      payload = cursorHooksPayload(agentKey);
  }
  mergeHooksFile(hooksPath, payload);
  messages.push(`Hooks merged \u2192 ${hooksPath}`);
  if (opts.enterprise || opts.trackOnly) {
    saveConfig({
      enterpriseMode: !!opts.enterprise,
      noContentLog: !!opts.enterprise,
      trackOnly: !!opts.trackOnly
    });
    messages.push(
      opts.enterprise ? "Enterprise mode: no content log, metrics only" : "Track-only mode: no shell compression"
    );
  }
  if (!opts.global && opts.prose && opts.prose !== "off") {
    copySkillsAndRules(process.cwd(), opts.prose);
    messages.push(`Prose mode "${opts.prose}" \u2192 .cursor/skills + rules`);
  } else if (opts.global && opts.prose && opts.prose !== "off") {
    messages.push(
      "Prose skills: run from project root or copy skills/ manually for global prose mode"
    );
  }
  messages.push(`Restart ${opts.agent} to activate hooks.`);
  return { hooksPath, messages };
}

// src/commands/hook.ts
function resolveSessionId(input) {
  return input.sessionId ?? input.conversation_id ?? input.session_id ?? input.generation_id ?? process.env.TOKVIZ_SESSION_ID ?? "default";
}
function resolveAgent() {
  const agent = process.env.TOKVIZ_AGENT ?? "cursor";
  if (agent === "copilot" || agent === "gemini" || agent === "cursor") return agent;
  return "cursor";
}
function isShellTool(toolName) {
  const normalized = toolName.toLowerCase();
  return ["shell", "bash", "runterminalcommand", "run_terminal_command"].includes(normalized);
}
function okResponse(extra = {}) {
  return JSON.stringify({ continue: true, ...extra });
}
async function runHook(stdin) {
  let input = {};
  try {
    input = stdin.trim() ? JSON.parse(stdin) : {};
  } catch {
    return okResponse();
  }
  const event = input.hookEventName ?? input.hook_event_name ?? process.env.TOKVIZ_HOOK_EVENT ?? "";
  const sessionId = resolveSessionId(input);
  const agent = resolveAgent();
  try {
    if (event === "afterShellExecution" || event === "PostToolUse" || event === "AfterTool") {
      const toolName = input.tool_name ?? "";
      if (toolName && !isShellTool(toolName) && !input.output && !input.tool_output && !input.tool_response) {
        return okResponse();
      }
      const command = String(input.command ?? input.tool_input?.command ?? "");
      const output = String(input.output ?? input.tool_output ?? input.tool_response ?? "");
      if (output) {
        const { output: compressed, saved } = trackShellOutput({
          sessionId,
          agent,
          command,
          output
        });
        if (saved > 0 && compressed !== output) {
          return okResponse({
            updated_mcp_tool_output: compressed,
            tool_output: compressed,
            output: compressed
          });
        }
      }
    }
    if (event === "afterAgentResponse") {
      const text = String(input.text ?? input.response ?? "");
      if (text) trackAgentResponse({ sessionId, agent, text });
    }
    if (event === "preToolUse" || event === "PreToolUse" || event === "BeforeTool") {
      const toolName = input.tool_name ?? "";
      if (isShellTool(toolName)) {
        const command = String(input.tool_input?.command ?? input.command ?? "");
        if (command) {
          trackToolUse({
            sessionId,
            agent,
            toolName: "Shell",
            inputText: command
          });
        }
      }
    }
  } catch {
  }
  return okResponse();
}

// src/commands/stats.ts
function runStats(opts) {
  const sessions = getSessionStats(opts.session);
  const global = getGlobalStats();
  if (opts.json) {
    return JSON.stringify({ global, sessions }, null, 2);
  }
  const lines = [
    "TokViz \u2014 Stats",
    "\u2500".repeat(40),
    `Events:    ${global.eventCount}`,
    `Sessions:  ${global.sessions}`,
    `Raw:       ${global.totalRaw.toLocaleString()} tokens`,
    `Optimized: ${global.totalOptimized.toLocaleString()} tokens`,
    `Saved:     ${global.totalSaved.toLocaleString()} tokens (${global.savingsPercent}%)`,
    ""
  ];
  if (sessions.length > 0) {
    lines.push("Recent sessions:");
    for (const s of sessions.slice(-5)) {
      lines.push(
        `  ${s.sessionId.slice(0, 12)}\u2026  ${s.agent}  saved ${s.tokensSaved.toLocaleString()} (${s.savingsPercent}%)`
      );
    }
  } else {
    lines.push("No events yet. Use your agent, then run tokviz stats again.");
  }
  return lines.join("\n");
}

// src/commands/gain.ts
function runGain() {
  const global = getGlobalStats();
  const events = getAllEvents();
  const byCommand = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (!e.command || e.tokensSaved <= 0) continue;
    const key = e.command.split(/\s+/).slice(0, 2).join(" ");
    const entry = byCommand.get(key) ?? { raw: 0, saved: 0 };
    entry.raw += e.tokensRaw;
    entry.saved += e.tokensSaved;
    byCommand.set(key, entry);
  }
  const top = [...byCommand.entries()].sort((a, b) => b[1].saved - a[1].saved).slice(0, 5);
  const lines = [
    "TokViz \u2014 Token Savings",
    "\u2500".repeat(40),
    `Raw:       ${global.totalRaw.toLocaleString()} tokens`,
    `Optimized: ${global.totalOptimized.toLocaleString()} tokens`,
    `Saved:     ${global.totalSaved.toLocaleString()} tokens (${global.savingsPercent}%)`,
    ""
  ];
  if (top.length > 0) {
    lines.push("Top savings:");
    for (const [cmd, stats] of top) {
      const pct = stats.raw > 0 ? Math.round(stats.saved / stats.raw * 100) : 0;
      lines.push(`  ${cmd.padEnd(16)} -${stats.saved.toLocaleString()} (${pct}%)`);
    }
  } else {
    lines.push("No savings recorded yet. Hooks compress shell output automatically.");
  }
  return lines.join("\n");
}

// src/commands/doctor.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "node:fs";
function runDoctor() {
  const config = getConfig();
  const stats = getGlobalStats();
  const lines = ["TokViz \u2014 Doctor", "\u2500".repeat(40)];
  const home = getTokvizHome();
  lines.push(existsSync4(home) ? `\u2714 ~/.tokviz exists (${home})` : "\u2717 ~/.tokviz missing \u2014 run tokviz init");
  for (const [name, pathFn] of [
    ["cursor", () => cursorHooksPath(true)],
    ["copilot", () => copilotHooksPath(true)],
    ["gemini", () => geminiHooksPath(true)]
  ]) {
    const p = pathFn();
    const hookScript = `${home}/hooks/${name}/hook.sh`;
    if (existsSync4(p)) {
      const hasTokviz = readFileSync3(p, "utf8").includes("tokviz");
      lines.push(hasTokviz ? `\u2714 ${name} hooks (${p})` : `\u26A0 ${name} hooks exist but no tokviz entry`);
    } else {
      lines.push(`\u25CB ${name} hooks not installed`);
    }
    lines.push(existsSync4(hookScript) ? `  \u2714 hook script` : `  \u2717 hook script missing`);
  }
  lines.push("");
  lines.push(`Config: enterprise=${config.enterpriseMode} noContentLog=${config.noContentLog} trackOnly=${config.trackOnly}`);
  lines.push(`Events: ${stats.eventCount} | Saved: ${stats.totalSaved.toLocaleString()} tokens`);
  return lines.join("\n");
}

// src/commands/uninstall.ts
function runUninstall(opts) {
  const paths = {
    cursor: cursorHooksPath(opts.global),
    copilot: copilotHooksPath(opts.global),
    gemini: geminiHooksPath(opts.global)
  };
  const path = paths[opts.agent];
  const removed = removeTokvizHooks(path);
  return removed ? [`Removed TokViz hooks from ${path}`] : [`No TokViz hooks found in ${path}`];
}

// src/commands/report.ts
import { writeFileSync as writeFileSync3 } from "node:fs";
function runReport(opts) {
  const data = buildReport(opts);
  let content;
  switch (opts.format ?? "md") {
    case "html":
      content = formatReportHtml(data);
      break;
    case "json":
      content = formatReportJson(data);
      break;
    default:
      content = formatReportMarkdown(data);
  }
  if (opts.output) {
    writeFileSync3(opts.output, content, "utf8");
    return `Report written \u2192 ${opts.output}`;
  }
  return content;
}

// src/commands/compare.ts
import { writeFileSync as writeFileSync4 } from "node:fs";
function runCompareCommand(opts) {
  const result = runCompare(opts);
  let content;
  if (opts.json) {
    content = formatCompareJson(result);
  } else if (opts.markdown || opts.output?.endsWith(".md")) {
    content = formatCompareMarkdown(result);
  } else {
    content = formatCompareTerminal(result);
  }
  if (opts.output) {
    writeFileSync4(opts.output, content, "utf8");
    return `Compare written \u2192 ${opts.output}`;
  }
  return content;
}

// src/args.ts
function nextValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) return void 0;
  return value;
}
function parseTrailingFlags(argv) {
  const out = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--no-recommendations") out.noRecommendations = true;
    else if (arg === "--global" || arg === "-g") out.global = true;
    else if (arg === "--enterprise") out.enterprise = true;
    else if (arg === "--track-only") out.trackOnly = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--format") out.format = nextValue(argv, i++) ?? "md";
    else if (arg === "-o" || arg === "--output") out.output = nextValue(argv, i++) ?? "";
    else if (arg === "--since") out.since = nextValue(argv, i++) ?? "";
    else if (arg === "--until") out.until = nextValue(argv, i++) ?? "";
    else if (arg === "--agent") out.agent = nextValue(argv, i++) ?? "";
    else if (arg === "--agents") out.agents = (nextValue(argv, i++) ?? "").split(",").filter(Boolean);
    else if (arg === "--session") out.session = nextValue(argv, i++) ?? "";
    else if (arg === "--rank") out.rank = nextValue(argv, i++) ?? "top";
    else if (arg === "--limit") out.limit = nextValue(argv, i++) ?? "10";
    else if (arg === "--baseline") out.baseline = nextValue(argv, i++) ?? "median";
    else if (arg === "--before") out.before = nextValue(argv, i++) ?? "";
    else if (arg === "--after") out.after = nextValue(argv, i++) ?? "";
    else if (arg === "--prose") out.prose = nextValue(argv, i++) ?? "";
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  if (positional.length > 0) {
    out.positional = positional;
  }
  return out;
}

// src/index.ts
function printHelp() {
  console.log(`
tokviz \u2014 Token tracker & shell compressor for AI agents

Usage:
  tokviz init -g --agent <cursor|copilot|gemini> [options]
  tokviz stats [--json] [--session <id>]
  tokviz gain
  tokviz report [options]
  tokviz compare [sessionA sessionB] [options]
  tokviz doctor
  tokviz hook                    # called by agent hooks (stdin JSON)
  tokviz uninstall -g --agent <cursor|copilot|gemini>

Init options:
  -g, --global          Install hooks globally (~/.cursor, ~/.copilot, ~/.gemini)
  --agent <name>        Target agent (default: cursor)
  --prose <lite|full|ultra|off>   Install prose compression skills (project scope)
  --enterprise          Metrics only, no command content logged
  --track-only          Track tokens, no shell compression

Report options:
  --format <md|html|json>   Output format (default: md)
  -o, --output <file>       Write report to file
  --since <7d|30d|date>    Filter start date
  --until <date>            Filter end date
  --agent <name>            Filter by agent
  --no-recommendations      Hide recommendations section

Compare options:
  <sessionA> <sessionB>     Compare two sessions by ID
  --agents <a,b>            Compare agents (e.g. cursor,copilot)
  --since <7d|30d|date>     Filter period
  --rank top                Rank most expensive sessions
  --limit <n>               Limit ranked results (default: 10)
  --baseline median         Compare session vs median (--session <id>)
  --before <date> --after <date>   Compare periods
  --json                    JSON output
  -o, --output <file>       Write output to file

Examples:
  tokviz init -g --agent cursor
  tokviz stats --json
  tokviz report --since 7d -o rapport.md
  tokviz compare sess-a sess-b
  tokviz compare --rank top --limit 5
  tokviz compare --agents cursor,copilot --since 30d
`);
}
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseTrailingFlags(rest);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }
  switch (cmd) {
    case "init": {
      const agent = flags.agent ?? "cursor";
      const { messages } = runInit({
        global: !!flags.global,
        agent,
        prose: flags.prose,
        enterprise: !!flags.enterprise,
        trackOnly: !!flags.trackOnly
      });
      messages.forEach((m) => console.log(m));
      break;
    }
    case "stats":
      console.log(runStats({ json: !!flags.json, session: flags.session }));
      break;
    case "gain":
      console.log(runGain());
      break;
    case "report":
      console.log(
        runReport({
          format: flags.format ?? "md",
          output: flags.output,
          since: flags.since,
          until: flags.until,
          agent: flags.agent,
          includeRecommendations: !flags.noRecommendations
        })
      );
      break;
    case "compare": {
      const positional = flags.positional ?? [];
      const sessions = positional.length >= 2 ? positional.slice(0, 2) : flags.session ? [flags.session] : void 0;
      console.log(
        runCompareCommand({
          sessions,
          agents: flags.agents,
          since: flags.since,
          until: flags.until,
          agent: flags.agent,
          rank: flags.rank,
          limit: flags.limit ? Number(flags.limit) : void 0,
          baseline: flags.baseline,
          before: flags.before,
          after: flags.after,
          json: !!flags.json,
          markdown: !!flags.markdown,
          output: flags.output
        })
      );
      break;
    }
    case "doctor":
      console.log(runDoctor());
      break;
    case "hook": {
      const stdin = readFileSync4(0, "utf8");
      const out = await runHook(stdin);
      process.stdout.write(out);
      break;
    }
    case "uninstall": {
      const agent = flags.agent ?? "cursor";
      runUninstall({ global: !!flags.global, agent }).forEach((m) => console.log(m));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
