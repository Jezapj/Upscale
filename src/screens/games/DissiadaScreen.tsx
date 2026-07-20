import { GameShell } from "@/games/GameShell";
import { DissiadaGame } from "@/games/DissiadaGame";

export function DissiadaScreen() {
  return (
    <GameShell gameId="dissiada">
      {({ width, height, onGameOver, paused }) => (
        <DissiadaGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
        />
      )}
    </GameShell>
  );
}
