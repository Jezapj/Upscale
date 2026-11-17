/**
 * Whole-app themes ("skins") bought in the Shop. Each one sits on top of a
 * light or dark base so existing `[data-theme]` rules keep text readable, then
 * restyles surfaces via `[data-skin="..."]` rules in index.css.
 */

export type AppThemeId = "speed" | "battle" | "aria";

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
    id: "aria",
    name: "Aria",
    cost: 100,
    base: "dark",
    themeColor: "#0a0a0f",
    blurb: "Midnight blue, TV yellow and rebel red over halftone ink.",
  },
];

export function getAppTheme(id: string | null | undefined): AppThemeMeta | undefined {
  return id ? APP_THEMES.find((t) => t.id === id) : undefined;
}

export function isAppThemeId(id: string | null | undefined): id is AppThemeId {
  return !!getAppTheme(id);
}
