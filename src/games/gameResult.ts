export interface GameStat {
  label: string;
  value: string;
}

export interface GameResult {
  score: number;
  stats?: GameStat[];
  title?: string;
}

export function formatRaceTime(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toFixed(1).padStart(4, "0")}`;
}

/** TipTop: full clear required for high scores; faster runs and fewer flaps score higher. */
export function scoreTipTop(totalFlaps: number, totalTimeMs: number, cleared: boolean): number {
  if (!cleared) {
    return Math.round(Math.max(0, 400 - totalFlaps * 8 - totalTimeMs / 250));
  }
  const timePenalty = Math.max(0, (totalTimeMs - 28_000) / 70);
  const flapPenalty = Math.max(0, (totalFlaps - 16) * 14);
  return Math.round(Math.max(120, 10_000 - timePenalty - flapPenalty));
}

/** Octane drag: faster elapsed time and higher top speed both raise the score. */
export function scoreOctaneDrag(
  raceDistanceM: number,
  elapsedMs: number,
  topMph: number,
): number {
  const elapsedSec = Math.max(elapsedMs / 1000, 0.5);
  const pace = (raceDistanceM / elapsedSec) * 5.5;
  const mphBonus = topMph * 3.2;
  return Math.round(pace + mphBonus);
}
