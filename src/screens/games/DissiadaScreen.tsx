import { GameShell } from "@/games/GameShell";
import { DissiadaGame } from "@/games/DissiadaGame";

export function DissiadaScreen() {
  return (
    <GameShell gameId="dissiada">
      {({ width, height, onGameOver }) => (
        <DissiadaGame width={width} height={height} onGameOver={onGameOver} />
      )}
    </GameShell>
  );
}
