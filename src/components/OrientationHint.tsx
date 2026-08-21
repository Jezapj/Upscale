import { gameOrientationLabel, gamePlayOrientation, type GamePlayOrientation } from "@/lib/gameOrientation";
import type { GameId } from "@/lib/types";

interface Props {
  gameId: GameId;
}

/** Brief phone-rotate cue on the arcade lobby for how to hold the device in-game. */
export function OrientationHint({ gameId }: Props) {
  const mode: GamePlayOrientation = gamePlayOrientation(gameId);
  return (
    <div className="orientation-hint" aria-hidden>
      <div className={`orientation-phone orientation-phone--${mode}`}>
        <span className="orientation-phone-notch" />
      </div>
      <p className="orientation-hint-label">{gameOrientationLabel(gameId)}</p>
    </div>
  );
}
