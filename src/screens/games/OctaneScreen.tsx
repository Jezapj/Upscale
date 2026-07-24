import { useState } from "react";
import { GameShell } from "@/games/GameShell";
import { OctaneGame } from "@/games/OctaneGame";
import type { OctaneConfig } from "@/games/octaneConfig";
import {
  DAILY_OCTANE_DISTANCE_M,
  DAILY_OCTANE_RACE_LABEL,
} from "@/lib/dailyChallenge";
import { OctaneLobby } from "./OctaneLobby";

const DAILY_CONFIG: OctaneConfig = {
  mode: "drag",
  raceDistanceM: DAILY_OCTANE_DISTANCE_M,
  raceLabel: DAILY_OCTANE_RACE_LABEL,
};

export function OctaneScreen() {
  const [config, setConfig] = useState<OctaneConfig | null>(null);

  return (
    <GameShell
      gameId="octane"
      onSessionReset={() => setConfig(null)}
      renderPracticeLobby={(start) => (
        <OctaneLobby
          onBegin={(cfg) => {
            setConfig(cfg);
            start();
          }}
        />
      )}
    >
      {({ width, height, onGameOver, paused, playMode }) => {
        const active = playMode === "daily" ? DAILY_CONFIG : config;
        if (!active) return null;
        return (
          <OctaneGame
            width={width}
            height={height}
            config={active}
            onGameOver={onGameOver}
            paused={paused}
          />
        );
      }}
    </GameShell>
  );
}
