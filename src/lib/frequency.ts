import type { AppData, DayEntry, Frequency, Routine } from "./types";
import { daysBetween, dayNumber, dayNumberToKey, dayNumberWeekday } from "./dates";

export function describeFrequency(f: Frequency): string {
  switch (f.type) {
    case "daily":
      return "Every day";
    case "weekly": {
      const days = f.daysOfWeek ?? [];
      if (days.length === 7) return "Every day";
      if (days.length === 0) return "Weekly";
      const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => labels[d])
        .join(", ");
    }
    case "interval":
      return f.intervalDays && f.intervalDays > 1
        ? `Every ${f.intervalDays} days`
        : "Every day";
    default:
      return "-";
  }
}

/** First day ordinal (see `dayNumber`) a routine exists on. */
export const routineStartDay = (routine: Routine): number =>
  dayNumber(routine.createdAt.slice(0, 10));

/**
 * Build a fast "is scheduled on day ordinal n" predicate for one routine.
 * Use when checking many days of the same routine (stats, heatmaps, insights).
 */
export function scheduleChecker(routine: Routine): (n: number) => boolean {
  const created = routineStartDay(routine);
  const end =
    routine.hasEnd && routine.endDate ? dayNumber(routine.endDate) : Infinity;
  const f = routine.frequency;
  const inRange = (n: number) => !(n < created) && !(n > end);
  switch (f.type) {
    case "daily":
      return inRange;
    case "weekly": {
      const days = new Set(f.daysOfWeek ?? []);
      return (n) => inRange(n) && days.has(dayNumberWeekday(n));
    }
    case "interval": {
      const every = Math.max(1, f.intervalDays ?? 1);
      return (n) => inRange(n) && (n - created) % every === 0;
    }
    default:
      return () => false;
  }
}

/**
 * Day keys the routine was scheduled on, from its creation day through
 * `endKey` (oldest first). When the creation day is after `endKey` the
 * creation day itself is included, matching the long-standing stats behaviour,
 * unless `strict` is set.
 */
export function scheduledDayKeys(
  routine: Routine,
  endKey: string,
  strict = false,
): string[] {
  const created = routineStartDay(routine);
  const end = dayNumber(endKey);
  if (!Number.isFinite(created) || !Number.isFinite(end)) return [];
  const last = strict ? end : Math.max(created, end);
  const isScheduled = scheduleChecker(routine);
  const out: string[] = [];
  for (let n = created; n <= last; n++) {
    if (isScheduled(n)) out.push(dayNumberToKey(n));
  }
  return out;
}

/** Is the routine scheduled to occur on this calendar day (ignoring completion)? */
export function isScheduledOn(routine: Routine, key: string): boolean {
  return scheduleChecker(routine)(dayNumber(key));
}

/** Has the routine ended (past its end date)? */
export function hasEnded(routine: Routine, key: string): boolean {
  if (!routine.hasEnd || !routine.endDate) return false;
  return daysBetween(routine.endDate, key) > 0;
}

/**
 * A routine is "due" today if it's scheduled today AND it hasn't already been
 * cleared (a "yes") for today. "no"/"not really"/"kinda" keep it in the queue.
 */
export function isDueToday(
  routine: Routine,
  key: string,
  data: AppData,
): boolean {
  if (routine.archived) return false;
  if (!isScheduledOn(routine, key)) return false;
  const entry = data.logs[key]?.entries[routine.id];
  if (entry?.cleared) return false;
  return true;
}

export function entryFor(
  data: AppData,
  routineId: string,
  key: string,
): DayEntry | undefined {
  return data.logs[key]?.entries[routineId];
}
