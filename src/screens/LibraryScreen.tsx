import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { SegBar } from "@/components/SegBar";
import { Tile } from "@/components/Tile";
import { CategoryTile } from "@/components/CategoryTile";
import { Sheet } from "@/components/Sheet";
import { RoutineForm } from "@/components/RoutineForm";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { describeFrequency } from "@/lib/frequency";
import { computeRoutineStats } from "@/lib/stats";
import type { CategoryKey, Routine } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";

type ViewMode = "grid" | "list";

export function LibraryScreen() {
  const nav = useNavigate();
  const { data, addRoutine, updateRoutine, deleteRoutine } = useStore();
  const [params, setParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Routine | null>(null);
  const [view, setView] = useState<ViewMode>("grid");

  const catParam = params.get("cat") as CategoryKey | null;
  const [filter, setFilter] = useState<CategoryKey | "all">(
    catParam && CATEGORY_LIST.some((c) => c.key === catParam) ? catParam : "all",
  );

  useEffect(() => {
    if (catParam && CATEGORY_LIST.some((c) => c.key === catParam)) {
      setFilter(catParam);
    }
  }, [catParam]);

  const goals = data.goals.filter((g) => !g.archived);
  const routines = useMemo(
    () =>
      data.routines
        .filter((r) => !r.archived)
        .filter((r) => filter === "all" || r.category === filter),
    [data.routines, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<CategoryKey, Routine[]>();
    for (const r of routines) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [routines]);

  const pickFilter = (f: CategoryKey | "all") => {
    setFilter(f);
    if (f === "all") setParams({});
    else setParams({ cat: f });
  };

  useRegisterControls(
    {
      back: () => {
        if (edit) setEdit(null);
        else if (addOpen) setAddOpen(false);
        else nav("/");
      },
      primary: () => {
        if (edit) return;
        if (routines[0]) setEdit(routines[0]);
      },
      secondary: () => setAddOpen(true),
    },
    [nav, routines, edit, addOpen],
  );

  return (
    <>
      <StatusBar />
      <div className="px-4">
        <PageHeader title="Library" subtitle="Every routine you've created." />
      </div>

      <div className="px-4 pb-2">
        <SegBar
          value={view}
          onChange={setView}
          options={[
            { key: "grid", label: "Apps" },
            { key: "list", label: "List" },
          ]}
        />
      </div>

      {/* Category filter - IISU segmented style row */}
      <div className="hscroll flex items-center gap-2 px-4 pb-2 pt-1">
        <FilterPill
          active={filter === "all"}
          onClick={() => pickFilter("all")}
          label="All"
          color="#3a8ef0"
        />
        {CATEGORY_LIST.map((c) => (
          <FilterPill
            key={c.key}
            active={filter === c.key}
            onClick={() => pickFilter(c.key)}
            label={c.label}
            category={c.key}
            color={c.color}
          />
        ))}
      </div>

      <div className="scroll-area px-4 pb-2">
        {routines.length === 0 ? (
          <div className="card mt-4 p-6 text-center">
            <div className="mx-auto mb-3 w-fit">
              <CategoryTile category="project" size={72} state="selected" />
            </div>
            <p className="font-display text-xl font-800 text-ink">
              {filter === "all" ? "No routines yet" : "Nothing here"}
            </p>
            <p className="mt-1 text-sm font-700 text-ink-soft">
              Add routines for the things you do daily.
            </p>
            <button onClick={() => setAddOpen(true)} className="btn mt-4">
              <Plus size={18} /> New routine
            </button>
          </div>
        ) : view === "grid" ? (
          /* IISU Apps grid - squircle tiles on a white panel */
          <div className="panel p-4">
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-5">
              {routines.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setEdit(r)}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                >
                  <Tile glyph={r.icon} color={r.color} size={58} state="selected" />
                  <span className="content-title line-clamp-2 max-w-full text-center text-[10px] font-800 leading-tight">
                    {r.title}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setAddOpen(true)}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div
                  className="flex items-center justify-center shadow-tile"
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: "30%",
                    background: "linear-gradient(180deg,#f5f6f8,#dde0e6)",
                  }}
                >
                  <Plus size={24} className="text-ink-faint" strokeWidth={2.4} />
                </div>
                <span className="text-[10px] font-800 text-ink-faint">Add</span>
              </button>
            </div>
          </div>
        ) : (
          [...grouped.entries()].map(([cat, list]) => {
            const meta = getCategory(cat);
            return (
              <div key={cat} className="mb-5">
                <div className="mb-2 mt-3 flex items-center gap-2">
                  <CategoryTile category={cat} size={28} framed={false} />
                  <h2 className="content-title font-display text-lg font-800">
                    {meta.label}
                  </h2>
                  <span className="text-sm font-800 text-ink-faint">
                    {list.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {list.map((r) => {
                    const stats = computeRoutineStats(data, r);
                    const goal = goals.find((g) => g.id === r.goalId);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setEdit(r)}
                        className="card p-3 text-left active:scale-95 transition-transform"
                      >
                        <div className="flex items-center justify-between">
                          <Tile glyph={r.icon} color={r.color} size={44} />
                          <span className="font-display text-sm font-800 text-ink-soft">
                            {Math.round(stats.rate * 100)}%
                          </span>
                        </div>
                        <p className="content-title mt-2 truncate font-800">
                          {r.title}
                        </p>
                        <p className="truncate text-xs font-700 text-ink-faint">
                          {describeFrequency(r.frequency)}
                        </p>
                        {goal && (
                          <span
                            className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-pill bg-white px-2 py-0.5 text-[10px] font-800 shadow-soft"
                            style={{ color: goal.color }}
                          >
                            {goal.icon} {goal.title}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {routines.length > 0 && view === "list" && (
          <button onClick={() => setAddOpen(true)} className="btn mb-2 w-full">
            <Plus size={18} /> New routine
          </button>
        )}
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New routine">
        <RoutineForm
          goals={goals}
          onSave={(d) => {
            addRoutine(d);
            setAddOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit routine">
        {edit && (
          <RoutineForm
            initial={edit}
            goals={goals}
            onSave={(d) => {
              updateRoutine(edit.id, d);
              setEdit(null);
            }}
            onDelete={() => {
              deleteRoutine(edit.id);
              setEdit(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  category,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  category?: CategoryKey;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-2 text-sm font-800 transition-all active:scale-95"
      style={{
        background: active ? color : "rgba(255,255,255,0.75)",
        color: active ? "#fff" : "#6b7384",
        boxShadow: active
          ? `0 8px 18px -8px ${color}aa`
          : "0 6px 16px -12px rgba(80,110,150,0.4)",
      }}
    >
      {category && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}
