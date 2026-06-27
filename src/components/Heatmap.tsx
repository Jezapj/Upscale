import type { AppData, Routine } from "@/lib/types";
import { lastNDays } from "@/lib/dates";
import { routineDayState, type DayState } from "@/lib/stats";

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
    case "missed":
      return "#ffd4d4";
    case "future":
      return "rgba(120,150,180,0.06)";
    default:
      return "rgba(120,150,180,0.12)";
  }
};

/** GitHub-style contribution grid for a single routine. */
export function Heatmap({ data, routine, weeks = 16, accent = "#3a8ef0" }: Props) {
  const days = lastNDays(weeks * 7);
  // Build columns of 7 (weeks).
  const columns: string[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    columns.push(days.slice(i, i + 7));
  }
  return (
    <div className="hscroll flex gap-[3px] pb-1">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((key) => {
            const st = routineDayState(data, routine, key);
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
}
