import type { GameId } from "@/lib/types";

/**
 * Shared per-game stat rendering for the daily and practice boards. Values come
 * from `GameResult.stats` (label → value), so the labels here must match the
 * ones each game emits.
 */

type Medal = "gold" | "silver" | "bronze" | "none";

const MEDAL_FILL: Record<Medal, string> = {
  gold: "#f6c453",
  silver: "#cdd6e6",
  bronze: "#cf8b52",
  none: "transparent",
};

/** Stat column caption per game, shown in a list header. */
export const BOARD_STAT_LABEL: Record<GameId, string> = {
  tiptop: "Stars · Score",
  octane: "Top speed · Time",
  dissiada: "Combo · Score",
  daybreak: "Tries · Done",
};

function parseMedals(raw: string | undefined): Medal[] {
  const parts = (raw ?? "").split(",");
  return Array.from({ length: 3 }, (_, i) => {
    const v = parts[i]?.trim();
    return v === "gold" || v === "silver" || v === "bronze" ? v : "none";
  });
}

function MedalStar({ medal }: { medal: Medal }) {
  const earned = medal !== "none";
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5 7.3 14.03 2.6 9.45l6.5-.95z"
        fill={MEDAL_FILL[medal]}
        stroke={earned ? "rgba(0,0,0,0.35)" : "currentColor"}
        strokeWidth={earned ? 1 : 1.6}
        className={earned ? "" : "text-white/20"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Renders a `"gold,silver,none"` medal string as a row of stars. */
export function MedalStars({
  value,
  className = "",
}: {
  value: string | undefined;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-0.5 ${className}`}>
      {parseMedals(value).map((m, i) => (
        <MedalStar key={i} medal={m} />
      ))}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-800 tabular-nums text-ink-soft">
      {children}
    </span>
  );
}

/** The headline stats for one board row: whatever matters most for this game. */
export function GameStatDetail({
  gameId,
  meta,
}: {
  gameId: GameId;
  meta: Record<string, string> | undefined;
}) {
  if (gameId === "tiptop") {
    return (
      <span className="flex items-center gap-1.5">
        <MedalStars value={meta?.Medals} />
        {meta?.Time ? <Chip>{meta.Time}</Chip> : null}
      </span>
    );
  }

  if (gameId === "octane") {
    return (
      <span className="flex items-center gap-1">
        {meta?.["Top speed"] ? <Chip>{meta["Top speed"]}</Chip> : null}
        {meta?.Time ? <Chip>{meta.Time}</Chip> : null}
      </span>
    );
  }

  if (gameId === "dissiada") {
    return (
      <span className="flex items-center gap-1">
        {meta?.["Max combo"] ? <Chip>{meta["Max combo"]} combo</Chip> : null}
        {meta?.Notes ? <Chip>{meta.Notes} notes</Chip> : null}
      </span>
    );
  }

  const pct = Number.parseInt(meta?.Progress ?? "", 10);
  return (
    <span className="flex items-center gap-1.5">
      {meta?.Attempts ? <Chip>{meta.Attempts} tries</Chip> : null}
      {Number.isFinite(pct) ? (
        <span className="flex items-center gap-1">
          <span className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </span>
          <span className="text-[10px] font-800 tabular-nums text-ink-soft">
            {pct}%
          </span>
        </span>
      ) : null}
    </span>
  );
}
