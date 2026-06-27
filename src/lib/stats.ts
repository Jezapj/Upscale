import type { AppData, Goal, Routine } from "./types";
import { dayKey, daysBetween, lastNDays, parseDay } from "./dates";
import { isScheduledOn } from "./frequency";

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
}

/** Per-day completion state for a routine, for heatmaps. */
export type DayState = "none" | "missed" | "partial" | "done" | "future";

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
  if (!entry) return daysBetween(key, today) === 0 ? "none" : "missed";
  if (entry.rating === "yes") return "done";
  if (entry.rating === "kinda") return "partial";
  if (entry.rating === "not_really") return "partial";
  return "missed"; // "no"
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

  // Streaks across scheduled days.
  let streak = 0;
  let bestStreak = 0;
  let run = 0;
  for (const day of completionByDay) {
    if (day.done) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }
  // current streak: walk from the end while done.
  for (let i = completionByDay.length - 1; i >= 0; i--) {
    if (completionByDay[i].done) streak++;
    else break;
  }

  return {
    rate: scheduled ? completions / scheduled : 0,
    streak,
    bestStreak,
    completions,
    scheduled,
  };
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
