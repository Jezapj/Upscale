import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Trophy, CheckCircle2, Target } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { SegBar } from "@/components/SegBar";
import { Tile } from "@/components/Tile";
import { Heatmap } from "@/components/Heatmap";
import { ProgressRing } from "@/components/ProgressRing";
import {
  computeGoalProgress,
  computeRoutineStats,
  dailyCompletionSeries,
} from "@/lib/stats";
import { parseDay, weekdayShort } from "@/lib/dates";
import { useRegisterControls } from "@/store/useControls";

/** Bar tint by local weekday (Sun=0 … Sat=6). */
const WEEKDAY_CHART_COLORS = [
  "#f472b6", // Sun
  "#fb923c", // Mon
  "#facc15", // Tue
  "#4ade80", // Wed
  "#38bdf8", // Thu
  "#a78bfa", // Fri
  "#2dd4bf", // Sat
] as const;

function weekdayColor(key: string): string {
  return WEEKDAY_CHART_COLORS[parseDay(key).getDay()];
}

export function ProgressScreen() {
  const nav = useNavigate();
  const data = useStore((s) => s.data);
  const [scope, setScope] = useState<"routines" | "goals">("routines");

  const routines = data.routines.filter((r) => !r.archived);
  const goals = data.goals.filter((g) => !g.archived);

  const series = useMemo(() => dailyCompletionSeries(data, 30), [data]);

  // Headline stats.
  const totals = useMemo(() => {
    let completions = 0;
    let best = 0;
    let currentStreaks = 0;
    for (const r of routines) {
      const s = computeRoutineStats(data, r);
      completions += s.completions;
      best = Math.max(best, s.bestStreak);
      currentStreaks = Math.max(currentStreaks, s.streak);
    }
    return { completions, best, currentStreaks };
  }, [data, routines]);

  useRegisterControls(
    {
      back: () => nav("/"),
      tertiary: () => setScope((s) => (s === "routines" ? "goals" : "routines")),
      primary: () => {
        document.querySelector(".scroll-area")?.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
    [nav, scope],
  );

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-4">
        <PageHeader title="Progress" subtitle="Your streaks and history, mapped." />
        {/* Headline stat tiles */}
        <div className="mt-1 grid grid-cols-3 gap-3">
          <StatTile
            icon={<CheckCircle2 size={18} />}
            color="#2bc4a8"
            value={totals.completions}
            label="Completions"
          />
          <StatTile
            icon={<Flame size={18} />}
            color="#ff7a59"
            value={totals.currentStreaks}
            label="Best streak now"
          />
          <StatTile
            icon={<Trophy size={18} />}
            color="#ffb43d"
            value={totals.best}
            label="All-time streak"
          />
        </div>

        {/* 30-day completion chart */}
        <div className="card mt-4 p-4">
          <p className="mb-3 font-display text-lg font-800 text-ink">
            Last 30 days
          </p>
          <div>
            <div className="flex h-28 items-end gap-[3px]">
              {series.map((d) => {
                const color = weekdayColor(d.key);
                const hasScheduled = d.scheduled > 0;
                return (
                  <div
                    key={d.key}
                    className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                    title={`${weekdayShort(d.key)} · ${Math.round(d.ratio * 100)}%`}
                  >
                    <div
                      className="w-full rounded-t-[4px] transition-all"
                      style={{
                        height: `${Math.max(4, hasScheduled ? d.ratio * 100 : 8)}%`,
                        background: hasScheduled
                          ? `linear-gradient(180deg, ${color}cc, ${color})`
                          : color,
                        opacity: hasScheduled ? 0.5 + d.ratio * 0.5 : 0.22,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-[3px]">
              {series.map((d, i) => (
                <div
                  key={`${d.key}-label`}
                  className="flex min-h-[11px] min-w-0 flex-1 items-start justify-center"
                >
                  {i % 5 === 0 ? (
                    <span
                      className="text-[8px] font-800 leading-none"
                      style={{ color: weekdayColor(d.key) }}
                    >
                      {weekdayShort(d.key)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scope toggle */}
        <div className="mt-5">
          <SegBar
            value={scope}
            onChange={setScope}
            options={[
              { key: "routines", label: "By routine" },
              { key: "goals", label: "By goal" },
            ]}
          />
        </div>

        {scope === "routines" ? (
          routines.length === 0 ? (
            <Empty text="Add routines to start mapping your progress." />
          ) : (
            <div className="mt-3 space-y-3">
              {routines.map((r) => {
                const s = computeRoutineStats(data, r);
                return (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <Tile glyph={r.icon} color={r.color} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="content-title truncate font-800">{r.title}</p>
                        <p className="text-xs font-700 text-ink-faint">
                          {s.completions}/{s.scheduled} done · {Math.round(s.rate * 100)}%
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-pill bg-cat-exercise/10 px-2.5 py-1 text-sm font-800 text-cat-exercise">
                        <Flame size={14} /> {s.streak}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Heatmap data={data} routine={r} accent={r.color} weeks={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : goals.length === 0 ? (
          <Empty text="Create goals and tag routines to see goal-level progress." />
        ) : (
          <div className="mt-3 space-y-3">
            {goals.map((g) => {
              const p = computeGoalProgress(data, g);
              return (
                <div key={g.id} className="card flex items-center gap-4 p-4">
                  <ProgressRing value={p.rate} size={64} stroke={7} color={g.color}>
                    <span className="font-display text-base font-800 text-ink">
                      {Math.round(p.rate * 100)}%
                    </span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{g.icon}</span>
                      <p className="content-title truncate font-800">{g.title}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-700 text-ink-faint">
                      <span className="flex items-center gap-1">
                        <Target size={12} /> {p.routineCount} routines
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame size={12} /> {p.bestStreak} best
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function StatTile({
  icon,
  color,
  value,
  label,
}: {
  icon: React.ReactNode;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <div className="card flex flex-col items-center p-3 text-center">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        {icon}
      </span>
      <span className="mt-1 font-display text-2xl font-800 text-ink">
        {value}
      </span>
      <span className="text-[10px] font-700 leading-tight text-ink-faint">
        {label}
      </span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card mt-3 p-6 text-center text-sm font-600 text-ink-soft">
      {text}
    </div>
  );
}
