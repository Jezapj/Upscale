import type { GameId, GameScoreEntry } from "@/lib/types";
import { formatPlayedAt } from "@/lib/gameLeaderboard";
import { BOARD_STAT_LABEL, GameStatDetail } from "./GameStatDetail";

interface Props {
  entries: GameScoreEntry[];
  /** Drives the per-game stat columns. */
  gameId: GameId;
  /** Highlight the first row (current run). */
  highlightScore?: number;
  compact?: boolean;
}

/** Personal high-score list for an arcade game. */
export function GameLeaderboardList({
  entries,
  gameId,
  highlightScore,
  compact,
}: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-xs font-700 text-ink-faint">
        No scores yet - your first run goes here.
      </p>
    );
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="flex items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-800 uppercase tracking-wide text-ink-faint">
          Your best runs
        </p>
        <p className="text-[9px] font-800 uppercase tracking-wide text-ink-faint">
          {BOARD_STAT_LABEL[gameId]}
        </p>
      </div>
      <ul
        className={`overflow-y-auto ${compact ? "max-h-52 text-xs" : "max-h-64 text-sm"}`}
      >
        {entries.map((entry, i) => {
          const isHighlight =
            highlightScore !== undefined && entry.score === highlightScore && i === 0;
          return (
            <li
              key={`${entry.playedAt}-${entry.score}`}
              className={`flex items-center gap-2.5 border-b border-white/5 px-3 py-2 last:border-0 ${
                isHighlight ? "bg-accent/10" : ""
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[11px] font-800 tabular-nums text-ink-faint">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-base font-800 tabular-nums leading-none text-ink">
                    {entry.score.toLocaleString()}
                  </span>
                  {entry.meta?.Distance ? (
                    <span className="text-[10px] font-700 text-ink-faint">
                      {entry.meta.Distance}
                    </span>
                  ) : null}
                </span>
                <GameStatDetail gameId={gameId} meta={entry.meta} />
              </span>
              <span className="shrink-0 text-[10px] font-700 text-ink-faint">
                {formatPlayedAt(entry.playedAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
