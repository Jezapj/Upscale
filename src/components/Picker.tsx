interface EmojiPickerProps {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}

const DEFAULT_EMOJI = [
  "🏃","🏋️","🚴","🧘","🤸","⚽","🎹","🎸","🎻","🥁","🎤","🎨",
  "🛠️","💻","🔧","🔌","📐","🧪","🧹","🧺","🐕","🍽️","🧽","🛏️",
  "🧴","🚿","💧","💊","🦷","😴","📚","✏️","🌱","🧠","🗣️","💡",
  "⭐","🔥","🎯","🏆","❤️","✅",
];

export function EmojiPicker({ value, onChange, options }: EmojiPickerProps) {
  const list = options ?? DEFAULT_EMOJI;
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onChange(e)}
          className={`flex aspect-square items-center justify-center rounded-xl text-xl transition-all active:scale-90 ${
            value === e
              ? "bg-white shadow-tile ring-2 ring-mint"
              : "bg-white/60"
          }`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

const COLORS = [
  "#ff7a59","#ff9f43","#ffb43d","#2bc4a8","#4aa3ff",
  "#6c8cff","#a06bff","#ff77b0","#ff5a5a","#8b97a8",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="h-9 w-9 rounded-full transition-transform active:scale-90"
          style={{
            background: c,
            boxShadow:
              value === c
                ? `0 0 0 3px #fff, 0 0 0 6px ${c}`
                : "0 6px 14px -8px rgba(80,110,150,0.5)",
          }}
        />
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-800 text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "form-input w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 font-600 text-ink shadow-soft outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-mint";
