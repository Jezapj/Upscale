/**
 * Whole-app themes ("skins") bought in the Shop. Each one sits on top of a
 * light or dark base so existing `[data-theme]` rules keep text readable, then
 * restyles surfaces via `[data-skin="..."]` rules in index.css.
 */

export type AppThemeId =
  | "speed"
  | "battle"
  | "aria-midnight"
  | "aria-tv"
  | "aria-rebel";

export interface AppThemeMeta {
  id: AppThemeId;
  name: string;
  cost: number;
  /** Light/dark base the skin is drawn over (also picks the game palette). */
  base: "light" | "dark";
  /** Browser chrome colour (`<meta name="theme-color">`). */
  themeColor: string;
  blurb: string;
}

export const APP_THEMES: AppThemeMeta[] = [
  {
    id: "speed",
    name: "Speed",
    cost: 60,
    base: "light",
    themeColor: "#1257e6",
    blurb: "Sky-blue speed lines, gold rings and slanted italic type.",
  },
  {
    id: "battle",
    name: "Battle",
    cost: 80,
    base: "dark",
    themeColor: "#15151b",
    blurb: "Charcoal arena with bold cut-corner panels in fighter colours.",
  },
  {
    id: "aria-midnight",
    name: "Midnight Aria",
    cost: 100,
    base: "dark",
    themeColor: "#0a2a9e",
    blurb: "Deep-water blue, falling light and sleek glass panels.",
  },
  {
    id: "aria-tv",
    name: "TV Aria",
    cost: 100,
    base: "light",
    themeColor: "#ffd800",
    blurb: "Bright yellow, caution tape and chunky TV-screen cards.",
  },
  {
    id: "aria-rebel",
    name: "Rebel Aria",
    cost: 100,
    base: "dark",
    themeColor: "#c8001a",
    blurb: "Red stars, torn paper and hard-edged black and white.",
  },
];

/** The single "aria" theme sold before it was split into three. */
const LEGACY_ARIA = "aria";
const ARIA_SPLIT: AppThemeId[] = ["aria-midnight", "aria-tv", "aria-rebel"];

export function getAppTheme(id: string | null | undefined): AppThemeMeta | undefined {
  return id ? APP_THEMES.find((t) => t.id === id) : undefined;
}

export function isAppThemeId(id: string | null | undefined): id is AppThemeId {
  return !!getAppTheme(id);
}

/** Map an old stored skin id to its current one (old Aria leaned red). */
export function migrateSkinId(id: string | null | undefined): string | null | undefined {
  return id === LEGACY_ARIA ? "aria-rebel" : id;
}

/** Whether an unlock list owns a theme; buying the old Aria owns all three. */
export function ownsAppTheme(owned: readonly string[] | undefined, id: AppThemeId): boolean {
  if (!owned) return false;
  return owned.includes(id) || (ARIA_SPLIT.includes(id) && owned.includes(LEGACY_ARIA));
}
