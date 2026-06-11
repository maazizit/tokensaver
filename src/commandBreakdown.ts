/**
 * Shell command classification — mirrors @tokviz/core detectCommandType order.
 */

export const COMMAND_TYPES = [
  "docker logs",
  "docker ps",
  "kubectl",
  "aws",
  "gcp",
  "curl",
  "cat",
  "git diff",
  "git status",
  "git log",
  "cargo test",
  "pnpm test",
  "npm test",
  "pytest",
  "vitest",
  "jest",
  "rg",
  "grep",
  "find",
  "ls",
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number] | "other";

export interface CommandBreakdownEvent {
  command?: string;
  tokensRaw?: number;
  tokensOptimized?: number;
  tokensSaved?: number;
  metadata?: { commandType?: string };
}

export interface CommandBreakdownRow {
  command: string;
  count: number;
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  compressionPercent: number;
}

export function classifyShellCommand(event: CommandBreakdownEvent): string {
  const fromMeta = event.metadata?.commandType;
  if (fromMeta && fromMeta !== "generic") {
    return fromMeta;
  }

  const cmd = event.command?.trim();
  if (!cmd || cmd === "[redacted]") {
    return "other";
  }

  const lower = cmd.toLowerCase();
  const wordMatchers: Partial<Record<(typeof COMMAND_TYPES)[number], RegExp>> = {
    cat: /\bcat\b/,
    curl: /\bcurl\b/,
    aws: /\baws\b/,
    kubectl: /\bkubectl\b/,
    gcp: /\b(gcloud|gcp)\b/,
  };

  for (const name of COMMAND_TYPES) {
    const wordRe = wordMatchers[name];
    if (wordRe) {
      if (wordRe.test(lower)) return name;
      continue;
    }
    if (lower.includes(name)) {
      return name;
    }
  }
  return "other";
}

export function calculateCommandBreakdown(
  events: CommandBreakdownEvent[]
): CommandBreakdownRow[] {
  const buckets = new Map<string, CommandBreakdownRow>();

  for (const event of events) {
    const key = classifyShellCommand(event);
    const row =
      buckets.get(key) ||
      ({
        command: key,
        count: 0,
        rawTokens: 0,
        optimizedTokens: 0,
        savedTokens: 0,
        compressionPercent: 0,
      } satisfies CommandBreakdownRow);

    const raw = event.tokensRaw ?? 0;
    const opt = event.tokensOptimized ?? 0;
    const saved = event.tokensSaved ?? Math.max(0, raw - opt);

    row.count += 1;
    row.rawTokens += raw;
    row.optimizedTokens += opt;
    row.savedTokens += saved;
    buckets.set(key, row);
  }

  const rows = [...buckets.values()].map((row) => ({
    ...row,
    rawTokens: Math.round(row.rawTokens),
    optimizedTokens: Math.round(row.optimizedTokens),
    savedTokens: Math.round(row.savedTokens),
    compressionPercent:
      row.rawTokens > 0
        ? parseFloat(((row.savedTokens / row.rawTokens) * 100).toFixed(1))
        : 0,
  }));

  rows.sort((a, b) => {
    if (a.command === "other") return 1;
    if (b.command === "other") return -1;
    return b.count - a.count;
  });

  if (rows.length === 0) {
    return [];
  }

  const total: CommandBreakdownRow = {
    command: "TOTAL",
    count: rows.reduce((s, r) => s + r.count, 0),
    rawTokens: rows.reduce((s, r) => s + r.rawTokens, 0),
    optimizedTokens: rows.reduce((s, r) => s + r.optimizedTokens, 0),
    savedTokens: rows.reduce((s, r) => s + r.savedTokens, 0),
    compressionPercent: 0,
  };
  total.compressionPercent =
    total.rawTokens > 0
      ? parseFloat(((total.savedTokens / total.rawTokens) * 100).toFixed(1))
      : 0;

  return [...rows, total];
}
