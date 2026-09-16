import type { AppData, GameId, GameScoreEntry } from "./types";

const MAX_ENTRIES = 10;
const EMPTY_SCORES: GameScoreEntry[] = [];

export function leaderboardKey(gameId: GameId, subKey?: string): string {
  return subKey ?? gameId;
}

function scoreIdentity(entry: GameScoreEntry): string {
  const meta = entry.meta
    ? Object.keys(entry.meta)
        .sort()
        .map((k) => `${k}=${entry.meta![k]}`)
        .join("&")
    : "";
  return `${entry.playedAt}|${entry.score}|${meta}`;
}

/** Drop duplicate runs (same time + score + stats) and keep the top 10. */
export function compactScoreEntries(entries: GameScoreEntry[]): GameScoreEntry[] {
  const seen = new Set<string>();
  const unique: GameScoreEntry[] = [];
  for (const entry of entries) {
    const id = scoreIdentity(entry);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(entry);
  }
  return unique
    .sort((a, b) => b.score - a.score || b.playedAt.localeCompare(a.playedAt))
    .slice(0, MAX_ENTRIES);
}

export function compactGameScores(
  boards: AppData["gameScores"],
): AppData["gameScores"] {
  if (!boards) return undefined;
  const out: NonNullable<AppData["gameScores"]> = {};
  for (const [key, entries] of Object.entries(boards)) {
    out[key] = compactScoreEntries(entries ?? []);
  }
  return out;
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
  const prevBest = compactScoreEntries(boards[key] ?? [])[0]?.score ?? 0;
  const entry: GameScoreEntry = {
    score,
    playedAt: new Date().toISOString(),
    meta,
  };

  const next = compactScoreEntries([...(boards[key] ?? []), entry]);

  const isNewBest = score > prevBest || (prevBest === 0 && score > 0);

  return {
    data: { ...data, gameScores: { ...boards, [key]: next } },
    isNewBest,
  };
}
