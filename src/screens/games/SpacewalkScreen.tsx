import { GameShell } from "@/games/GameShell";
import { SpacewalkGame } from "@/games/SpacewalkGame";

export function SpacewalkScreen() {
  return (
    <GameShell gameId="spacewalk">
      {({ width, height, onGameOver, paused, seed, playMode }) => (
        <SpacewalkGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
          seed={seed}
          playMode={playMode}
        />
      )}
    </GameShell>
  );
}
