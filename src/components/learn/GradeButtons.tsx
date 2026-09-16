import type { LearnGrade } from "@/lib/types";

const GRADES: {
  key: LearnGrade;
  label: string;
  color: string;
  sfx: string;
}[] = [
  { key: "again", label: "Again", color: "#ff5a5a", sfx: "alert" },
  { key: "hard", label: "Hard", color: "#ff9f43", sfx: "tapMedium" },
  { key: "good", label: "Good", color: "#2bc4a8", sfx: "tapHigh" },
  { key: "easy", label: "Easy", color: "#4aa3ff", sfx: "success" },
];

interface Props {
  previews: Record<LearnGrade, string>;
  onPick: (g: LearnGrade) => void;
}

export function GradeButtons({ previews, onPick }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {GRADES.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => onPick(g.key)}
          data-sfx={g.sfx}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        >
          <div
            className="flex h-[52px] w-full items-center justify-center rounded-[30%] text-sm font-800 text-white shadow-tile"
            style={{
              background: g.color,
              boxShadow: `0 8px 16px -6px ${g.color}aa`,
            }}
          >
            {g.label}
          </div>
          <span className="text-[11px] font-800 text-ink-faint">
            {previews[g.key]}
          </span>
        </button>
      ))}
    </div>
  );
}
