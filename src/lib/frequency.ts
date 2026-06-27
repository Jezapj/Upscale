import type { AppData, DayEntry, Frequency, Routine } from "./types";
import { daysBetween, parseDay, dayKey } from "./dates";

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
      return "—";
  }
}

/** Is the routine scheduled to occur on this calendar day (ignoring completion)? */
export function isScheduledOn(routine: Routine, key: string): boolean {
  const created = dayKey(parseDay(routine.createdAt.slice(0, 10)));
  if (daysBetween(created, key) < 0) return false; // before it existed
  if (routine.hasEnd && routine.endDate) {
    if (daysBetween(key, routine.endDate) < 0) return false; // past the end
  }
  const date = parseDay(key);
  const f = routine.frequency;
  switch (f.type) {
    case "daily":
      return true;
    case "weekly":
      return (f.daysOfWeek ?? []).includes(date.getDay());
    case "interval": {
      const n = Math.max(1, f.intervalDays ?? 1);
      const since = daysBetween(created, key);
      return since % n === 0;
    }
    default:
      return false;
  }
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
