import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Target, CalendarClock } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { Tile } from "@/components/Tile";
import { ProgressRing } from "@/components/ProgressRing";
import { Sheet } from "@/components/Sheet";
import { GoalForm } from "@/components/GoalForm";
import { RoutineForm } from "@/components/RoutineForm";
import { RoutineRow } from "@/components/RoutineRow";
import { computeGoalProgress, routinesForGoal } from "@/lib/stats";
import { prettyDay } from "@/lib/dates";
import type { Goal, Routine } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";

export function GoalsScreen() {
  const nav = useNavigate();
  const { data, addGoal, updateGoal, deleteGoal, addRoutine, updateRoutine, deleteRoutine } =
    useStore();
  const [params, setParams] = useSearchParams();
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [addRoutineGoal, setAddRoutineGoal] = useState<string | null>(null);
  const [editRoutine, setEditRoutine] = useState<Routine | null>(null);

  const goals = data.goals.filter((g) => !g.archived);
  const selectedId = params.get("id");
  const selected = goals.find((g) => g.id === selectedId) ?? null;

  // Clear an invalid ?id once.
  useEffect(() => {
    if (selectedId && !selected) setParams({}, { replace: true });
  }, [selectedId, selected, setParams]);

  const openGoal = (id: string) => setParams({ id });
  const closeGoal = () => setParams({});

  useRegisterControls(
    {
      back: () => (selected ? closeGoal() : nav("/")),
      primary: () => {
        if (selected) return;
        if (goals[0]) openGoal(goals[0].id);
        else setAddGoalOpen(true);
      },
    },
    [nav, selected, goals, closeGoal, openGoal],
  );

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-4">
        <PageHeader
          title="Goals"
          subtitle="Big things you're working toward."
          action={
            <button
              onClick={() => setAddGoalOpen(true)}
              className="capsule flex h-10 w-10 shrink-0 items-center justify-center text-cat-learning active:scale-90"
            >
              <Plus size={20} strokeWidth={2.8} />
            </button>
          }
        />

        {goals.length === 0 ? (
          <div className="card mt-6 p-6 text-center">
            <div className="mx-auto mb-3 w-fit">
              <Tile glyph="🎯" color="#a06bff" size={72} state="selected" />
            </div>
            <p className="font-display text-xl font-800 text-ink">
              No goals yet
            </p>
            <p className="mt-1 text-sm font-600 text-ink-soft">
              Create a goal like “Learn piano”, “Make a PCB” or “Build a
              website”, then attach routines to it.
            </p>
            <button onClick={() => setAddGoalOpen(true)} className="btn mt-4">
              <Plus size={18} /> New goal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {goals.map((g) => {
              const p = computeGoalProgress(data, g);
              return (
                <button
                  key={g.id}
                  onClick={() => openGoal(g.id)}
                  className="card p-3 text-left active:scale-95 transition-transform"
                >
                  <div className="flex items-start justify-between">
                    <Tile glyph={g.icon} color={g.color} size={48} />
                    <ProgressRing value={p.rate} size={44} stroke={6} color={g.color}>
                      <span className="text-xs font-900 text-ink">
                        {Math.round(p.rate * 100)}
                      </span>
                    </ProgressRing>
                  </div>
                  <p className="content-title mt-2 truncate font-800">{g.title}</p>
                  <p className="text-xs font-700 text-ink-faint">
                    {p.routineCount} routine{p.routineCount === 1 ? "" : "s"}
                    {p.dueToday > 0 && ` · ${p.doneToday}/${p.dueToday} today`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Goal detail */}
      <Sheet open={!!selected} onClose={closeGoal} title={selected?.title}>
        {selected && (
          <GoalDetail
            goal={selected}
            routines={routinesForGoal(data, selected.id)}
            data={data}
            onEdit={() => setEditGoal(selected)}
            onAddRoutine={() => setAddRoutineGoal(selected.id)}
            onOpenRoutine={(r) => setEditRoutine(r)}
          />
        )}
      </Sheet>

      {/* Add goal */}
      <Sheet open={addGoalOpen} onClose={() => setAddGoalOpen(false)} title="New goal">
        <GoalForm
          onSave={(d) => {
            const g = addGoal(d);
            setAddGoalOpen(false);
            openGoal(g.id);
          }}
        />
      </Sheet>

      {/* Edit goal */}
      <Sheet open={!!editGoal} onClose={() => setEditGoal(null)} title="Edit goal">
        {editGoal && (
          <GoalForm
            initial={editGoal}
            onSave={(d) => {
              updateGoal(editGoal.id, d);
              setEditGoal(null);
            }}
            onDelete={() => {
              deleteGoal(editGoal.id);
              setEditGoal(null);
              closeGoal();
            }}
          />
        )}
      </Sheet>

      {/* Add routine to goal */}
      <Sheet
        open={!!addRoutineGoal}
        onClose={() => setAddRoutineGoal(null)}
        title="Add routine to goal"
      >
        {addRoutineGoal && (
          <RoutineForm
            goals={goals}
            defaultGoalId={addRoutineGoal}
            onSave={(d) => {
              addRoutine(d);
              setAddRoutineGoal(null);
            }}
          />
        )}
      </Sheet>

      {/* Edit routine */}
      <Sheet
        open={!!editRoutine}
        onClose={() => setEditRoutine(null)}
        title="Edit routine"
      >
        {editRoutine && (
          <RoutineForm
            initial={editRoutine}
            goals={goals}
            onSave={(d) => {
              updateRoutine(editRoutine.id, d);
              setEditRoutine(null);
            }}
            onDelete={() => {
              deleteRoutine(editRoutine.id);
              setEditRoutine(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function GoalDetail({
  goal,
  routines,
  data,
  onEdit,
  onAddRoutine,
  onOpenRoutine,
}: {
  goal: Goal;
  routines: Routine[];
  data: ReturnType<typeof useStore.getState>["data"];
  onEdit: () => void;
  onAddRoutine: () => void;
  onOpenRoutine: (r: Routine) => void;
}) {
  const p = computeGoalProgress(data, goal);
  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-4 p-4">
        <ProgressRing value={p.rate} size={72} stroke={8} color={goal.color}>
          <span className="font-display text-lg font-800 text-ink">
            {Math.round(p.rate * 100)}%
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          {goal.description && (
            <p className="text-sm font-600 text-ink-soft">{goal.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-700 text-ink-faint">
            <span className="flex items-center gap-1">
              <Target size={13} /> {p.routineCount} routines
            </span>
            {p.dueToday > 0 && (
              <span>
                {p.doneToday}/{p.dueToday} done today
              </span>
            )}
            {goal.targetDate && (
              <span className="flex items-center gap-1">
                <CalendarClock size={13} /> {prettyDay(goal.targetDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onAddRoutine} className="btn flex-1">
          <Plus size={18} /> Add routine
        </button>
        <button onClick={onEdit} className="btn-ghost">
          Edit goal
        </button>
      </div>

      <div>
        <p className="mb-2 text-sm font-800 text-ink-soft">Contributing routines</p>
        {routines.length === 0 ? (
          <div className="card p-4 text-center text-sm font-600 text-ink-soft">
            No routines yet. Add one to start making progress.
          </div>
        ) : (
          <div className="space-y-2.5">
            {routines.map((r) => (
              <RoutineRow
                key={r.id}
                routine={r}
                data={data}
                showRating={false}
                onOpen={() => onOpenRoutine(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
