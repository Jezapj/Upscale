/** Arcade games hub - TipTop, Octane, Dissiada, Daybreak. */

export type GameId = "tiptop" | "octane" | "dissiada" | "daybreak";

/** Bypass endless play limits (dev only: set VITE_UNLIMITED_PLAYS=true). */
export const UNLIMITED_PLAYS =
  import.meta.env.VITE_UNLIMITED_PLAYS === "true";

/** Free endless plays are retired: habits mint Play Tokens instead. */
export const DAILY_FREE_PLAYS = 0;

/** Pro subscription price label shown in the UI. */
export const PRO_PRICE_LABEL = "$10/month";

/** Cost of one Endless run in Play Tokens (non-Pro). */
export const ENDLESS_TOKEN_COST = 1;

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  color: string;
  controls: string;
}

export const GAMES: GameMeta[] = [
  {
    id: "tiptop",
    name: "TipTop",
    tagline: "Flap into the pits",
    color: "#5cd0a8",
    controls: "A/D or ◀ ▶ to flap left and right",
  },
  {
    id: "octane",
    name: "Octane",
    tagline: "Drag race or free ride - rev to redline",
    color: "#ff7a59",
    controls: "Hold GAS, tap SHIFT at redline, ▲▼ to change lane (Space · W/S · L-Shift on keyboard)",
  },
  {
    id: "dissiada",
    name: "Dissiada",
    tagline: "Hit the tiles on the beat line",
    color: "#a06bff",
    controls: "Tap lanes when tiles cross the purple line",
  },
  {
    id: "daybreak",
    name: "Daybreak",
    tagline: "Jump to the key you're dealt",
    color: "#ff9e64",
    controls: "Tap / Space / Click to jump on the beat for bonus points",
  },
];

/** Emoji tile glyph per game (arcade hub, result screens). */
export const GAME_GLYPH: Record<GameId, string> = {
  tiptop: "⛳",
  octane: "🏎️",
  dissiada: "🎹",
  daybreak: "🌅",
};

export const GAME_BY_ID = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

export function gamePath(id: GameId): string {
  return `/games/${id}`;
}
