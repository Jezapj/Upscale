import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, PartyPopper } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { ProgressRing } from "@/components/ProgressRing";
import { Tile } from "@/components/Tile";
import { ActivityRow } from "@/components/ActivityRow";
import { GoalProgressStrip } from "@/components/GoalProgressStrip";
import { CategoryGrid } from "@/components/CategoryGrid";
import { Sheet } from "@/components/Sheet";
import { RoutineForm } from "@/components/RoutineForm";
import { GoalForm } from "@/components/GoalForm";
import { isDueToday, isScheduledOn } from "@/lib/frequency";
import { todayKey, prettyDay } from "@/lib/dates";
import { useRegisterControls } from "@/store/useControls";

export function HomeScreen() {
  const nav = useNavigate();
  const { user, data, addRoutine, addGoal } = useStore();
  const [addRoutineOpen, setAddRoutineOpen] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);

  const key = todayKey();
  const scheduled = useMemo(
    () => data.routines.filter((r) => !r.archived && isScheduledOn(r, key)),
    [data.routines, key],
  );
  const due = useMemo(
    () => data.routines.filter((r) => isDueToday(r, key, data)),
    [data, key],
  );
  const doneCount = scheduled.filter(
    (r) => data.logs[key]?.entries[r.id]?.completed,
  ).length;
  const ratio = scheduled.length ? doneCount / scheduled.length : 0;
  const priorityCount = due.filter(
    (r) => data.logs[key]?.entries[r.id]?.rating === "no",
  ).length;

  const activeGoals = data.goals.filter((g) => !g.archived);
  const featured =
    due.find((r) => data.logs[key]?.entries[r.id]?.rating === "no") ??
    due[0] ??
    scheduled[0];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "Friend").split(" ")[0];
  const allClear = scheduled.length > 0 && due.length === 0;

  useRegisterControls(
    {
      primary: () => nav("/checkin"),
      secondary: () => setAddRoutineOpen(true),
    },
    [nav],
  );

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-2">
        <div className="mb-3 mt-2 lg:hidden">
          <p className="text-sm font-700 text-ink-faint">{prettyDay(key)}</p>
          <h1 className="hero-greeting font-display text-3xl font-800 leading-tight text-ink drop-shadow-light">
            {greeting}, {firstName}
          </h1>
        </div>

        <div className="home-dashboard">
          {/* Left column — hero + goal strips (IISU home left panel) */}
          <div className="home-panel space-y-3">
            {/* Jump back in */}
            <button
              onClick={() => nav("/checkin")}
              className="relative w-full overflow-hidden rounded-tile text-left shadow-panel active:scale-[0.99] transition-transform"
            >
              <div
                className="relative min-h-[11rem] w-full sm:min-h-[9.5rem]"
                style={{
                  background: featured
                    ? `linear-gradient(135deg, ${featured.color}cc 0%, ${featured.color}88 40%, #8a7cf0 100%)`
                    : allClear
                      ? "linear-gradient(135deg,#8fe6c6 0%,#4cc79c 100%)"
                      : "linear-gradient(135deg,#7cc4ff 0%,#5a8ef0 55%,#8a7cf0 100%)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-50"
                  style={{
                    background:
                      "radial-gradient(70% 90% at 85% 10%, rgba(255,255,255,0.55), transparent)",
                  }}
                />
                {/* scattered mini tiles like IISU platform splash */}
                {featured && (
                  <>
                    <div className="absolute right-6 top-4 opacity-35">
                      <Tile glyph="✦" color="#ffffff" size={28} framed={false} />
                    </div>
                    <div className="absolute bottom-8 right-16 opacity-25">
                      <Tile glyph="◆" color="#ffffff" size={22} framed={false} />
                    </div>
                  </>
                )}

                <div className="relative flex h-full flex-col justify-between p-4">
                  <div className="flex items-start gap-3">
                    {featured ? (
                      <Tile
                        glyph={featured.icon}
                        color="#ffffff"
                        size={56}
                        state="selected"
                        framed={false}
                      />
                    ) : (
                      <ProgressRing
                        value={ratio}
                        size={56}
                        stroke={6}
                        color="#ffffff"
                        trackColor="rgba(255,255,255,0.35)"
                      >
                        <span className="font-display text-sm font-900 text-white">
                          {Math.round(ratio * 100)}%
                        </span>
                      </ProgressRing>
                    )}
                    <div className="min-w-0 flex-1 text-white">
                      {featured ? (
                        <>
                          <p className="font-display text-xl font-900 drop-shadow sm:text-2xl">
                            {featured.title}
                          </p>
                          <p className="text-sm font-700 opacity-90">
                            {due.length} due · {doneCount}/{scheduled.length} done
                          </p>
                        </>
                      ) : scheduled.length === 0 ? (
                        <>
                          <p className="font-display text-xl font-900 drop-shadow">
                            Let's get started
                          </p>
                          <p className="text-sm font-700 opacity-90">
                            Add your first routine.
                          </p>
                        </>
                      ) : allClear ? (
                        <>
                          <p className="flex items-center gap-1.5 font-display text-xl font-900 drop-shadow">
                            All clear! <PartyPopper size={18} />
                          </p>
                          <p className="text-sm font-700 opacity-90">
                            Today's queue is done.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-display text-xl font-900 drop-shadow">
                            {due.length} to check in
                          </p>
                          <p className="text-sm font-700 opacity-90">
                            {priorityCount > 0 && `${priorityCount} priority · `}
                            {Math.round(ratio * 100)}% complete
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="ml-auto flex items-center gap-2 rounded-pill bg-black/30 px-3.5 py-2 text-sm font-900 text-white backdrop-blur-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-900 text-[#3a8ef0]">
                      A
                    </span>
                    Jump back in!
                  </span>
                </div>
              </div>
            </button>

            {/* Goal progress strips */}
            {activeGoals.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="content-title font-display text-lg font-800">Goals</h2>
                  <button
                    onClick={() => setAddGoalOpen(true)}
                    className="capsule flex h-7 w-7 items-center justify-center text-cat-learning active:scale-90"
                  >
                    <Plus size={16} strokeWidth={2.8} />
                  </button>
                </div>
                {activeGoals.slice(0, 2).map((g) => (
                  <GoalProgressStrip
                    key={g.id}
                    goal={g}
                    data={data}
                    onClick={() => nav(`/goals?id=${g.id}`)}
                  />
                ))}
                {activeGoals.length > 2 && (
                  <button
                    onClick={() => nav("/goals")}
                    className="btn-ghost w-full py-2 text-sm"
                  >
                    See all {activeGoals.length} goals
                  </button>
                )}
              </div>
            )}

            {activeGoals.length === 0 && (
              <div className="card p-4 text-center">
                <p className="text-sm font-700 text-ink-soft">
                  Group routines under goals like “Learn piano”.
                </p>
                <button onClick={() => setAddGoalOpen(true)} className="btn mt-3">
                  <Plus size={18} /> Create a goal
                </button>
              </div>
            )}
          </div>

          {/* Right column — activity list + category grid (IISU centre/right) */}
          <div className="home-panel space-y-4">
            <div className="hidden lg:block">
              <p className="text-sm font-700 text-ink-faint">{prettyDay(key)}</p>
              <h1 className="hero-greeting font-display text-3xl font-800 text-ink">
                {greeting}, {firstName}
              </h1>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-800 text-ink">
                  Due today
                </h2>
                <button
                  onClick={() => setAddRoutineOpen(true)}
                  className="capsule flex h-7 w-7 items-center justify-center text-cat-project active:scale-90"
                >
                  <Plus size={16} strokeWidth={2.8} />
                </button>
              </div>

              {scheduled.length === 0 ? (
                <div className="card p-4 text-center">
                  <p className="text-sm font-700 text-ink-soft">
                    Add routines for exercise, practice, chores, skincare…
                  </p>
                  <button onClick={() => setAddRoutineOpen(true)} className="btn mt-3">
                    <Plus size={18} /> Add a routine
                  </button>
                </div>
              ) : due.length === 0 ? (
                <div className="card p-5 text-center">
                  <p className="font-800 text-ink">Nothing left for today</p>
                  <p className="text-sm font-700 text-ink-soft">
                    Cleared until the next scheduled day.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {due.slice(0, 5).map((r) => (
                    <ActivityRow
                      key={r.id}
                      routine={r}
                      data={data}
                      showRating
                      compact
                    />
                  ))}
                  {due.length > 5 && (
                    <button
                      onClick={() => nav("/checkin")}
                      className="btn-ghost w-full py-2 text-sm"
                    >
                      See all {due.length} in check-in
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="content-title mb-2 font-display text-lg font-800">
                Categories
              </h2>
              <CategoryGrid />
            </div>
          </div>
        </div>
      </div>

      <Sheet
        open={addRoutineOpen}
        onClose={() => setAddRoutineOpen(false)}
        title="New routine"
      >
        <RoutineForm
          goals={activeGoals}
          onSave={(d) => {
            addRoutine(d);
            setAddRoutineOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={addGoalOpen} onClose={() => setAddGoalOpen(false)} title="New goal">
        <GoalForm
          onSave={(d) => {
            addGoal(d);
            setAddGoalOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
