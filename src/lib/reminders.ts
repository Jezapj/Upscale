import type { AppData, Routine } from "./types";
import { isDueToday } from "./frequency";
import { todayKey } from "./dates";

const FIRED_KEY_PREFIX = "upscale:reminder-fired:";
const PREFS_KEY = "upscale:reminder-prefs";

export interface ReminderPrefs {
  enabled: boolean;
}

export function getReminderPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { enabled: false };
    return JSON.parse(raw) as ReminderPrefs;
  } catch {
    return { enabled: false };
  }
}

export function setReminderPrefs(prefs: ReminderPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("upscale:reminder-prefs"));
}

export const REMINDER_PREFS_EVENT = "upscale:reminder-prefs";

function firedKey(dateKey: string): string {
  return `${FIRED_KEY_PREFIX}${dateKey}`;
}

function getFiredIds(dateKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(firedKey(dateKey));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markFired(routineId: string, dateKey: string): void {
  const fired = getFiredIds(dateKey);
  fired.add(routineId);
  localStorage.setItem(firedKey(dateKey), JSON.stringify([...fired]));
}

/** Clear fired state for a routine (e.g. after editing its reminder time). */
export function clearFiredReminder(routineId: string, dateKey = todayKey()): void {
  const fired = getFiredIds(dateKey);
  if (!fired.delete(routineId)) return;
  localStorage.setItem(firedKey(dateKey), JSON.stringify([...fired]));
}

export function parseReminderMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatReminderLabel(hhmm: string): string {
  const mins = parseReminderMinutes(hhmm);
  if (mins === null) return hhmm;
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Minutes after the scheduled time we still fire (covers slow poll / throttled tabs). */
const REMINDER_GRACE_MINUTES = 5;

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Routines whose reminder time has arrived (with a short grace window). */
export function dueRemindersNow(
  data: AppData,
  dateKey = todayKey(),
  nowMinutes = minutesNow(),
): Routine[] {
  const fired = getFiredIds(dateKey);

  return data.routines.filter((routine) => {
    if (routine.archived || !routine.reminderTime) return false;
    if (!isDueToday(routine, dateKey, data)) return false;
    if (fired.has(routine.id)) return false;

    const target = parseReminderMinutes(routine.reminderTime);
    if (target === null) return false;
    return nowMinutes >= target && nowMinutes <= target + REMINDER_GRACE_MINUTES;
  });
}

export function markRemindersFired(routines: Routine[], dateKey = todayKey()): void {
  for (const routine of routines) {
    markFired(routine.id, dateKey);
  }
}
