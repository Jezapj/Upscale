import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Note } from "@/lib/types";
import { ColorPicker, Field, inputClass } from "./Picker";

interface Props {
  initial?: Note;
  onSave: (data: Omit<Note, "id" | "createdAt" | "updatedAt">) => void;
  onDelete?: () => void;
}

/** Local `YYYY-MM-DDTHH:mm` for the datetime input, defaulting to the next hour. */
function defaultReminder(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function NoteForm({ initial, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [color, setColor] = useState(initial?.color ?? "#ffb43d");
  const [reminderOn, setReminderOn] = useState(!!initial?.reminderAt);
  const [reminderAt, setReminderAt] = useState(
    initial?.reminderAt ?? defaultReminder(),
  );

  const canSave = !!(title.trim() || body.trim());

  const submit = () => {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      body: body.trim(),
      color,
      reminderAt: reminderOn ? reminderAt : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title (e.g. Practice ideas)"
        className={inputClass}
      />

      <Field label="Note">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Write it down…"
          className={`${inputClass} resize-none leading-relaxed`}
        />
      </Field>

      <Field
        label="Reminder"
        hint="Optional. Get a notification on this device at the chosen date and time."
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
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              className={`${inputClass} flex-1`}
            />
          ) : (
            <span className="text-sm font-700 text-ink-soft">No reminder</span>
          )}
        </div>
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
          disabled={!canSave}
          className="btn flex-1 disabled:opacity-50"
        >
          {initial ? "Save changes" : "Add note"}
        </button>
      </div>
    </div>
  );
}
