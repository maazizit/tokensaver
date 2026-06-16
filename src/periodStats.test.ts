import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPeriodStats, buildAllPeriodStats } from "./periodStats";
import type { TokVizEvent } from "./types";

describe("buildPeriodStats", () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString();
  const old = new Date(now);
  old.setDate(old.getDate() - 10);
  const oldIso = old.toISOString();

  const events: TokVizEvent[] = [
    {
      id: "1",
      sessionId: "s1",
      agent: "cursor",
      timestamp: todayIso,
      source: "shell",
      toolName: "Shell",
      tokensRaw: 1000,
      tokensOptimized: 400,
      tokensSaved: 600,
      command: "git diff",
    },
    {
      id: "2",
      sessionId: "s1",
      agent: "copilot",
      timestamp: yesterdayIso,
      source: "shell",
      toolName: "Shell",
      tokensRaw: 500,
      tokensOptimized: 200,
      tokensSaved: 300,
      command: "npm test",
    },
    {
      id: "3",
      sessionId: "s2",
      agent: "cursor",
      timestamp: oldIso,
      source: "prose",
      toolName: "Assistant",
      tokensRaw: 200,
      tokensOptimized: 200,
      tokensSaved: 0,
    },
  ];

  it("filters today only", () => {
    const stats = buildPeriodStats(events, "today");
    assert.equal(stats.compression.events, 1);
    assert.equal(stats.savedTokens, 600);
  });

  it("filters yesterday only", () => {
    const stats = buildPeriodStats(events, "yesterday");
    assert.equal(stats.compression.events, 1);
    assert.equal(stats.savedTokens, 300);
  });

  it("includes all events in all-time period", () => {
    const stats = buildPeriodStats(events, "all");
    assert.equal(stats.compression.events, 3);
    assert.equal(stats.savedTokens, 900);
  });

  it("builds all period keys", () => {
    const all = buildAllPeriodStats(events);
    assert.ok(all.today);
    assert.ok(all.yesterday);
    assert.ok(all["7d"]);
    assert.ok(all["30d"]);
    assert.ok(all.all);
  });
});
