/**
 * Dashboard stats aggregated by time period.
 */

import {
  calculateCompressionSnapshot,
  calculateEffectiveCompression,
  PRICE_PER_1K_TOKENS,
  type CompressionSnapshot,
  type EffectiveCompression,
  type ProjectionEvent,
} from "./calculator";
import { calculateCommandBreakdown, type CommandBreakdownRow } from "./commandBreakdown";
import type { TokVizEvent } from "./types";
import {
  DASHBOARD_PERIODS,
  eventDaySpan,
  filterEventsByPeriod,
  PERIOD_LABELS,
  type DashboardPeriod,
} from "./time";

export type { DashboardPeriod };

export interface AgentBreakdown {
  agent: string;
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savingsPercent: number;
  events: number;
}

export interface PeriodProjections {
  dailyAvg: number;
  weeklyEst: number;
  monthlyEst: number;
  monthlyCostUSD: number;
  subtitle: string;
}

export interface PeriodStats {
  period: DashboardPeriod;
  label: string;
  savedTokens: number;
  compression: CompressionSnapshot;
  effective: EffectiveCompression;
  byAgent: AgentBreakdown[];
  commandBreakdown: CommandBreakdownRow[];
  proseRatio: number;
  mcpRatio: number;
  projections: PeriodProjections;
}

function toProjectionEvents(events: TokVizEvent[]): ProjectionEvent[] {
  return events.map((ev) => ({
    timestamp: ev.timestamp,
    tokensSaved: ev.tokensSaved,
    tokensRaw: ev.tokensRaw,
    tokensOptimized: ev.tokensOptimized,
  }));
}

function buildAgentBreakdown(events: TokVizEvent[]): AgentBreakdown[] {
  const agentMap = new Map<string, AgentBreakdown>();

  for (const ev of events) {
    const raw = ev.tokensRaw || 0;
    const opt = ev.tokensOptimized || 0;
    const saved = ev.tokensSaved || 0;
    const agent = ev.agent || "unknown";
    const bucket =
      agentMap.get(agent) ||
      ({
        agent,
        rawTokens: 0,
        optimizedTokens: 0,
        savedTokens: 0,
        savingsPercent: 0,
        events: 0,
      } satisfies AgentBreakdown);

    bucket.rawTokens += raw;
    bucket.optimizedTokens += opt;
    bucket.savedTokens += saved;
    bucket.events += 1;
    agentMap.set(agent, bucket);
  }

  return Array.from(agentMap.values())
    .map((b) => ({
      ...b,
      savingsPercent: b.rawTokens > 0 ? (b.savedTokens / b.rawTokens) * 100 : 0,
    }))
    .sort((a, b) => b.savedTokens - a.savedTokens);
}

function ratioForSource(events: TokVizEvent[], source: string): number {
  const scoped = events.filter((ev) => ev.source === source);
  const raw = scoped.reduce((sum, ev) => sum + (ev.tokensRaw || 0), 0);
  const total = events.reduce((sum, ev) => sum + (ev.tokensRaw || 0), 0);
  return total > 0 ? (raw / total) * 100 : 0;
}

function buildProjections(period: DashboardPeriod, events: TokVizEvent[]): PeriodProjections {
  const saved = events.reduce((sum, ev) => sum + (ev.tokensSaved || 0), 0);

  let dailyAvg = 0;
  let subtitle = "";

  switch (period) {
    case "today":
      dailyAvg = saved;
      subtitle = "At today's pace, you'll save…";
      break;
    case "yesterday":
      dailyAvg = saved;
      subtitle = "Based on yesterday's activity…";
      break;
    case "7d": {
      dailyAvg = Math.round(saved / 7);
      subtitle = "Average per day over the last 7 days…";
      break;
    }
    case "30d": {
      dailyAvg = Math.round(saved / 30);
      subtitle = "Average per day over the last 30 days…";
      break;
    }
    case "all": {
      const days = eventDaySpan(events);
      dailyAvg = Math.round(saved / days);
      subtitle = `Average per day across ${days} day(s) of history…`;
      break;
    }
  }

  const weeklyEst = Math.round(dailyAvg * 7);
  const monthlyEst = Math.round(dailyAvg * 30);
  const monthlyCostUSD = parseFloat(
    ((monthlyEst / 1000) * PRICE_PER_1K_TOKENS).toFixed(2)
  );

  return { dailyAvg, weeklyEst, monthlyEst, monthlyCostUSD, subtitle };
}

export function buildPeriodStats(events: TokVizEvent[], period: DashboardPeriod): PeriodStats {
  const scoped = filterEventsByPeriod(events, period);
  const projectionEvents = toProjectionEvents(scoped);
  const shellEvents = scoped.filter((ev) => ev.source === "shell");

  return {
    period,
    label: PERIOD_LABELS[period],
    savedTokens: scoped.reduce((sum, ev) => sum + (ev.tokensSaved || 0), 0),
    compression: calculateCompressionSnapshot(projectionEvents, false),
    effective: calculateEffectiveCompression(projectionEvents, false),
    byAgent: buildAgentBreakdown(scoped),
    commandBreakdown: calculateCommandBreakdown(shellEvents),
    proseRatio: ratioForSource(scoped, "prose"),
    mcpRatio: ratioForSource(scoped, "mcp"),
    projections: buildProjections(period, scoped),
  };
}

export function buildAllPeriodStats(
  events: TokVizEvent[]
): Record<DashboardPeriod, PeriodStats> {
  const out = {} as Record<DashboardPeriod, PeriodStats>;
  for (const period of DASHBOARD_PERIODS) {
    out[period] = buildPeriodStats(events, period);
  }
  return out;
}
