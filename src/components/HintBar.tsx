export type ControlKey = "menu" | "back" | "primary" | "secondary" | "tertiary";

export interface Hint {
  glyph: string;
  label: string;
  /** Maps to a registered control action. */
  action?: ControlKey;
  onClick?: () => void;
}

interface Props {
  left?: Hint[];
  right?: Hint[];
  /** When false, skip bottom safe-area padding (use when the dock sits below). */
  insetSafe?: boolean;
}

function HintButton({ hint }: { hint: Hint }) {
  const clickable = !!hint.onClick;

  const inner = (
    <>
      <span className="glyph">{hint.glyph}</span>
      {hint.label}
    </>
  );

  if (!clickable) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-800 text-ink-soft">
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={hint.onClick}
      className="flex items-center gap-1.5 rounded-pill px-2 py-1 text-xs font-800 text-ink-soft transition-all hover:bg-white/70 active:scale-95 hint-btn"
    >
      {inner}
    </button>
  );
}

/** Console-style control hints — clickable when an action is wired. */
export function HintBar({ left = [], right = [], insetSafe = true }: Props) {
  return (
    <div
      className={`flex items-center justify-between px-5 pt-1 no-select ${
        insetSafe ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-0.5"
      }`}
    >
      <div className="flex items-center gap-2">
        {left.map((h, i) => (
          <HintButton key={i} hint={h} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {right.map((h, i) => (
          <HintButton key={i} hint={h} />
        ))}
      </div>
    </div>
  );
}
