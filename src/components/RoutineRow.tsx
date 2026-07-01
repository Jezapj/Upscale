import type { AppData, Routine } from "@/lib/types";
import { Tile } from "./Tile";
import { RatingButtons } from "./RatingButtons";
import { describeFrequency } from "@/lib/frequency";
import { RATING_BY_KEY } from "@/lib/rating";
import { computeRoutineStats } from "@/lib/stats";
import { todayKey } from "@/lib/dates";
import { useStore } from "@/store/useStore";
import { Flame, Bell } from "lucide-react";
import { formatReminderLabel } from "@/lib/reminders";

interface Props {
  routine: Routine;
  data: AppData;
  showRating?: boolean;
  onOpen?: () => void;
}

export function RoutineRow({ routine, data, showRating = true, onOpen }: Props) {
  const rate = useStore((s) => s.rate);
  const key = todayKey();
  const entry = data.logs[key]?.entries[routine.id];
  const stats = computeRoutineStats(data, routine);
  const tileState =
    entry?.rating === "no" ? "priority" : entry?.completed ? "done" : "default";

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <button onClick={onOpen} className="shrink-0 active:scale-95 transition-transform">
          <Tile glyph={routine.icon} color={routine.color} size={52} state={tileState} />
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="content-title truncate font-800">{routine.title}</span>
            {tileState === "priority" && (
              <span className="rounded-full bg-cat-exercise px-2 py-0.5 text-[10px] font-900 text-white">
                Priority
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-700 text-ink-faint">
            <span>{describeFrequency(routine.frequency)}</span>
            {routine.reminderTime && (
              <span className="flex items-center gap-0.5 text-cat-project">
                <Bell size={12} />
                {formatReminderLabel(routine.reminderTime)}
              </span>
            )}
            {stats.streak > 0 && (
              <span className="flex items-center gap-0.5 text-cat-exercise">
                <Flame size={12} /> {stats.streak}
              </span>
            )}
          </div>
        </button>
        {entry && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-900 text-white shadow-soft"
            style={{ background: RATING_BY_KEY[entry.rating].color }}
            title={RATING_BY_KEY[entry.rating].effect}
          >
            {RATING_BY_KEY[entry.rating].emoji}
          </span>
        )}
      </div>
      {showRating && (
        <div className="mt-3">
          <RatingButtons value={entry?.rating} onPick={(r) => rate(routine.id, r)} size="sm" />
        </div>
      )}
    </div>
  );
}
