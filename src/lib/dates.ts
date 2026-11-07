import {
  format,
  parseISO,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";

/*
 * Day keys are hot: stats, streaks and insights walk every day of every
 * routine's history. These helpers avoid date-fns parse/format on the common
 * `YYYY-MM-DD` path (date-fns stays as the fallback for anything else).
 */

const DAY_MS = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
const pad4 = (n: number): string => `${n}`.padStart(4, "0");

/** Canonical day key, YYYY-MM-DD in local time. */
export const dayKey = (d: Date = new Date()): string =>
  `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayKey = (): string => dayKey(new Date());

export const parseDay = (key: string): Date => {
  const m = KEY_RE.exec(key);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    // Years 0-99 would otherwise map to 1900-1999.
    if (+m[1] < 100) d.setFullYear(+m[1]);
    return d;
  }
  return startOfDay(parseISO(key));
};

/**
 * Calendar-day ordinal (days since 1970-01-01) for a day key. Differences are
 * exact calendar-day counts, independent of DST. NaN for unparseable keys.
 */
export function dayNumber(key: string): number {
  const m = KEY_RE.exec(key);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
  const d = startOfDay(parseISO(key));
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/** Inverse of `dayNumber`. */
export function dayNumberToKey(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Weekday (Sun=0 … Sat=6) for a day ordinal. 1970-01-01 was a Thursday. */
export const dayNumberWeekday = (n: number): number => (((n + 4) % 7) + 7) % 7;

export const daysBetween = (aKey: string, bKey: string): number => {
  const a = dayNumber(aKey);
  const b = dayNumber(bKey);
  if (Number.isFinite(a) && Number.isFinite(b)) return b - a;
  return differenceInCalendarDays(parseDay(bKey), parseDay(aKey));
};

/** Shift a YYYY-MM-DD key by a number of calendar days. */
export function shiftDay(key: string, days: number): string {
  const n = dayNumber(key);
  if (Number.isFinite(n)) return dayNumberToKey(n + days);
  const d = parseDay(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

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
