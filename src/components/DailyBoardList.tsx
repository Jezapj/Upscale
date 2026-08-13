import type { GameId } from "@/lib/types";
import type { DailyBoardEntry } from "@/lib/dailyLeaderboard";
import { BOARD_STAT_LABEL, GameStatDetail } from "./GameStatDetail";

interface Props {
  entries: DailyBoardEntry[];
  /** Drives the per-game stat columns. */
  gameId: GameId;
  /** Highlight the signed-in user's row. */
  highlightUid?: string | null;
  compact?: boolean;
  emptyHint?: string;
}

const RANK_STYLE = [
  "bg-[#f6c453]/20 text-[#f6c453]",
  "bg-white/15 text-ink",
  "bg-[#cf8b52]/25 text-[#e0a273]",
];

/** Global daily challenge leaderboard with per-game stat columns. */
export function DailyBoardList({
  entries,
  gameId,
  highlightUid,
  compact,
  emptyHint = "No scores yet today - be the first.",
}: Props) {
  if (entries.length === 0) {
    return <p className="text-xs font-700 text-ink-faint">{emptyHint}</p>;
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="flex items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-800 uppercase tracking-wide text-ink-faint">
          Today&apos;s board
        </p>
        <p className="text-[9px] font-800 uppercase tracking-wide text-ink-faint">
          {BOARD_STAT_LABEL[gameId]}
        </p>
      </div>
      <ul
        className={`overflow-y-auto ${compact ? "max-h-56 text-xs" : "max-h-72 text-sm"}`}
      >
        {entries.map((entry, i) => {
          const isYou = highlightUid != null && entry.uid === highlightUid;
          const name = entry.displayName?.trim() || "Anonymous";
          return (
            <li
              key={`${entry.uid}-${entry.playedAt}`}
              className={`flex items-center gap-2.5 border-b border-white/5 px-3 py-2 last:border-0 ${
                isYou ? "bg-accent/10" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-800 tabular-nums ${
                  RANK_STYLE[i] ?? "bg-white/5 text-ink-faint"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-800 leading-tight text-ink">
                  {name}
                  {isYou ? (
                    <span className="ml-1 text-[10px] font-700 text-accent">
                      you
                    </span>
                  ) : null}
                </span>
                <GameStatDetail gameId={gameId} meta={entry.meta} />
              </span>
              <span className="shrink-0 text-right font-display text-base font-800 tabular-nums leading-none text-ink">
                {entry.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
