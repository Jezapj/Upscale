/** Arcade games hub - TipTop, Octane, Dissiada. */

export type GameId = "tiptop" | "octane" | "dissiada";

/** Daily cap when subscriptions launch; unlimited while true. */
export const UNLIMITED_PLAYS = true;

export const DAILY_FREE_PLAYS = 3;

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
    tagline: "Flap the ball into the hole",
    color: "#5cd0a8",
    controls: "Tap or space to flap into each cup",
  },
  {
    id: "octane",
    name: "Octane",
    tagline: "Quarter-mile drag: rev and shift",
    color: "#ff7a59",
    controls: "Hold to gas · Tap SHIFT to change gears",
  },
  {
    id: "dissiada",
    name: "Dissiada",
    tagline: "Hit the tiles on the beat line",
    color: "#a06bff",
    controls: "Tap lanes when tiles cross the purple line",
  },
];

export const GAME_BY_ID = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

export function gamePath(id: GameId): string {
  return `/games/${id}`;
}
