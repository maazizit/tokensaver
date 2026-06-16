/**
 * Date and time utility functions.
 */

export type DashboardPeriod = "today" | "yesterday" | "7d" | "30d" | "all";

export const DASHBOARD_PERIODS: DashboardPeriod[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "all",
];

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Check if a timestamp is from today.
 */
export function isToday(timestamp: string): boolean {
  const d = new Date(timestamp);
  return sameCalendarDay(d, new Date());
}

/** Check if a timestamp is from yesterday (local time). */
export function isYesterday(timestamp: string): boolean {
  const d = new Date(timestamp);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return sameCalendarDay(d, y);
}

/** True if timestamp is within the last N calendar days (inclusive of today). */
export function isWithinLastDays(timestamp: string, days: number): boolean {
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return false;
  const cutoff = Date.now() - days * 86_400_000;
  return ts >= cutoff;
}

export function filterEventsByPeriod<T extends { timestamp?: string }>(
  events: T[],
  period: DashboardPeriod
): T[] {
  if (period === "all") return events;

  return events.filter((event) => {
    if (!event.timestamp) return false;
    switch (period) {
      case "today":
        return isToday(event.timestamp);
      case "yesterday":
        return isYesterday(event.timestamp);
      case "7d":
        return isWithinLastDays(event.timestamp, 7);
      case "30d":
        return isWithinLastDays(event.timestamp, 30);
      default:
        return true;
    }
  });
}

/** Number of calendar days spanned by events (minimum 1). */
export function eventDaySpan(events: Array<{ timestamp?: string }>): number {
  const times = events
    .map((event) => Date.parse(event.timestamp ?? ""))
    .filter((ts) => !Number.isNaN(ts));
  if (times.length === 0) return 1;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return Math.max(1, Math.ceil((max - min) / 86_400_000) + 1);
}
