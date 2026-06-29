import { DAILY_FREE_PLAYS, UNLIMITED_PLAYS } from "./games";
import type { AppData, GameId, GamePlaysState } from "./types";

function emptyCounts(): Record<GameId, number> {
  return { tiptop: 0, octane: 0, dissiada: 0 };
}

export function normalizeGamePlays(
  state: GamePlaysState | undefined,
  today: string,
): GamePlaysState {
  if (!state || state.date !== today) {
    return { date: today, counts: emptyCounts() };
  }
  return {
    date: today,
    counts: { ...emptyCounts(), ...state.counts },
  };
}

export function playsRemaining(
  data: AppData,
  gameId: GameId,
  today: string,
): number {
  if (UNLIMITED_PLAYS || data.gamePremium) return 999;
  const gp = normalizeGamePlays(data.gamePlays, today);
  return Math.max(0, DAILY_FREE_PLAYS - gp.counts[gameId]);
}

export function canPlayGame(
  _data: AppData,
  _gameId: GameId,
  _today: string,
): boolean {
  if (UNLIMITED_PLAYS) return true;
  return playsRemaining(_data, _gameId, _today) > 0;
}

export function recordGamePlay(
  data: AppData,
  gameId: GameId,
  today: string,
): AppData {
  if (UNLIMITED_PLAYS || data.gamePremium) return data;
  const gp = normalizeGamePlays(data.gamePlays, today);
  return {
    ...data,
    gamePlays: {
      date: today,
      counts: { ...gp.counts, [gameId]: gp.counts[gameId] + 1 },
    },
  };
}
