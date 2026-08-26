import type { AppData, Goal, Routine } from "./types";
import { dayKey, daysBetween, lastNDays, parseDay } from "./dates";
import { isScheduledOn } from "./frequency";
import {
  bankedGraceCount,
  graceShieldedDays,
  graceSpendTxnId,
  makeTxn,
} from "./economy";

export interface RoutineStats {
  /** completion rate over scheduled days so far (0..1). */
  rate: number;
  /** current consecutive scheduled-day streak with a completion. */
  streak: number;
  /** best streak ever. */
  bestStreak: number;
  /** total completions. */
  completions: number;
  /** total scheduled days that have passed. */
  scheduled: number;
  /** Missed days bridged by streak insurance (not counted as real completions). */
  graceUsed?: number;
}

/** Per-day completion state for a routine, for heatmaps. */
export type DayState =
  | "none"
  | "missed"
  | "partial"
  | "done"
  | "future"
  | "shielded";

/**
 * Apply grace tokens to bridge single missed days for current-streak display.
 * Only honours already-persisted grace_spend txns (see consumeGraceForRoutine).
 */
export function applyGraceToCompletionDays(
  data: AppData,
  routine: Routine,
  completionByDay: { key: string; done: boolean }[],
): {
  days: { key: string; done: boolean; shielded: boolean }[];
  graceUsed: number;
} {
  const shieldedExisting = graceShieldedDays(data.wallet, routine.id);
  const days = completionByDay.map((d) => ({
    ...d,
    shielded: shieldedExisting.has(d.key),
  }));

  for (const d of days) {
    if (d.shielded) d.done = true;
  }

  return { days, graceUsed: shieldedExisting.size };
}

export function routineDayState(
  data: AppData,
  routine: Routine,
  key: string,
): DayState {
  const today = dayKey();
  const inFuture = daysBetween(today, key) > 0;
  if (!isScheduledOn(routine, key)) return "none";
  const entry = data.logs[key]?.entries[routine.id];
  if (inFuture) return "future";
  if (graceShieldedDays(data.wallet, routine.id).has(key)) return "shielded";
  if (!entry) return daysBetween(key, today) === 0 ? "none" : "missed";
  if (entry.rating === "yes") return "done";
  if (entry.rating === "kinda") return "partial";
  if (entry.rating === "not_really") return "partial";
  return "missed";
}

export function computeRoutineStats(
  data: AppData,
  routine: Routine,
): RoutineStats {
  const created = routine.createdAt.slice(0, 10);
  const today = dayKey();
  const total = Math.max(0, daysBetween(created, today)) + 1;

  let scheduled = 0;
  let completions = 0;
  const completionByDay: { key: string; done: boolean }[] = [];

  for (let i = 0; i < total; i++) {
    const d = parseDay(created);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (!isScheduledOn(routine, key)) continue;
    scheduled++;
    const entry = data.logs[key]?.entries[routine.id];
    const done = !!entry?.completed;
    if (done) completions++;
    completionByDay.push({ key, done });
  }

  const { days } = applyGraceToCompletionDays(data, routine, completionByDay);

  let streak = 0;
  let bestStreak = 0;
  let run = 0;
  for (const day of days) {
    if (day.done) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].done) streak++;
    else break;
  }

  return {
    rate: scheduled ? completions / scheduled : 0,
    streak,
    bestStreak,
    completions,
    scheduled,
    graceUsed: days.filter((d) => d.shielded).length,
  };
}

/**
 * If the current streak tip is a single miss and grace is banked, spend one
 * grace token to shield that day. Idempotent per routine/day.
 */
export function consumeGraceForRoutine(
  data: AppData,
  routine: Routine,
): AppData {
  const created = routine.createdAt.slice(0, 10);
  const today = dayKey();
  const total = Math.max(0, daysBetween(created, today)) + 1;
  const completionByDay: { key: string; done: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const d = parseDay(created);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (!isScheduledOn(routine, key)) continue;
    completionByDay.push({
      key,
      done: !!data.logs[key]?.entries[routine.id]?.completed,
    });
  }

  const shielded = graceShieldedDays(data.wallet, routine.id);
  const days = completionByDay.map((d) => ({
    ...d,
    done: d.done || shielded.has(d.key),
  }));

  // Find the first miss walking from the end (tip of streak).
  let tipMiss: string | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].done) continue;
    tipMiss = days[i].key;
    break;
  }
  if (!tipMiss) return data;
  if (bankedGraceCount(data.wallet, routine.id) <= 0) return data;

  const id = graceSpendTxnId(routine.id, tipMiss);
  if (data.wallet?.txns.some((t) => t.id === id)) return data;

  return {
    ...data,
    wallet: {
      txns: [...(data.wallet?.txns ?? []), makeTxn(id, 0, "grace_spend", tipMiss)],
    },
  };
}

export function consumeGraceForAll(data: AppData): AppData {
  let next = data;
  for (const r of data.routines.filter((x) => !x.archived)) {
    next = consumeGraceForRoutine(next, r);
  }
  return next;
}

export interface GoalProgress {
  routineCount: number;
  /** average completion rate across contributing routines (0..1). */
  rate: number;
  /** number of contributing routines completed today. */
  doneToday: number;
  dueToday: number;
  bestStreak: number;
}

export function routinesForGoal(data: AppData, goalId: string): Routine[] {
  return data.routines.filter((r) => r.goalId === goalId && !r.archived);
}

export function computeGoalProgress(data: AppData, goal: Goal): GoalProgress {
  const routines = routinesForGoal(data, goal.id);
  if (routines.length === 0) {
    return { routineCount: 0, rate: 0, doneToday: 0, dueToday: 0, bestStreak: 0 };
  }
  const today = dayKey();
  let rateSum = 0;
  let doneToday = 0;
  let dueToday = 0;
  let bestStreak = 0;
  for (const r of routines) {
    const s = computeRoutineStats(data, r);
    rateSum += s.rate;
    bestStreak = Math.max(bestStreak, s.bestStreak);
    if (isScheduledOn(r, today)) {
      dueToday++;
      if (data.logs[today]?.entries[r.id]?.completed) doneToday++;
    }
  }
  return {
    routineCount: routines.length,
    rate: rateSum / routines.length,
    doneToday,
    dueToday,
    bestStreak,
  };
}

/** Overall daily completion ratio across all scheduled routines, for charts. */
export function dailyCompletionSeries(
  data: AppData,
  n: number,
): { key: string; ratio: number; scheduled: number }[] {
  return lastNDays(n).map((key) => {
    const scheduledRoutines = data.routines.filter(
      (r) => !r.archived && isScheduledOn(r, key),
    );
    const done = scheduledRoutines.filter(
      (r) => data.logs[key]?.entries[r.id]?.completed,
    ).length;
    return {
      key,
      scheduled: scheduledRoutines.length,
      ratio: scheduledRoutines.length ? done / scheduledRoutines.length : 0,
    };
  });
}
