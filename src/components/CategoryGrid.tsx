import { useNavigate } from "react-router-dom";
import { CATEGORY_LIST } from "@/lib/categories";
import { CategoryTile } from "./CategoryTile";
import type { CategoryKey } from "@/lib/types";

interface Props {
  onPick?: (key: CategoryKey) => void;
}

/** IISU emulator/platform tile grid - quick-launch categories. */
export function CategoryGrid({ onPick }: Props) {
  const nav = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {CATEGORY_LIST.map((c) => (
        <button
          key={c.key}
          onClick={() => {
            if (onPick) onPick(c.key);
            else nav(`/library?cat=${c.key}`);
          }}
          className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
        >
          <CategoryTile category={c.key} size={64} state="selected" />
          <span className="category-label max-w-full truncate text-center text-[11px] font-800">
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}
