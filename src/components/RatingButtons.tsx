import type { Rating } from "@/lib/types";
import { RATINGS } from "@/lib/rating";

interface Props {
  value?: Rating;
  onPick: (r: Rating) => void;
  size?: "sm" | "lg";
}

/** Worst → best rating tiles — glossy squircles like IISU app icons. */
export function RatingButtons({ value, onPick, size = "lg" }: Props) {
  const big = size === "lg";
  const tileSize = big ? 52 : 44;

  return (
    <div className="grid grid-cols-4 gap-2">
      {RATINGS.map((r) => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            onClick={() => onPick(r.key)}
            className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
          >
            <div
              className="flex items-center justify-center shadow-tile transition-all"
              style={{
                width: tileSize,
                height: tileSize,
                borderRadius: "30%",
                background: active
                  ? r.color
                  : "linear-gradient(180deg,#f5f6f8,#dde0e6)",
                boxShadow: active
                  ? `0 8px 16px -6px ${r.color}aa, 0 0 0 2px ${r.color}`
                  : undefined,
                color: active ? "#fff" : r.color,
                fontSize: big ? 18 : 15,
              }}
            >
              {r.emoji}
            </div>
            <span
              className={`font-800 ${big ? "text-[11px]" : "text-[10px]"} ${
                active ? "text-ink" : "text-ink-faint"
              }`}
            >
              {r.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
