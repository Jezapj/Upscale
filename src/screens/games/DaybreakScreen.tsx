import { GameShell } from "@/games/GameShell";
import { DaybreakGame } from "@/games/DaybreakGame";
import { DAILY_DAYBREAK_ATTEMPTS } from "@/lib/dailyChallenge";

export function DaybreakScreen() {
  return (
    <GameShell gameId="daybreak">
      {({ width, height, onGameOver, paused, playMode, seed }) => (
        <DaybreakGame
          width={width}
          height={height}
          onGameOver={onGameOver}
          paused={paused}
          seed={seed}
          maxAttempts={playMode === "daily" ? DAILY_DAYBREAK_ATTEMPTS : undefined}
        />
      )}
    </GameShell>
  );
}
