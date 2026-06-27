interface Option<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Wide white capsule with an inset "pressed" active segment — the IISU
 *  Apps / Games / Emulators tab bar. */
export function SegBar<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="capsule flex items-center gap-1 p-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 rounded-pill py-2 text-sm font-800 transition-all duration-150 active:scale-95 ${
              active ? "text-ink shadow-seg-inset" : "text-ink-faint"
            }`}
            style={
              active
                ? { background: "linear-gradient(180deg,#e7e9ee,#f3f4f6)" }
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
