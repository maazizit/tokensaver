/**
 * Token savings projections — pure calculation, no VS Code deps.
 */

export interface TimeProjection {
  dailyTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
  monthlyCostSavedUSD: number;
}

/** Raw vs optimized counts for verification. */
export interface CompressionSnapshot {
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  compressionPercent: number;
  events: number;
}

/** Savings on shell events where compression actually reduced tokens. */
export interface EffectiveCompression {
  compressionPercent: number;
  activeEvents: number;
  totalEvents: number;
  rawTokens: number;
  savedTokens: number;
}

/** Minimal event shape for projection math. */
export interface ProjectionEvent {
  timestamp: string;
  saved?: number;
  tokensSaved?: number;
  raw?: number;
  tokensRaw?: number;
  optimized?: number;
  tokensOptimized?: number;
}

/** Average blended input-token price (June 2026):
 *  Claude API ~$0.003 / 1K input tokens
 *  GitHub Copilot ~$0.012 / 1K tokens (rough)
 *  Midpoint used here for dashboard estimates.
 */
export const PRICE_PER_1K_TOKENS = 0.0075;

function eventSavedTokens(event: ProjectionEvent): number {
  return event.saved ?? event.tokensSaved ?? 0;
}

function eventRawTokens(event: ProjectionEvent): number {
  return event.raw ?? event.tokensRaw ?? 0;
}

function eventOptimizedTokens(event: ProjectionEvent): number {
  return event.optimized ?? event.tokensOptimized ?? 0;
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

/** Sum raw / optimized / saved for all events or today only. */
export function calculateCompressionSnapshot(
  events: ProjectionEvent[],
  todayOnly = false
): CompressionSnapshot {
  if (!events || events.length === 0) {
    return {
      rawTokens: 0,
      optimizedTokens: 0,
      savedTokens: 0,
      compressionPercent: 0,
      events: 0,
    };
  }

  const scoped = todayOnly
    ? events.filter((event) => event.timestamp && isToday(event.timestamp))
    : events;

  let rawTokens = 0;
  let optimizedTokens = 0;
  let savedTokens = 0;

  for (const event of scoped) {
    rawTokens += eventRawTokens(event);
    optimizedTokens += eventOptimizedTokens(event);
    savedTokens += eventSavedTokens(event);
  }

  return {
    rawTokens: Math.round(rawTokens),
    optimizedTokens: Math.round(optimizedTokens),
    savedTokens: Math.round(savedTokens),
    compressionPercent:
      rawTokens > 0 ? parseFloat(((savedTokens / rawTokens) * 100).toFixed(1)) : 0,
    events: scoped.length,
  };
}

/** Rate when compression fired — excludes short/pass-through shell outputs. */
export function calculateEffectiveCompression(
  events: ProjectionEvent[],
  todayOnly = false
): EffectiveCompression {
  const scoped = (todayOnly
    ? events.filter((event) => event.timestamp && isToday(event.timestamp))
    : events
  ).filter((event) => eventSavedTokens(event) > 0);

  let rawTokens = 0;
  let savedTokens = 0;
  for (const event of scoped) {
    rawTokens += eventRawTokens(event);
    savedTokens += eventSavedTokens(event);
  }

  const totalScoped = todayOnly
    ? events.filter((event) => event.timestamp && isToday(event.timestamp)).length
    : events.length;

  return {
    compressionPercent:
      rawTokens > 0 ? parseFloat(((savedTokens / rawTokens) * 100).toFixed(1)) : 0,
    activeEvents: scoped.length,
    totalEvents: totalScoped,
    rawTokens: Math.round(rawTokens),
    savedTokens: Math.round(savedTokens),
  };
}

/**
 * Extrapolate savings from today's events only.
 * No events today → all zeros (no carry-over from prior days).
 */
export function calculateProjections(events: ProjectionEvent[]): TimeProjection {
  if (!events || events.length === 0) {
    return {
      dailyTokens: 0,
      weeklyTokens: 0,
      monthlyTokens: 0,
      monthlyCostSavedUSD: 0,
    };
  }

  const tokensSavedToday = events
    .filter((event) => event.timestamp && isToday(event.timestamp))
    .reduce((sum, event) => sum + eventSavedTokens(event), 0);

  const dailyTokens = Math.round(tokensSavedToday);
  const weeklyTokens = Math.round(dailyTokens * 7);
  const monthlyTokens = Math.round(dailyTokens * 30);

  const monthlyCostSavedUSD = parseFloat(
    ((monthlyTokens / 1000) * PRICE_PER_1K_TOKENS).toFixed(2)
  );

  return {
    dailyTokens,
    weeklyTokens,
    monthlyTokens,
    monthlyCostSavedUSD,
  };
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString("en-US");
}

/** USD display; floor at $0.01 when amount is positive but tiny. */
export function formatCurrency(amount: number): string {
  if (amount > 0 && amount < 0.01) {
    return "$0.01";
  }
  return `$${amount.toFixed(2)}`;
}
