import { useState } from "react";
import { GameShell } from "@/games/GameShell";
import { OctaneGame } from "@/games/OctaneGame";
import type { OctaneConfig } from "@/games/octaneConfig";
import { OctaneLobby } from "./OctaneLobby";

export function OctaneScreen() {
  const [config, setConfig] = useState<OctaneConfig | null>(null);

  return (
    <GameShell
      gameId="octane"
      onSessionReset={() => setConfig(null)}
      renderLobby={(start) => (
        <OctaneLobby
          onBegin={(cfg) => {
            setConfig(cfg);
            start();
          }}
        />
      )}
    >
      {({ width, height, onGameOver, paused }) =>
        config ? (
          <OctaneGame
            width={width}
            height={height}
            config={config}
            onGameOver={onGameOver}
            paused={paused}
          />
        ) : null
      }
    </GameShell>
  );
}
