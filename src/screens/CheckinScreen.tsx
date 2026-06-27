import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Home, Flame } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Tile } from "@/components/Tile";
import { RatingButtons } from "@/components/RatingButtons";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { CheckinHints } from "@/components/ScreenHints";
import { isDueToday } from "@/lib/frequency";
import { todayKey } from "@/lib/dates";
import { describeFrequency } from "@/lib/frequency";
import { getCategory } from "@/lib/categories";
import { computeRoutineStats } from "@/lib/stats";
import { RATING_BY_KEY } from "@/lib/rating";
import type { Rating, Routine } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";

export function CheckinScreen() {
  const nav = useNavigate();
  const { data, rate } = useStore();
  const key = todayKey();

  // Freeze the queue order on mount so re-rating doesn't reshuffle the flow.
  // Ordered by goal (grouped), then general; within a group, by category.
  const [queue] = useState<Routine[]>(() => {
    const due = data.routines.filter((r) => isDueToday(r, key, data));
    const goalOrder = new Map(data.goals.map((g, i) => [g.id, i]));
    return due.sort((a, b) => {
      const ga = a.goalId ? goalOrder.get(a.goalId) ?? 999 : 1000;
      const gb = b.goalId ? goalOrder.get(b.goalId) ?? 999 : 1000;
      if (ga !== gb) return ga - gb;
      return a.category.localeCompare(b.category);
    });
  });

  const [index, setIndex] = useState(0);
  const total = queue.length;
  const current = queue[index];

  const goalFor = (r: Routine) =>
    r.goalId ? data.goals.find((g) => g.id === r.goalId) : undefined;

  const pick = (r: Rating) => {
    if (!current) return;
    rate(current.id, r);
    setTimeout(() => setIndex((i) => i + 1), 240);
  };

  useRegisterControls(
    {
      back: () => {
        if (total === 0 || index >= total) nav("/");
        else if (index === 0) nav("/");
        else setIndex((i) => i - 1);
      },
      tertiary: () => {
        if (total > 0 && index < total) setIndex((i) => i + 1);
      },
      primary: () => {
        const item = queue[index];
        if (item && index < total) pick("yes");
      },
    },
    [index, total, queue, nav, rate],
  );

  if (total === 0) {
    return <EmptyState nav={nav} />;
  }

  if (index >= total) {
    return <Summary nav={nav} queue={queue} />;
  }

  const goal = goalFor(current);
  const cat = getCategory(current.category);
  const stats = computeRoutineStats(data, current);
  const existing = data.logs[key]?.entries[current.id]?.rating;

  return (
    <div className="relative flex h-full flex-col">
      <BackgroundDecor />
      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => (index === 0 ? nav("/") : setIndex((i) => i - 1))}
          className="capsule flex h-10 w-10 items-center justify-center text-ink-soft active:scale-90"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="font-display text-lg font-800 text-ink">Check-in</span>
        <button
          onClick={() => nav("/")}
          className="capsule flex h-10 w-10 items-center justify-center text-ink-soft active:scale-90"
        >
          <Home size={18} />
        </button>
      </div>

      {/* Progress */}
      <div className="relative z-10 px-4 pt-3">
        <div className="flex items-center justify-between text-xs font-800 text-ink-soft">
          <span>
            {index + 1} of {total}
          </span>
          <span>{Math.round((index / total) * 100)}%</span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(index / total) * 100}%`,
              background: "linear-gradient(90deg,#74c0ff,#3a8ef0)",
            }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div
          key={current.id}
          className="card w-full animate-pop-in p-6 text-center"
        >
          {goal ? (
            <span
              className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-800 text-white"
              style={{ background: goal.color }}
            >
              {goal.icon} {goal.title}
            </span>
          ) : (
            <span className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-pill bg-white px-3 py-1 text-xs font-800 text-ink-soft shadow-soft">
              {cat.icon} {cat.label}
            </span>
          )}

          <div className="mx-auto mb-3 flex justify-center">
            <Tile
              glyph={current.icon}
              color={current.color}
              size={88}
              state="selected"
            />
          </div>
          <h2 className="font-display text-2xl font-800 text-ink">
            {current.title}
          </h2>
          {current.note && (
            <p className="mt-1 text-sm font-700 text-ink-soft">{current.note}</p>
          )}
          <div className="mt-2 flex items-center justify-center gap-3 text-xs font-700 text-ink-faint">
            <span>{describeFrequency(current.frequency)}</span>
            {stats.streak > 0 && (
              <span className="flex items-center gap-0.5 text-cat-exercise">
                <Flame size={13} /> {stats.streak} day streak
              </span>
            )}
          </div>

          <p className="mt-5 text-sm font-800 text-ink-soft">
            Did you do this today?
          </p>
          <div className="mt-3">
            <RatingButtons value={existing} onPick={pick} />
          </div>
          {existing && (
            <p className="mt-3 text-xs font-700" style={{ color: RATING_BY_KEY[existing].color }}>
              {RATING_BY_KEY[existing].effect}
            </p>
          )}
        </div>

        <button
          onClick={() => setIndex((i) => i + 1)}
          className="mt-4 text-sm font-800 text-ink-faint active:scale-95"
        >
          Skip for now
        </button>
      </div>

      <div className="relative z-10">
        <CheckinHints />
      </div>
    </div>
  );
}

function EmptyState({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
      <BackgroundDecor />
      <div className="relative z-10 animate-pop-in flex flex-col items-center">
        <Tile glyph="🎉" color="#2bc4a8" size={96} state="done" />
        <h2 className="mt-4 font-display text-2xl font-800 text-ink">
          All caught up!
        </h2>
        <p className="mt-1 text-sm font-700 text-ink-soft">
          Nothing is due right now. Everything is cleared until its next
          scheduled day.
        </p>
        <button onClick={() => nav("/")} className="btn mt-6">
          <Home size={18} /> Back home
        </button>
      </div>
      <CheckinHints />
    </div>
  );
}

function Summary({
  nav,
  queue,
}: {
  nav: ReturnType<typeof useNavigate>;
  queue: Routine[];
}) {
  const data = useStore((s) => s.data);
  const key = todayKey();
  const rated = queue.map((r) => ({
    r,
    entry: data.logs[key]?.entries[r.id],
  }));
  const cleared = rated.filter((x) => x.entry?.cleared).length;
  const priority = rated.filter((x) => x.entry?.rating === "no");
  const done = rated.filter((x) => x.entry?.completed).length;

  return (
    <div className="relative flex h-full flex-col">
      <BackgroundDecor />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="animate-pop-in">
          <Tile
            glyph={priority.length ? "💪" : "🌟"}
            color={priority.length ? "#ff7a59" : "#4aa3ff"}
            size={96}
            state="selected"
          />
        </div>
        <h2 className="mt-4 font-display text-3xl font-800 text-ink">
          Check-in complete
        </h2>
        <p className="mt-1 text-sm font-700 text-ink-soft">
          {done} completed · {cleared} cleared
          {priority.length > 0 && ` · ${priority.length} priority`}
        </p>

        {priority.length > 0 && (
          <div className="card mt-5 w-full p-4 text-left">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-800 text-cat-exercise">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cat-exercise text-[11px] text-white">
                !
              </span>
              Priorities to tackle
            </p>
            <div className="space-y-2">
              {priority.map(({ r }) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Tile glyph={r.icon} color={r.color} size={32} state="priority" />
                  <span className="content-title font-800">{r.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => nav("/")} className="btn mt-6 w-full">
          <Check size={18} /> Done
        </button>
      </div>
      <CheckinHints />
    </div>
  );
}
