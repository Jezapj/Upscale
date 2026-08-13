/** Arcade games hub - TipTop, Octane, Dissiada, Daybreak. */

export type GameId = "tiptop" | "octane" | "dissiada" | "daybreak";

/** Bypass endless play limits (dev only: set VITE_UNLIMITED_PLAYS=true). */
export const UNLIMITED_PLAYS =
  import.meta.env.VITE_UNLIMITED_PLAYS === "true";

/** Free endless plays per calendar day (Pro subscribers get unlimited). */
export const DAILY_FREE_PLAYS = 3;

/** Pro subscription price label shown in the UI. */
export const PRO_PRICE_LABEL = "$10/month";

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
    controls: "Space gas · W/S or ▲▼ change lane · L-Shift / clutch to shift",
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

export const GAME_BY_ID = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

export function gamePath(id: GameId): string {
  return `/games/${id}`;
}
