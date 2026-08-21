import type { GameId } from "./types";

export type GamePlayOrientation = "portrait" | "landscape" | "any";

/** Lock used while the game canvas is running. Lobby / boards stay portrait. */
export function gamePlayOrientation(id: GameId): GamePlayOrientation {
  switch (id) {
    case "octane":
    case "daybreak":
      return "landscape";
    case "tiptop":
      return "any";
    default:
      return "portrait";
  }
}

export function gameOrientationLabel(id: GameId): string {
  switch (gamePlayOrientation(id)) {
    case "landscape":
      return "Play in landscape";
    case "any":
      return "Portrait or landscape";
    default:
      return "Play in portrait";
  }
}
