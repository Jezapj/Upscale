/**
 * Local insight cards from DayLog correlations.
 * Cheap to compute, surfaced on the Progress screen.
 */

import type { AppData, Routine } from "./types";
import { activeLearnDecks } from "./types";
import { dayKey, dayNumber, dayNumberWeekday, DOW_FULL } from "./dates";
import { scheduledDayKeys } from "./frequency";

export type InsightKind =
  | "correlation"
  | "weekday"
  | "time_of_day"
  | "learn_retention"
  | "learn_deck"
  | "learn_time";

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

/** Per-routine scheduled / completed day keys, computed once per insight pass. */
interface RoutineHistory {
  routine: Routine;
  scheduled: string[];
  scheduledSet: Set<string>;
  done: string[];
  doneSet: Set<string>;
}

function routineHistories(data: AppData, endKey: string): RoutineHistory[] {
  return activeRoutines(data).map((routine) => {
    const scheduled = scheduledDayKeys(routine, endKey, true);
    const done = scheduled.filter(
      (k) => data.logs[k]?.entries[routine.id]?.completed,
    );
    return {
      routine,
      scheduled,
      scheduledSet: new Set(scheduled),
      done,
      doneSet: new Set(done),
    };
  });
}

function correlationInsights(histories: RoutineHistory[]): InsightCard[] {
  const cards: InsightCard[] = [];

  for (let i = 0; i < histories.length; i++) {
    const a = histories[i];
    if (a.scheduled.length === 0) continue;
    const rateOverall = a.done.length / a.scheduled.length;
    for (let j = 0; j < histories.length; j++) {
      if (i === j) continue;
      const b = histories[j];
      if (b.done.length < MIN_SHARED_DAYS) continue;
      let shared = 0;
      let doneWithB = 0;
      for (const k of b.done) {
        if (!a.scheduledSet.has(k)) continue;
        shared++;
        if (a.doneSet.has(k)) doneWithB++;
      }
      if (shared < MIN_SHARED_DAYS) continue;

      const rateWithB = doneWithB / shared;
      if (rateWithB - rateOverall < MIN_RATE_GAP) continue;

      cards.push({
        id: `corr:${a.routine.id}:${b.routine.id}`,
        kind: "correlation",
        title: "Linked habits",
        body: `You complete “${a.routine.title}” ${Math.round(rateWithB * 100)}% on days you also do “${b.routine.title}” (vs ${Math.round(rateOverall * 100)}% overall).`,
        accent: a.routine.color,
      });
    }
  }

  return cards
    .sort((x, y) => y.body.length - x.body.length)
    .slice(0, 4);
}

function weekdayInsights(histories: RoutineHistory[]): InsightCard[] {
  const cards: InsightCard[] = [];
  for (const { routine, scheduled, doneSet } of histories) {
    const byDow: { done: number; total: number }[] = Array.from(
      { length: 7 },
      () => ({ done: 0, total: 0 }),
    );
    for (const key of scheduled) {
      const dow = dayNumberWeekday(dayNumber(key));
      byDow[dow].total++;
      if (doneSet.has(key)) byDow[dow].done++;
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

/** Compute insight cards for Progress. Stable order: correlation, weekday, time, learn. */
export function computeInsights(data: AppData, limit = 6): InsightCard[] {
  const histories = routineHistories(data, dayKey());
  return [
    ...correlationInsights(histories),
    ...weekdayInsights(histories),
    ...timeOfDayInsights(data),
    ...learnInsights(data),
  ].slice(0, limit);
}

function learnInsights(data: AppData): InsightCard[] {
  const reviews = data.learn?.reviews ?? [];
  if (reviews.length < 8) return [];
  const cards: InsightCard[] = [];
  const remembered = reviews.filter((r) => r.grade === "good" || r.grade === "easy").length;
  const rate = remembered / reviews.length;
  cards.push({
    id: "learn:retention",
    kind: "learn_retention",
    title: "You remember your cards",
    body: `You rate Good or Easy on ${Math.round(rate * 100)}% of flashcard reviews.`,
    accent: "#4aa3ff",
  });

  const decks = activeLearnDecks(data.learn?.decks);
  let worst: { title: string; rate: number; color: string } | null = null;
  for (const deck of decks) {
    const rs = reviews.filter((r) => r.deckId === deck.id);
    if (rs.length < 8) continue;
    const ok = rs.filter((r) => r.grade === "good" || r.grade === "easy").length / rs.length;
    if (!worst || ok < worst.rate) {
      worst = { title: deck.title, rate: ok, color: deck.color };
    }
  }
  if (worst && worst.rate < 0.7) {
    cards.push({
      id: `learn:deck:${worst.title}`,
      kind: "learn_deck",
      title: "Toughest deck",
      body: `“${worst.title}” is sticking at ${Math.round(worst.rate * 100)}% Good/Easy. Shorter sittings help it recover.`,
      accent: worst.color,
    });
  }

  const buckets = { morning: 0, afternoon: 0, evening: 0 };
  for (const r of reviews) {
    const hour = new Date(r.reviewedAt).getHours();
    if (hour < 12) buckets.morning++;
    else if (hour < 17) buckets.afternoon++;
    else buckets.evening++;
  }
  const top = (Object.entries(buckets) as [keyof typeof buckets, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (top && reviews.length >= 15) {
    const label =
      top[0] === "morning" ? "mornings" : top[0] === "afternoon" ? "afternoons" : "evenings";
    cards.push({
      id: "learn:tod",
      kind: "learn_time",
      title: "Best study window",
      body: `Most flashcard reviews land in the ${label}.`,
      accent: "#a06bff",
    });
  }
  return cards;
}
