/**
 * Shared daily arcade challenge: one seeded run per game per local calendar day.
 */

import { todayKey } from "./dates";
import type { AppData, ArcadeDailyCompletion, GameId } from "./types";

/** Octane daily is always a quarter-mile drag. */
export const DAILY_OCTANE_DISTANCE_M = 402;
export const DAILY_OCTANE_DISTANCE_KEY = "402" as const;
export const DAILY_OCTANE_RACE_LABEL = "1/4 mile";

const emptyCompleted = (): Partial<Record<GameId, ArcadeDailyCompletion>> => ({});

/** Stable uint32 from `${day}:${gameId}` so everyone shares the same course. */
export function dailySeed(gameId: GameId, day: string = todayKey()): number {
  const input = `${day}:${gameId}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Mix further so nearby days don't look related.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function dailyBoardDocId(gameId: GameId, day: string = todayKey()): string {
  return `${gameId}_${day}`;
}

export function normalizeArcadeDaily(
  state: AppData["arcadeDaily"] | undefined,
  day: string,
): NonNullable<AppData["arcadeDaily"]> {
  if (!state || state.date !== day) {
    return { date: day, completed: emptyCompleted() };
  }
  return {
    date: day,
    completed: { ...emptyCompleted(), ...state.completed },
  };
}

export function hasPlayedDaily(
  data: AppData,
  gameId: GameId,
  day: string = todayKey(),
): boolean {
  const daily = normalizeArcadeDaily(data.arcadeDaily, day);
  return !!daily.completed[gameId];
}

export function getDailyCompletion(
  data: AppData,
  gameId: GameId,
  day: string = todayKey(),
): ArcadeDailyCompletion | undefined {
  return normalizeArcadeDaily(data.arcadeDaily, day).completed[gameId];
}

export function markDailyPlayed(
  data: AppData,
  gameId: GameId,
  score: number,
  day: string = todayKey(),
  playedAt: string = new Date().toISOString(),
  overwrite = false,
): AppData {
  const daily = normalizeArcadeDaily(data.arcadeDaily, day);
  if (daily.completed[gameId] && !overwrite) return data;
  return {
    ...data,
    arcadeDaily: {
      date: day,
      completed: {
        ...daily.completed,
        [gameId]: { score, playedAt },
      },
    },
  };
}

/** Union daily completions from two devices (same calendar day). */
export function mergeArcadeDailyStates(
  a: AppData["arcadeDaily"],
  b: AppData["arcadeDaily"],
  day: string = todayKey(),
): NonNullable<AppData["arcadeDaily"]> {
  const left = normalizeArcadeDaily(a, day);
  const right = normalizeArcadeDaily(b, day);
  const completed = { ...left.completed };
  for (const [key, entry] of Object.entries(right.completed)) {
    const gameId = key as GameId;
    const cur = completed[gameId];
    if (!cur) {
      completed[gameId] = entry;
      continue;
    }
    if (entry.score > cur.score) {
      completed[gameId] = entry;
    } else if (entry.score === cur.score && entry.playedAt > cur.playedAt) {
      completed[gameId] = entry;
    }
  }
  return { date: day, completed };
}

export function validateArcadeUsername(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 16) return null;
  if (!/^[\w .'-]+$/u.test(name)) return null;
  return name;
}

export function arcadeDisplayName(
  profile: AppData["arcadeProfile"] | undefined,
): string | null {
  if (!profile || profile.optedOut) return null;
  return profile.username;
}
