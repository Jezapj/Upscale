import type { AppData, Goal } from "@/lib/types";
import { Tile } from "./Tile";
import { routinesForGoal } from "@/lib/stats";
import { todayKey } from "@/lib/dates";
import { isEmoji } from "@/lib/icons";

interface Props {
  goal: Goal;
  data: AppData;
  onClick?: () => void;
}

/**
 * IISU goal card: header + row of contributing routine icons + progress bar.
 * Mirrors the "Donkey Kong Country" strip in the reference home screen.
 */
export function GoalProgressStrip({ goal, data, onClick }: Props) {
  const routines = routinesForGoal(data, goal.id).slice(0, 8);
  const today = todayKey();
  const doneToday = routines.filter(
    (r) => data.logs[today]?.entries[r.id]?.completed,
  ).length;
  const dueToday = routines.length;
  const rate = dueToday ? doneToday / dueToday : 0;

  return (
    <button
      onClick={onClick}
      className="card w-full p-3 text-left active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2">
        <Tile
          glyph={goal.icon}
          color={goal.color}
          size={36}
          state="selected"
        />
        <div className="min-w-0 flex-1">
          <p className="content-title truncate font-800">{goal.title}</p>
          <p className="text-xs font-700 text-ink-faint">
            {routines.length} routine{routines.length === 1 ? "" : "s"}
            {dueToday > 0 && ` · ${doneToday}/${dueToday} today`}
          </p>
        </div>
      </div>

      {routines.length > 0 && (
        <div className="goal-routine-icons mt-2.5 flex gap-1.5 overflow-x-auto">
          {routines.map((r) => (
            <div key={r.id} className="goal-routine-icon-wrap shrink-0">
              <Tile
                glyph={isEmoji(r.icon) ? r.icon : "•"}
                color={r.color}
                size={32}
                framed={!!data.logs[today]?.entries[r.id]?.completed}
                state={
                  data.logs[today]?.entries[r.id]?.rating === "no"
                    ? "priority"
                    : data.logs[today]?.entries[r.id]?.completed
                      ? "done"
                      : "default"
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-tile-flat shadow-seg-inset">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round(rate * 100)}%`,
              background: `linear-gradient(90deg, ${goal.color}aa, ${goal.color})`,
            }}
          />
        </div>
        <span className="text-xs font-900 text-ink-soft">
          {doneToday}/{dueToday || routines.length}
        </span>
      </div>
    </button>
  );
}
