/**
 * Weekly recap: previous Monday–Sunday as an eShop-style “featured” cartridge.
 */

import type { AppData } from "./types";
import { dayKey, parseDay } from "./dates";
import { isScheduledOn } from "./frequency";
import { computeRoutineStats } from "./stats";
import { tokensEarnedBetween } from "./economy";
import { computeInsights } from "./insights";
import { GAMES } from "./games";

export interface WeeklyRecap {
  weekKey: string;
  start: string;
  end: string;
  title: string;
  completionPct: number;
  tokensEarned: number;
  bestStreak: number;
  insight?: string;
  arcadeHighlight?: string;
  scheduled: number;
  completed: number;
}

/** ISO-ish week key: YYYY-Www (Monday-based). */
export function weekKeyForDate(d: Date = new Date()): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday and Sunday keys for the calendar week before the current one. */
export function previousWeekRange(now: Date = new Date()): {
  start: string;
  end: string;
  weekKey: string;
} {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day - 7);
  const start = dayKey(d);
  const endD = new Date(d);
  endD.setDate(d.getDate() + 6);
  const end = dayKey(endD);
  return { start, end, weekKey: weekKeyForDate(d) };
}

export function buildWeeklyRecap(
  data: AppData,
  now: Date = new Date(),
): WeeklyRecap {
  const { start, end, weekKey } = previousWeekRange(now);
  let scheduled = 0;
  let completed = 0;
  let bestStreak = 0;

  for (const routine of data.routines.filter((r) => !r.archived)) {
    const stats = computeRoutineStats(data, routine);
    bestStreak = Math.max(bestStreak, stats.bestStreak);
    const cursor = parseDay(start);
    const endDay = parseDay(end);
    while (cursor <= endDay) {
      const key = dayKey(cursor);
      if (isScheduledOn(routine, key)) {
        scheduled++;
        if (data.logs[key]?.entries[routine.id]?.completed) completed++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const completionPct = scheduled
    ? Math.round((completed / scheduled) * 100)
    : 0;
  const tokensEarned = tokensEarnedBetween(data.wallet, start, end);
  const insights = computeInsights(data, 1);

  let arcadeHighlight: string | undefined;
  let bestScore = 0;
  let bestGame = "";
  const daily = data.arcadeDaily;
  if (daily && daily.date >= start && daily.date <= end) {
    for (const [gid, c] of Object.entries(daily.completed)) {
      if (c && c.score > bestScore) {
        bestScore = c.score;
        bestGame = gid;
      }
    }
  }
  if (bestGame) {
    const meta = GAMES.find((g) => g.id === bestGame);
    arcadeHighlight = `${meta?.name ?? bestGame}: ${bestScore.toLocaleString()}`;
  }

  let title = "Steady week";
  if (completionPct >= 90) title = "Featured: Perfect run";
  else if (completionPct >= 70) title = "Featured: On a roll";
  else if (bestStreak >= 7) title = "Featured: Streak machine";
  else if (tokensEarned >= 10) title = "Featured: Token haul";
  else if (completionPct < 40 && scheduled > 0) title = "Featured: Comeback arc";

  return {
    weekKey,
    start,
    end,
    title,
    completionPct,
    tokensEarned,
    bestStreak,
    insight: insights[0]?.body,
    arcadeHighlight,
    scheduled,
    completed,
  };
}

export function shouldOfferRecap(data: AppData, now: Date = new Date()): boolean {
  const { weekKey } = previousWeekRange(now);
  if (data.lastRecapWeek === weekKey) return false;
  // Only offer from Monday of the new week onward (current week key differs).
  return weekKeyForDate(now) !== weekKey;
}
