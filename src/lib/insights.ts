/**
 * Local insight cards from DayLog correlations.
 * Cheap to compute, surfaced on the Progress screen.
 */

import type { AppData, Routine } from "./types";
import { dayKey, daysBetween, parseDay, DOW_FULL } from "./dates";
import { isScheduledOn } from "./frequency";

export type InsightKind = "correlation" | "weekday" | "time_of_day";

export interface InsightCard {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  accent: string;
}

const MIN_SHARED_DAYS = 10;
const MIN_RATE_GAP = 0.2;

function activeRoutines(data: AppData): Routine[] {
  return data.routines.filter((r) => !r.archived);
}

function scheduledKeys(routine: Routine, endKey: string): string[] {
  const created = routine.createdAt.slice(0, 10);
  const total = Math.max(0, daysBetween(created, endKey)) + 1;
  const keys: string[] = [];
  for (let i = 0; i < total; i++) {
    const d = parseDay(created);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (daysBetween(key, endKey) < 0) break;
    if (isScheduledOn(routine, key)) keys.push(key);
  }
  return keys;
}

function completionRateOnDays(
  data: AppData,
  routine: Routine,
  days: string[],
): number | null {
  if (days.length === 0) return null;
  let done = 0;
  for (const key of days) {
    if (data.logs[key]?.entries[routine.id]?.completed) done++;
  }
  return done / days.length;
}

function correlationInsights(data: AppData): InsightCard[] {
  const routines = activeRoutines(data);
  const today = dayKey();
  const cards: InsightCard[] = [];

  for (let i = 0; i < routines.length; i++) {
    for (let j = 0; j < routines.length; j++) {
      if (i === j) continue;
      const a = routines[i];
      const b = routines[j];
      const aKeys = new Set(scheduledKeys(a, today));
      const bDoneDays = scheduledKeys(b, today).filter(
        (k) => data.logs[k]?.entries[b.id]?.completed,
      );
      const sharedWhenB = bDoneDays.filter((k) => aKeys.has(k));
      if (sharedWhenB.length < MIN_SHARED_DAYS) continue;

      const rateWithB = completionRateOnDays(data, a, sharedWhenB);
      const allA = [...aKeys];
      const rateOverall = completionRateOnDays(data, a, allA);
      if (rateWithB == null || rateOverall == null) continue;
      if (rateWithB - rateOverall < MIN_RATE_GAP) continue;

      cards.push({
        id: `corr:${a.id}:${b.id}`,
        kind: "correlation",
        title: "Linked habits",
        body: `You complete “${a.title}” ${Math.round(rateWithB * 100)}% on days you also do “${b.title}” (vs ${Math.round(rateOverall * 100)}% overall).`,
        accent: a.color,
      });
    }
  }

  return cards
    .sort((x, y) => y.body.length - x.body.length)
    .slice(0, 4);
}

function weekdayInsights(data: AppData): InsightCard[] {
  const today = dayKey();
  const cards: InsightCard[] = [];
  for (const routine of activeRoutines(data)) {
    const byDow: { done: number; total: number }[] = Array.from(
      { length: 7 },
      () => ({ done: 0, total: 0 }),
    );
    for (const key of scheduledKeys(routine, today)) {
      const dow = parseDay(key).getDay();
      byDow[dow].total++;
      if (data.logs[key]?.entries[routine.id]?.completed) byDow[dow].done++;
    }
    let best = -1;
    let bestRate = 0;
    let worst = -1;
    let worstRate = 1;
    for (let d = 0; d < 7; d++) {
      if (byDow[d].total < 4) continue;
      const rate = byDow[d].done / byDow[d].total;
      if (rate > bestRate) {
        bestRate = rate;
        best = d;
      }
      if (rate < worstRate) {
        worstRate = rate;
        worst = d;
      }
    }
    if (best < 0 || bestRate - worstRate < 0.2) continue;
    cards.push({
      id: `weekday:${routine.id}`,
      kind: "weekday",
      title: `${routine.title} loves ${DOW_FULL[best]}s`,
      body: `${Math.round(bestRate * 100)}% completion on ${DOW_FULL[best]}s vs ${Math.round(worstRate * 100)}% on ${DOW_FULL[worst]}s.`,
      accent: routine.color,
    });
  }
  return cards.slice(0, 3);
}

function timeOfDayInsights(data: AppData): InsightCard[] {
  const buckets = { morning: 0, afternoon: 0, evening: 0 };
  let total = 0;
  for (const log of Object.values(data.logs)) {
    for (const entry of Object.values(log.entries)) {
      if (!entry.completed || !entry.ratedAt) continue;
      const hour = new Date(entry.ratedAt).getHours();
      total++;
      if (hour < 12) buckets.morning++;
      else if (hour < 17) buckets.afternoon++;
      else buckets.evening++;
    }
  }
  if (total < 15) return [];
  const entries = Object.entries(buckets) as [keyof typeof buckets, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [top, count] = entries[0];
  const label =
    top === "morning"
      ? "mornings"
      : top === "afternoon"
        ? "afternoons"
        : "evenings";
  return [
    {
      id: "tod:peak",
      kind: "time_of_day",
      title: "Your peak check-in window",
      body: `Most of your completions land in the ${label} (${Math.round((count / total) * 100)}% of rated wins).`,
      accent: "#4aa3ff",
    },
  ];
}

/** Compute insight cards for Progress. Stable order: correlation, weekday, time. */
export function computeInsights(data: AppData, limit = 6): InsightCard[] {
  return [
    ...correlationInsights(data),
    ...weekdayInsights(data),
    ...timeOfDayInsights(data),
  ].slice(0, limit);
}
