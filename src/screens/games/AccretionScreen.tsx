import { GameShell } from "@/games/GameShell";
import { AccretionGame } from "@/games/AccretionGame";

export function AccretionScreen() {
  return (
    <GameShell gameId="accretion">
      {({ width, height, onGameOver, paused, seed, playMode }) => (
        <AccretionGame
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
