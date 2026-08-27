/** Minimal copies of client due-check logic so the scheduler can run without the Vite app. */

export interface Frequency {
  type: "daily" | "weekly" | "interval";
  daysOfWeek?: number[];
  intervalDays?: number;
}

export interface Routine {
  id: string;
  title: string;
  note?: string;
  icon?: string;
  reminderTime?: string;
  createdAt: string;
  hasEnd?: boolean;
  endDate?: string;
  archived?: boolean;
  frequency: Frequency;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  reminderAt?: string;
  deletedAt?: string;
}

export interface AppData {
  routines?: Routine[];
  notes?: Note[];
  logs?: Record<string, { entries?: Record<string, { cleared?: boolean }> }>;
}

export const GRACE_MINUTES = 5;

export function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

export function weekdayFromKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function parseReminderMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function splitReminderAt(
  reminderAt: string,
): { dateKey: string; minutes: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})/.exec(reminderAt.trim());
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  return { dateKey: match[1], minutes: hours * 60 + minutes };
}

export function noteReminderId(noteId: string): string {
  return `note:${noteId}`;
}

export function isScheduledOn(routine: Routine, key: string): boolean {
  const created = routine.createdAt.slice(0, 10);
  if (daysBetween(created, key) < 0) return false;
  if (routine.hasEnd && routine.endDate && daysBetween(key, routine.endDate) < 0) {
    return false;
  }
  const f = routine.frequency;
  switch (f.type) {
    case "daily":
      return true;
    case "weekly":
      return (f.daysOfWeek ?? []).includes(weekdayFromKey(key));
    case "interval": {
      const n = Math.max(1, f.intervalDays ?? 1);
      return daysBetween(created, key) % n === 0;
    }
    default:
      return false;
  }
}

export function isDueToday(routine: Routine, key: string, data: AppData): boolean {
  if (routine.archived) return false;
  if (!isScheduledOn(routine, key)) return false;
  const entry = data.logs?.[key]?.entries?.[routine.id];
  if (entry?.cleared) return false;
  return true;
}

export interface ZonedNow {
  dateKey: string;
  minutes: number;
}

export function zonedNow(now: Date, timeZone: string): ZonedNow {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(minutes)) {
      throw new Error("invalid zoned parts");
    }
    return { dateKey, minutes };
  } catch {
    const dateKey = now.toISOString().slice(0, 10);
    return { dateKey, minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

export interface DueItem {
  id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function dueItems(
  data: AppData,
  dateKey: string,
  nowMinutes: number,
  fired: Set<string>,
): DueItem[] {
  const items: DueItem[] = [];

  for (const routine of data.routines ?? []) {
    if (!routine.reminderTime) continue;
    if (!isDueToday(routine, dateKey, data)) continue;
    if (fired.has(routine.id)) continue;
    const target = parseReminderMinutes(routine.reminderTime);
    if (target === null) continue;
    if (nowMinutes < target || nowMinutes > target + GRACE_MINUTES) continue;
    items.push({
      id: routine.id,
      title: `${routine.icon ?? "⏰"} ${routine.title}`,
      body: routine.note?.trim() || "Time for your routine. Open Upscale to check in.",
      url: "/checkin",
      tag: `routine-${routine.id}`,
    });
  }

  for (const note of data.notes ?? []) {
    if (note.deletedAt) continue;
    if (!note.reminderAt) continue;
    const nid = noteReminderId(note.id);
    if (fired.has(nid)) continue;
    const parts = splitReminderAt(note.reminderAt);
    if (!parts) continue;
    if (parts.dateKey !== dateKey || nowMinutes < parts.minutes) continue;
    items.push({
      id: nid,
      title: `📝 ${note.title.trim() || "Note reminder"}`,
      body: note.body.trim() || "Open Upscale to read this note.",
      url: "/notes",
      tag: `note-${note.id}`,
    });
  }

  return items;
}
