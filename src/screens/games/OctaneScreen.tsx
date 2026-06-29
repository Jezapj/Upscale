import { GameShell } from "@/games/GameShell";
import { OctaneGame } from "@/games/OctaneGame";

export function OctaneScreen() {
  return (
    <GameShell gameId="octane">
      {({ width, height, onGameOver }) => (
        <OctaneGame width={width} height={height} onGameOver={onGameOver} />
      )}
    </GameShell>
  );
}
