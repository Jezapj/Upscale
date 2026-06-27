import type { CategoryKey } from "@/lib/types";
import { getCategory } from "@/lib/categories";
import { CATEGORY_ICONS } from "@/lib/icons";
import { Tile } from "./Tile";

interface Props {
  category: CategoryKey;
  size?: number;
  state?: "default" | "priority" | "done" | "selected";
  framed?: boolean;
  onClick?: () => void;
}

/** Category tile with the mapped line-art icon. */
export function CategoryTile({
  category,
  size = 56,
  state = "default",
  framed = true,
  onClick,
}: Props) {
  const meta = getCategory(category);
  return (
    <Tile
      Icon={CATEGORY_ICONS[category]}
      glyph={meta.icon}
      color={meta.color}
      size={size}
      state={state}
      framed={framed}
      onClick={onClick}
    />
  );
}
