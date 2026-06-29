import { GameShell } from "@/games/GameShell";
import { TipTopGame } from "@/games/TipTopGame";

export function TipTopScreen() {
  return (
    <GameShell gameId="tiptop">
      {({ width, height, onGameOver }) => (
        <TipTopGame width={width} height={height} onGameOver={onGameOver} />
      )}
    </GameShell>
  );
}
