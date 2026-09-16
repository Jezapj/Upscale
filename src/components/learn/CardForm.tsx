import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { LearnCard } from "@/lib/types";
import { Field, inputClass } from "../Picker";

interface Props {
  initial?: LearnCard;
  onSave: (data: { front: string; back: string; suspendedAt?: string | null }) => void;
  onDelete?: () => void;
}

export function CardForm({ initial, onSave, onDelete }: Props) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");

  const submit = () => {
    if (!front.trim()) return;
    onSave({ front: front.trim(), back: back.trim() });
  };

  return (
    <div className="space-y-4">
      <Field label="Front">
        <textarea
          autoFocus
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="Prompt or question"
          rows={4}
          className={`${inputClass} min-h-[96px] resize-y py-3`}
        />
      </Field>
      <Field label="Back">
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Answer"
          rows={4}
          className={`${inputClass} min-h-[96px] resize-y py-3`}
        />
      </Field>
      {initial?.suspendedAt && (
        <button
          type="button"
          onClick={() =>
            onSave({
              front: front.trim() || initial.front,
              back: back.trim(),
              suspendedAt: null,
            })
          }
          className="btn-ghost w-full text-sm"
        >
          Show in study again
        </button>
      )}
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
          disabled={!front.trim()}
          className="btn flex-1 disabled:opacity-50"
        >
          {initial ? "Save card" : "Add card"}
        </button>
      </div>
    </div>
  );
}
