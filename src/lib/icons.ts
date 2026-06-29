import {
  BookOpen,
  Dumbbell,
  HeartPulse,
  Moon,
  Music2,
  Sparkles,
  Star,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CategoryKey } from "./types";

/** Line-art icons for categories - matches the IISU app-logo tile look. */
export const CATEGORY_ICONS: Record<CategoryKey, LucideIcon> = {
  exercise: Dumbbell,
  instrument: Music2,
  project: Wrench,
  chores: Sparkles,
  health: HeartPulse,
  learning: BookOpen,
  relax: Moon,
  other: Star,
};

/** True when the string looks like an emoji (user-picked routine/goal icon). */
export function isEmoji(str: string): boolean {
  return /\p{Extended_Pictographic}/u.test(str);
}
