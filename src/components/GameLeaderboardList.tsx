import type { GameScoreEntry } from "@/lib/types";
import { formatPlayedAt } from "@/lib/gameLeaderboard";

interface Props {
  entries: GameScoreEntry[];
  /** Highlight the first row (current run). */
  highlightScore?: number;
  compact?: boolean;
}

/** Personal high-score list for an arcade game. */
export function GameLeaderboardList({ entries, highlightScore, compact }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-xs font-700 text-ink-faint">No scores yet — your first run goes here.</p>
    );
  }

  return (
    <div
      className={`w-full max-w-xs overflow-hidden rounded-xl border border-white/10 bg-black/20 ${
        compact ? "text-left" : ""
      }`}
    >
      <div className="border-b border-white/10 px-3 py-1.5">
        <p className="text-[10px] font-800 uppercase tracking-wide text-ink-faint">Leaderboard</p>
      </div>
      <ul className={`max-h-36 overflow-y-auto ${compact ? "text-xs" : "text-sm"}`}>
        {entries.map((entry, i) => {
          const isHighlight = highlightScore !== undefined && entry.score === highlightScore && i === 0;
          return (
            <li
              key={`${entry.playedAt}-${entry.score}`}
              className={`flex items-center justify-between gap-2 border-b border-white/5 px-3 py-1.5 last:border-0 ${
                isHighlight ? "bg-accent/10" : ""
              }`}
            >
              <span className="font-800 text-ink-faint w-4 shrink-0">{i + 1}</span>
              <span className="font-800 text-ink min-w-0 flex-1 truncate">
                {entry.score.toLocaleString()}
                {entry.meta?.Distance ? (
                  <span className="ml-1 text-[10px] font-700 text-ink-faint">{entry.meta.Distance}</span>
                ) : null}
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
