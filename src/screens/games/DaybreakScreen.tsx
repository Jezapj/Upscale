import { GameShell } from "@/games/GameShell";
import { DaybreakGame } from "@/games/DaybreakGame";

export function DaybreakScreen() {
  return (
    <GameShell gameId="daybreak" escapeExits={false}>
      {({ width, height, onGameOver }) => (
        <DaybreakGame width={width} height={height} onGameOver={onGameOver} />
      )}
    </GameShell>
  );
}
