import { memo, useMemo } from "react";
import type { AppData, Routine } from "@/lib/types";
import { lastNDays } from "@/lib/dates";
import { routineDayStates, type DayState } from "@/lib/stats";

interface Props {
  data: AppData;
  routine: Routine;
  weeks?: number;
  accent?: string;
}

const stateStyle = (state: DayState, accent: string): string => {
  switch (state) {
    case "done":
      return accent;
    case "partial":
      return `${accent}80`;
    case "shielded":
      return "#a78bfa";
    case "missed":
      return "#ffd4d4";
    case "future":
      return "rgba(120,150,180,0.06)";
    default:
      return "rgba(120,150,180,0.12)";
  }
};

/** GitHub-style contribution grid for a single routine. */
export const Heatmap = memo(function Heatmap({
  data,
  routine,
  weeks = 16,
  accent = "#3a8ef0",
}: Props) {
  // Columns of 7 (weeks) of [key, state]. Day states only read logs + wallet,
  // so unrelated data changes don't recompute the grid.
  const columns = useMemo(() => {
    const days = lastNDays(weeks * 7);
    const states = routineDayStates(data, routine, days);
    const out: [string, DayState][][] = [];
    for (let i = 0; i < days.length; i += 7) {
      out.push(days.slice(i, i + 7).map((k, j) => [k, states[i + j]]));
    }
    return out;
  }, [data.logs, data.wallet, routine, weeks]);
  return (
    <div className="hscroll flex gap-[3px] pb-1">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map(([key, st]) => {
            return (
              <div
                key={key}
                title={key}
                className="h-3 w-3 rounded-[4px]"
                style={{ background: stateStyle(st, accent) }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
