import {
  format,
  parseISO,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";

/** Canonical day key, YYYY-MM-DD in local time. */
export const dayKey = (d: Date = new Date()): string => format(d, "yyyy-MM-dd");

export const todayKey = (): string => dayKey(new Date());

export const parseDay = (key: string): Date => startOfDay(parseISO(key));

export const daysBetween = (aKey: string, bKey: string): number =>
  differenceInCalendarDays(parseDay(bKey), parseDay(aKey));

export const prettyDay = (key: string): string =>
  format(parseDay(key), "EEE d MMM");

export const prettyTime = (d: Date = new Date()): string => format(d, "h:mm a");

export const weekdayShort = (key: string): string =>
  format(parseDay(key), "EEE");

/** Last N day-keys ending today (oldest first). */
export const lastNDays = (n: number, end: Date = new Date()): string[] => {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
};

export const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const DOW_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
