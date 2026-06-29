import type { CategoryKey } from "./types";

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  icon: string; // emoji
  color: string; // hex
  /** gradient for the glossy icon chip */
  gradient: string;
  examples: string[];
}

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  exercise: {
    key: "exercise",
    label: "Exercise",
    icon: "🏃",
    color: "#ff7a59",
    gradient: "linear-gradient(160deg,#ff9d6c 0%,#ff6a4d 100%)",
    examples: ["Go for a run", "Do a workout", "Stretch", "Cycle"],
  },
  instrument: {
    key: "instrument",
    label: "Instrument",
    icon: "🎹",
    color: "#a06bff",
    gradient: "linear-gradient(160deg,#b98bff 0%,#8a4dff 100%)",
    examples: ["Practice piano", "Practice guitar", "Sight reading"],
  },
  project: {
    key: "project",
    label: "Project",
    icon: "🛠️",
    color: "#4aa3ff",
    gradient: "linear-gradient(160deg,#74c0ff 0%,#3a8ef0 100%)",
    examples: ["Work on PCB", "Build website", "Write code"],
  },
  chores: {
    key: "chores",
    label: "Chores",
    icon: "🧹",
    color: "#2bc4a8",
    gradient: "linear-gradient(160deg,#5fe0c4 0%,#1faf93 100%)",
    examples: ["Walk the dog", "Clean dishes", "Fold clothes", "Tidy room"],
  },
  health: {
    key: "health",
    label: "Health",
    icon: "🧴",
    color: "#ff77b0",
    gradient: "linear-gradient(160deg,#ff9ec7 0%,#ff5e9c 100%)",
    examples: ["Skincare routine", "Shower", "Drink water", "Take vitamins"],
  },
  learning: {
    key: "learning",
    label: "Learning",
    icon: "📚",
    color: "#ffb43d",
    gradient: "linear-gradient(160deg,#ffce6e 0%,#ff9f1c 100%)",
    examples: ["Read", "Study language", "Online course"],
  },
  relax: {
    key: "relax",
    label: "Relax",
    icon: "🌙",
    color: "#7c9cff",
    gradient: "linear-gradient(160deg,#a5b8ff 0%,#5b7cf0 100%)",
    examples: ["Sleep on time", "Read for fun", "Wind down", "Meditate"],
  },
  other: {
    key: "other",
    label: "Other",
    icon: "⭐",
    color: "#8b97a8",
    gradient: "linear-gradient(160deg,#aab4c2 0%,#7a8696 100%)",
    examples: ["Journal", "Meditate", "Call family"],
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export const getCategory = (key: CategoryKey): CategoryMeta =>
  CATEGORIES[key] ?? CATEGORIES.other;

/** Build a glossy gradient from a single accent color (for goals / custom). */
export const gradientFromColor = (hex: string): string => {
  return `linear-gradient(160deg, ${lighten(hex, 0.22)} 0%, ${darken(
    hex,
    0.08,
  )} 100%)`;
};

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => clamp(v).toString(16).padStart(2, "0"))
      .join("")
  );
}
export function lighten(hex: string, amt: number) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
export function darken(hex: string, amt: number) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
