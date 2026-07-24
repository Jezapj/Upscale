import { GameShell } from "@/games/GameShell";
import { DissiadaGame } from "@/games/DissiadaGame";

export function DissiadaScreen() {
  return (
    <GameShell gameId="dissiada">
      {({ width, height, onGameOver, paused, seed }) => (
        <DissiadaGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
          seed={seed}
        />
      )}
    </GameShell>
  );
}
