import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { LearnDeck } from "@/lib/types";
import { DEFAULT_NEW_PER_SESSION, DEFAULT_SESSION_SIZE } from "@/lib/learn/scheduler";
import { Tile } from "../Tile";
import { ColorPicker, EmojiPicker, Field, inputClass } from "../Picker";

interface Props {
  initial?: LearnDeck;
  goals: { id: string; title: string; icon: string }[];
  defaultGoalId?: string | null;
  onSave: (data: Omit<LearnDeck, "id" | "createdAt" | "updatedAt">) => void;
  onDelete?: () => void;
}

export function DeckForm({
  initial,
  goals,
  defaultGoalId,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "🎓");
  const [color, setColor] = useState(initial?.color ?? "#4aa3ff");
  const [newPerSession, setNewPerSession] = useState(
    initial?.newPerSession ?? DEFAULT_NEW_PER_SESSION,
  );
  const [sessionSize, setSessionSize] = useState(
    initial?.sessionSize ?? DEFAULT_SESSION_SIZE,
  );
  const [goalId, setGoalId] = useState<string | null>(
    initial?.goalId ?? defaultGoalId ?? null,
  );

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      icon,
      color,
      newPerSession: Math.max(0, Math.round(newPerSession) || 0),
      sessionSize: Math.max(1, Math.round(sessionSize) || DEFAULT_SESSION_SIZE),
      goalId,
      archived: initial?.archived,
      source: initial?.source ?? "manual",
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
          placeholder="Deck name (e.g. Spanish verbs)"
          className={inputClass}
        />
      </div>

      {goals.length > 0 && (
        <Field label="Tied to a goal">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGoalId(null)}
              className={`rounded-pill px-3 py-2 text-sm font-700 transition-all active:scale-95 ${
                goalId === null
                  ? "form-chip-active bg-ink text-white shadow-soft"
                  : "form-chip-inactive bg-white/60 text-ink-soft"
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
                    ? "form-chip-active bg-ink text-white shadow-soft"
                    : "form-chip-inactive bg-white/60 text-ink-soft"
                }`}
              >
                <span>{g.icon}</span>
                {g.title}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field
        label="New cards per session"
        hint="How many unseen cards to mix in. Sessions never dump the whole backlog on you."
      >
        <input
          type="number"
          min={0}
          max={50}
          value={newPerSession}
          onChange={(e) => setNewPerSession(Number(e.target.value))}
          className={inputClass}
        />
      </Field>

      <Field
        label="Reviews per session"
        hint="Cap on due cards so a 300-card backlog is still a 20-card sitting."
      >
        <input
          type="number"
          min={1}
          max={100}
          value={sessionSize}
          onChange={(e) => setSessionSize(Number(e.target.value))}
          className={inputClass}
        />
      </Field>

      <Field label="Icon">
        <EmojiPicker value={icon} onChange={setIcon} />
      </Field>

      <Field label="Accent colour">
        <ColorPicker value={color} onChange={setColor} />
      </Field>

      <div className="flex gap-2 pt-1">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-12 w-12 items-center justify-center rounded-pill bg-white/80 text-cat-exercise shadow-soft active:scale-95"
            data-sfx="alert"
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
          {initial ? "Save deck" : "Create deck"}
        </button>
      </div>
    </div>
  );
}
