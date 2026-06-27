import type { AppData, Routine } from "@/lib/types";
import { Tile } from "./Tile";
import { RatingButtons } from "./RatingButtons";
import { describeFrequency } from "@/lib/frequency";
import { RATING_BY_KEY } from "@/lib/rating";
import { todayKey } from "@/lib/dates";
import { useStore } from "@/store/useStore";
import { isEmoji } from "@/lib/icons";

interface Props {
  routine: Routine;
  data: AppData;
  /** IISU "recently played" list row — no inline rating buttons */
  compact?: boolean;
  showRating?: boolean;
  onOpen?: () => void;
}

/**
 * IISU "Recently played" style row: blurred colour wash behind the title,
 * small squircle icon on the left, status on the right.
 */
export function ActivityRow({
  routine,
  data,
  compact = false,
  showRating = false,
  onOpen,
}: Props) {
  const rate = useStore((s) => s.rate);
  const key = todayKey();
  const entry = data.logs[key]?.entries[routine.id];
  const tileState =
    entry?.rating === "no" ? "priority" : entry?.completed ? "done" : "default";

  return (
    <div
      className={`relative overflow-hidden rounded-tile shadow-soft ${
        tileState === "priority" ? "animate-pulse-red ring-2 ring-cat-exercise/60" : ""
      }`}
    >
      {/* blurred colour wash — like IISU game artwork behind list rows */}
      <div
        className="absolute inset-0 scale-110 blur-2xl"
        style={{
          background: `linear-gradient(135deg, ${routine.color}55 0%, ${routine.color}22 100%)`,
        }}
      />
      <div className="activity-row-scrim absolute inset-0 bg-white/72 backdrop-blur-[2px]" />

      <div className="relative flex items-center gap-3 p-3">
        <button
          onClick={onOpen}
          className="shrink-0 active:scale-95 transition-transform"
        >
          <Tile
            glyph={routine.icon}
            color={routine.color}
            size={compact ? 44 : 50}
            state={tileState}
          />
        </button>

        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="content-title truncate font-800">{routine.title}</p>
          <p className="truncate text-xs font-700 text-ink-soft">
            {describeFrequency(routine.frequency)}
            {entry && ` · ${RATING_BY_KEY[entry.rating].label}`}
          </p>
        </button>

        {entry ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-900 text-white shadow-soft"
            style={{ background: RATING_BY_KEY[entry.rating].color }}
          >
            {RATING_BY_KEY[entry.rating].emoji}
          </span>
        ) : (
          <span className="shrink-0 rounded-pill bg-white/80 px-2.5 py-1 text-[10px] font-900 text-ink-faint shadow-soft">
            due
          </span>
        )}
      </div>

      {showRating && (
        <div className="relative border-t border-white/60 px-3 pb-3 pt-2">
          <RatingButtons
            value={entry?.rating}
            onPick={(r) => rate(routine.id, r)}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

/** Routine tile that prefers emoji when user picked one, else shows glyph. */
export function RoutineTile({
  routine,
  size = 44,
  state = "default" as const,
  onClick,
}: {
  routine: Pick<Routine, "icon" | "color">;
  size?: number;
  state?: "default" | "priority" | "done" | "selected";
  onClick?: () => void;
}) {
  const useEmoji = isEmoji(routine.icon);
  return (
    <Tile
      glyph={useEmoji ? routine.icon : "⭐"}
      color={routine.color}
      size={size}
      state={state}
      onClick={onClick}
    />
  );
}
