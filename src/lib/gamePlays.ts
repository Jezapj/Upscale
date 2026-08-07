import { DAILY_FREE_PLAYS, UNLIMITED_PLAYS } from "./games";
import type { AppData, GameId, GamePlaysState } from "./types";

function emptyState(today: string): GamePlaysState {
  return { date: today, endlessTotal: 0 };
}

/** Migrate legacy per-game counts into a single daily total. */
function endlessUsed(state: GamePlaysState): number {
  if (state.endlessTotal > 0) return state.endlessTotal;
  if (!state.counts) return 0;
  return Object.values(state.counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

export function normalizeGamePlays(
  state: GamePlaysState | undefined,
  today: string,
): GamePlaysState {
  if (!state || state.date !== today) return emptyState(today);
  return {
    date: today,
    endlessTotal: endlessUsed(state),
  };
}

export function endlessPlaysRemaining(data: AppData, today: string): number {
  if (UNLIMITED_PLAYS || data.gamePremium) return 999;
  const gp = normalizeGamePlays(data.gamePlays, today);
  return Math.max(0, DAILY_FREE_PLAYS - gp.endlessTotal);
}

export function playsRemaining(
  data: AppData,
  _gameId: GameId,
  today: string,
): number {
  return endlessPlaysRemaining(data, today);
}

export function canPlayGame(
  data: AppData,
  gameId: GameId,
  today: string,
): boolean {
  if (UNLIMITED_PLAYS) return true;
  return playsRemaining(data, gameId, today) > 0;
}

export function recordGamePlay(
  data: AppData,
  _gameId: GameId,
  today: string,
): AppData {
  if (UNLIMITED_PLAYS || data.gamePremium) return data;
  const gp = normalizeGamePlays(data.gamePlays, today);
  return {
    ...data,
    gamePlays: {
      date: today,
      endlessTotal: gp.endlessTotal + 1,
    },
  };
}
