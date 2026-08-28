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

const MAX_HINTS = 4;

function HintButton({ hint }: { hint: Hint }) {
  const clickable = !!hint.onClick;

  const inner = (
    <>
      <span className="glyph shrink-0">{hint.glyph}</span>
      <span className="min-w-0 truncate">{hint.label}</span>
    </>
  );

  if (!clickable) {
    return (
      <span className="flex max-w-full items-center justify-center gap-1 text-[11px] font-800 text-ink-soft sm:gap-1.5 sm:text-xs">
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={hint.onClick}
      className="flex max-w-full items-center justify-center gap-1 rounded-pill px-1 py-1 text-[11px] font-800 text-ink-soft transition-all hover:bg-white/70 active:scale-95 hint-btn sm:gap-1.5 sm:px-2 sm:text-xs"
    >
      {inner}
    </button>
  );
}

/** Console-style control hints - clickable when an action is wired. */
export function HintBar({ left = [], right = [], insetSafe = true }: Props) {
  const hints = [...left, ...right].slice(0, MAX_HINTS);

  return (
    <div
      data-tour="hints"
      className={`flex w-full items-center px-2 pt-1 no-select sm:px-4 ${
        insetSafe ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-0.5"
      }`}
    >
      {hints.map((h, i) => (
        <div key={`${h.glyph}-${h.label}-${i}`} className="flex min-w-0 flex-1 justify-center">
          <HintButton hint={h} />
        </div>
      ))}
    </div>
  );
}
