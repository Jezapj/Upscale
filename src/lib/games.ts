/** Arcade games hub - TipTop, Octane, Dissiada, Daybreak, Spacewalk, Accretion. */

export type GameId =
  | "tiptop"
  | "octane"
  | "dissiada"
  | "daybreak"
  | "spacewalk"
  | "accretion";

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
    controls: "Hold GAS, SHIFT UP at redline, SHIFT DOWN to drop a gear, ▲▼ to change lane (Space · W/S · E/Q)",
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
  {
    id: "spacewalk",
    name: "Spacewalk",
    tagline: "Flip falling rockets back into orbit",
    color: "#6a7dff",
    controls: "Trace a line to open a gravity portal (3 max) - falling rockets flip upward, tilt the line to aim them. Fling one back into a launch bay to knock it offline",
  },
  {
    id: "accretion",
    name: "Accretion",
    tagline: "Roll the park clean before time runs out",
    color: "#5cb85c",
    controls: "Swipe: sideways to steer, upward to speed up (or A/D · ▲) - collect junk to grow, don't clip the path edges",
  },
];

/** Emoji tile glyph per game (arcade hub, result screens). */
export const GAME_GLYPH: Record<GameId, string> = {
  tiptop: "⛳",
  octane: "🏎️",
  dissiada: "🎹",
  daybreak: "🌅",
  spacewalk: "🚀",
  accretion: "⚽",
};

export const GAME_BY_ID = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

export function gamePath(id: GameId): string {
  return `/games/${id}`;
}
