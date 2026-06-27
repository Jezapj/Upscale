import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Goal } from "@/lib/types";
import { Tile } from "./Tile";
import { ColorPicker, EmojiPicker, Field, inputClass } from "./Picker";

interface Props {
  initial?: Goal;
  onSave: (data: Omit<Goal, "id" | "createdAt">) => void;
  onDelete?: () => void;
}

const GOAL_EMOJI = [
  "🎯","🏆","🎹","🎸","🎨","💻","🔌","🧠","📚","🌱","🚀","💪",
  "🏃","✍️","🗣️","🧗","🎓","💡","🛠️","⭐",
];

export function GoalForm({ initial, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "🎯");
  const [color, setColor] = useState(initial?.color ?? "#a06bff");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      icon,
      color,
      targetDate: targetDate || undefined,
      archived: initial?.archived,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tile glyph={icon} color={color} size={60} />
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Goal (e.g. Learn piano)"
          className={inputClass}
        />
      </div>

      <Field label="Why this matters (optional)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description"
          className={inputClass}
        />
      </Field>

      <Field label="Target date (optional)">
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Icon">
        <EmojiPicker value={icon} onChange={setIcon} options={GOAL_EMOJI} />
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
          {initial ? "Save changes" : "Create goal"}
        </button>
      </div>
    </div>
  );
}
