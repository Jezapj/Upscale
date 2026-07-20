import { GameShell } from "@/games/GameShell";
import { DaybreakGame } from "@/games/DaybreakGame";

export function DaybreakScreen() {
  return (
    <GameShell gameId="daybreak">
      {({ width, height, onGameOver, paused }) => (
        <DaybreakGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
        />
      )}
    </GameShell>
  );
}
