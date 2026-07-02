import type { AppData, GameId, GameScoreEntry } from "./types";

const MAX_ENTRIES = 10;
const EMPTY_SCORES: GameScoreEntry[] = [];

export function leaderboardKey(gameId: GameId, subKey?: string): string {
  return subKey ?? gameId;
}

export function getGameScores(data: AppData, key: string): GameScoreEntry[] {
  return data.gameScores?.[key] ?? EMPTY_SCORES;
}

export function formatPlayedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function recordGameScore(
  data: AppData,
  key: string,
  score: number,
  meta?: Record<string, string>,
): { data: AppData; isNewBest: boolean } {
  const boards = data.gameScores ?? {};
  const prevBest = boards[key]?.[0]?.score ?? 0;
  const entry: GameScoreEntry = {
    score,
    playedAt: new Date().toISOString(),
    meta,
  };

  const next = [...(boards[key] ?? []), entry]
    .sort((a, b) => b.score - a.score || b.playedAt.localeCompare(a.playedAt))
    .slice(0, MAX_ENTRIES);

  const isNewBest = score > prevBest || (prevBest === 0 && score > 0);

  return {
    data: { ...data, gameScores: { ...boards, [key]: next } },
    isNewBest,
  };
}
