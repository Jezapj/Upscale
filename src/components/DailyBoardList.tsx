import type { DailyBoardEntry } from "@/lib/dailyLeaderboard";

interface Props {
  entries: DailyBoardEntry[];
  /** Highlight the signed-in user's row. */
  highlightUid?: string | null;
  compact?: boolean;
  emptyHint?: string;
}

/** Global daily challenge leaderboard (names + scores). */
export function DailyBoardList({
  entries,
  highlightUid,
  compact,
  emptyHint = "No scores yet today — be the first.",
}: Props) {
  if (entries.length === 0) {
    return <p className="text-xs font-700 text-ink-faint">{emptyHint}</p>;
  }

  return (
    <div
      className={`w-full max-w-xs overflow-hidden rounded-xl border border-white/10 bg-black/20 ${
        compact ? "text-left" : ""
      }`}
    >
      <div className="border-b border-white/10 px-3 py-1.5">
        <p className="text-[10px] font-800 uppercase tracking-wide text-ink-faint">
          Today&apos;s board
        </p>
      </div>
      <ul className={`max-h-44 overflow-y-auto ${compact ? "text-xs" : "text-sm"}`}>
        {entries.map((entry, i) => {
          const isYou = highlightUid != null && entry.uid === highlightUid;
          const name = entry.displayName?.trim() || "Anonymous";
          return (
            <li
              key={`${entry.uid}-${entry.playedAt}`}
              className={`flex items-center justify-between gap-2 border-b border-white/5 px-3 py-1.5 last:border-0 ${
                isYou ? "bg-accent/10" : ""
              }`}
            >
              <span className="w-4 shrink-0 font-800 text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-800 text-ink">
                {name}
                {isYou ? (
                  <span className="ml-1 text-[10px] font-700 text-accent">you</span>
                ) : null}
              </span>
              <span className="shrink-0 font-800 text-ink">
                {entry.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
