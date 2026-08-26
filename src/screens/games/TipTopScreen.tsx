import { GameShell } from "@/games/GameShell";
import { TipTopGame } from "@/games/TipTopGame";

export function TipTopScreen() {
  return (
    <GameShell gameId="tiptop">
      {({ width, height, onGameOver, paused, seed, ghostTrace }) => (
        <TipTopGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
          seed={seed}
          ghostTrace={ghostTrace}
        />
      )}
    </GameShell>
  );
}
