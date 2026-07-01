import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { CategoryKey, Frequency, Routine } from "@/lib/types";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { DOW_LABELS } from "@/lib/dates";
import { Tile } from "./Tile";
import { CategoryTile } from "./CategoryTile";
import { ColorPicker, EmojiPicker, Field, inputClass } from "./Picker";

interface Props {
  initial?: Routine;
  goals: { id: string; title: string; icon: string }[];
  defaultGoalId?: string | null;
  onSave: (data: Omit<Routine, "id" | "createdAt">) => void;
  onDelete?: () => void;
}

export function RoutineForm({
  initial,
  goals,
  defaultGoalId,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [category, setCategory] = useState<CategoryKey>(
    initial?.category ?? "exercise",
  );
  const [icon, setIcon] = useState(
    initial?.icon ?? getCategory("exercise").icon,
  );
  const [color, setColor] = useState(
    initial?.color ?? getCategory("exercise").color,
  );
  const [freqType, setFreqType] = useState<Frequency["type"]>(
    initial?.frequency.type ?? "daily",
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial?.frequency.daysOfWeek ?? [1, 3, 5],
  );
  const [intervalDays, setIntervalDays] = useState(
    initial?.frequency.intervalDays ?? 2,
  );
  const [hasEnd, setHasEnd] = useState(initial?.hasEnd ?? false);
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [goalId, setGoalId] = useState<string | null>(
    initial?.goalId ?? defaultGoalId ?? null,
  );
  const [reminderOn, setReminderOn] = useState(!!initial?.reminderTime);
  const [reminderTime, setReminderTime] = useState(
    initial?.reminderTime ?? "09:00",
  );

  const pickCategory = (k: CategoryKey) => {
    setCategory(k);
    // Adopt the category's defaults unless the user already customized.
    const meta = getCategory(k);
    if (!initial) {
      setIcon(meta.icon);
      setColor(meta.color);
    }
  };

  const toggleDay = (d: number) =>
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  const submit = () => {
    if (!title.trim()) return;
    const frequency: Frequency =
      freqType === "daily"
        ? { type: "daily" }
        : freqType === "weekly"
          ? { type: "weekly", daysOfWeek: daysOfWeek.length ? daysOfWeek : [1] }
          : { type: "interval", intervalDays: Math.max(1, intervalDays) };
    onSave({
      title: title.trim(),
      note: note.trim() || undefined,
      category,
      icon,
      color,
      frequency,
      hasEnd,
      endDate: hasEnd ? endDate || undefined : undefined,
      goalId,
      reminderTime: reminderOn ? reminderTime : undefined,
      archived: initial?.archived,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tile glyph={icon} color={color} size={56} />
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Routine name (e.g. Go for a run)"
          className={inputClass}
        />
      </div>

      <Field label="Category">
        <div className="grid grid-cols-4 gap-2">
          {CATEGORY_LIST.map((c) => {
            const active = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => pickCategory(c.key)}
                className={`flex flex-col items-center gap-1 rounded-2xl py-2 transition-all active:scale-95 ${
                  active ? "bg-white shadow-soft" : "bg-white/55"
                }`}
              >
                <CategoryTile
                  category={c.key}
                  size={36}
                  state={active ? "selected" : "default"}
                />
                <span
                  className={`form-category-label text-[10px] font-800 text-ink-soft ${
                    active ? "form-category-label--active" : ""
                  }`}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Frequency">
        <div className="mb-2 flex gap-2">
          {(["daily", "weekly", "interval"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFreqType(t)}
              className={`flex-1 rounded-pill py-2 text-sm font-800 transition-all active:scale-95 ${
                freqType === t
                  ? "bg-mint text-white shadow-soft"
                  : "form-freq-inactive bg-white/60 text-ink-soft"
              }`}
            >
              {t === "daily" ? "Daily" : t === "weekly" ? "Weekly" : "Interval"}
            </button>
          ))}
        </div>
        {freqType === "weekly" && (
          <div className="flex justify-between gap-1">
            {DOW_LABELS.map((lbl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-10 w-10 rounded-full text-sm font-800 transition-all active:scale-90 ${
                  daysOfWeek.includes(i)
                    ? "bg-mint text-white shadow-soft"
                    : "form-freq-inactive bg-white/60 text-ink-faint"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
        {freqType === "interval" && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-700 text-ink-soft">Every</span>
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
              className={`${inputClass} w-20 text-center`}
            />
            <span className="text-sm font-700 text-ink-soft">days</span>
          </div>
        )}
      </Field>

      <Field
        label="Reminder"
        hint="Optional. Get a notification on this device when the routine is due today."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setReminderOn((v) => !v)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
              reminderOn ? "bg-cat-chores" : "bg-ink-faint/30"
            }`}
          >
            <span
              className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-soft transition-all"
              style={{ left: reminderOn ? 28 : 4 }}
            />
          </button>
          {reminderOn ? (
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className={`${inputClass} flex-1`}
            />
          ) : (
            <span className="text-sm font-700 text-ink-soft">No reminder</span>
          )}
        </div>
      </Field>

      <Field
        label="Does it end?"
        hint="Leave off for ongoing habits. Turn on for time-boxed routines (e.g. a 30-day challenge)."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setHasEnd((v) => !v)}
            className={`relative h-8 w-14 rounded-full transition-colors ${
              hasEnd ? "bg-cat-chores" : "bg-ink-faint/30"
            }`}
          >
            <span
              className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-soft transition-all"
              style={{ left: hasEnd ? 28 : 4 }}
            />
          </button>
          {hasEnd && (
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${inputClass} flex-1`}
            />
          )}
          {!hasEnd && (
            <span className="text-sm font-700 text-ink-soft">Ongoing forever</span>
          )}
        </div>
      </Field>

      {goals.length > 0 && (
        <Field label="Contributes to a goal">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGoalId(null)}
              className={`rounded-pill px-3 py-2 text-sm font-700 transition-all active:scale-95 ${
                goalId === null
                  ? "bg-ink text-white shadow-soft"
                  : "bg-white/60 text-ink-soft"
              }`}
            >
              None
            </button>
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoalId(g.id)}
                className={`flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-700 transition-all active:scale-95 ${
                  goalId === g.id
                    ? "bg-ink text-white shadow-soft"
                    : "bg-white/60 text-ink-soft"
                }`}
              >
                <span>{g.icon}</span>
                {g.title}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Icon">
        <EmojiPicker value={icon} onChange={setIcon} />
      </Field>

      <Field label="Accent colour">
        <ColorPicker value={color} onChange={setColor} />
      </Field>

      <Field label="Note (optional)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A little reminder to yourself"
          className={inputClass}
        />
      </Field>

      <div className="flex gap-2 pt-1">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-12 w-12 items-center justify-center rounded-pill bg-white/80 text-cat-exercise shadow-soft active:scale-95"
          >
            <Trash2 size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          className="btn flex-1 disabled:opacity-50"
        >
          {initial ? "Save changes" : "Add routine"}
        </button>
      </div>
    </div>
  );
}
