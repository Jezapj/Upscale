import { format } from "date-fns";
import type { Routine } from "./types";
import { describeFrequency } from "./frequency";
import { parseDay } from "./dates";

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;
const EVENT_MINUTES = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local floating datetime for ICS (no timezone suffix). */
function formatIcsLocalDateTime(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/** UTC timestamp for DTSTAMP. */
function formatIcsUtc(d: Date): string {
  return format(d, "yyyyMMdd'T'HHmmss'Z'");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const parts = [line.slice(0, max)];
  let i = max;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + max - 1)}`);
    i += max - 1;
  }
  return parts.join("\r\n");
}

function parseReminderTime(hhmm?: string): { hour: number; minute: number } {
  if (!hhmm) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function eventStart(routine: Routine): Date {
  const created = parseDay(routine.createdAt.slice(0, 10));
  const { hour, minute } = parseReminderTime(routine.reminderTime);
  created.setHours(hour, minute, 0, 0);

  const now = new Date();
  if (created >= now) return created;

  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function rruleForRoutine(routine: Routine): string {
  const f = routine.frequency;
  const parts: string[] = [];

  switch (f.type) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly": {
      parts.push("FREQ=WEEKLY");
      const days = (f.daysOfWeek ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => ICS_DAYS[d]);
      if (days.length > 0) parts.push(`BYDAY=${days.join(",")}`);
      break;
    }
    case "interval":
      parts.push("FREQ=DAILY");
      parts.push(`INTERVAL=${Math.max(1, f.intervalDays ?? 1)}`);
      break;
  }

  if (routine.hasEnd && routine.endDate) {
    const until = parseDay(routine.endDate);
    until.setHours(23, 59, 59);
    parts.push(`UNTIL=${formatIcsLocalDateTime(until)}`);
  }

  return parts.join(";");
}

function buildDescription(routine: Routine): string {
  const lines = [
    describeFrequency(routine.frequency),
    routine.note?.trim(),
    "Tracked in Upscale",
  ].filter(Boolean);
  return lines.join("\n");
}

function sanitizeFilename(title: string): string {
  const safe = title
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return safe || "upscale-routine";
}

/** Build an iCalendar (.ics) document for a recurring routine. */
export function buildRoutineIcs(routine: Routine): string {
  const start = eventStart(routine);
  const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
  const now = new Date();
  const summary = `${routine.icon} ${routine.title}`.trim();
  const description = buildDescription(routine);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Upscale//Routine Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:routine-${routine.id}@upscale`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsLocalDateTime(start)}`,
    `DTEND:${formatIcsLocalDateTime(end)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `RRULE:${rruleForRoutine(routine)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Download a routine as an .ics file for import into any calendar app. */
export function downloadRoutineCalendarEvent(routine: Routine): void {
  const ics = buildRoutineIcs(routine);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(routine.title)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open Google Calendar with the next occurrence (single event, no recurrence). */
export function openGoogleCalendarForRoutine(routine: Routine): void {
  const start = eventStart(routine);
  const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
  const fmt = (d: Date) => formatIcsLocalDateTime(d);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${routine.icon} ${routine.title}`.trim(),
    details: buildDescription(routine),
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  window.open(
    `https://calendar.google.com/calendar/render?${params.toString()}`,
    "_blank",
    "noopener,noreferrer",
  );
}
