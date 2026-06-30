import { useState } from "react";
import type { DragDistanceKey, OctaneConfig } from "@/games/octaneConfig";
import { DRAG_DISTANCES } from "@/games/octaneConfig";

interface Props {
  onBegin: (config: OctaneConfig) => void;
}

export function OctaneLobby({ onBegin }: Props) {
  const [pickDistance, setPickDistance] = useState(false);

  if (pickDistance) {
    return (
      <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="game-shell-title font-display text-lg font-800">Drag race distance</p>
        <p className="text-sm font-700 text-ink-soft">Shift at redline to win</p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {(Object.keys(DRAG_DISTANCES) as DragDistanceKey[]).map((key) => {
            const d = DRAG_DISTANCES[key];
            return (
              <button
                key={key}
                type="button"
                className="btn w-full"
                onClick={() =>
                  onBegin({
                    mode: "drag",
                    raceDistanceM: d.meters,
                    raceLabel: d.label,
                  })
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn-ghost mt-1" onClick={() => setPickDistance(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-700 text-ink-soft">Pick a mode</p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <button type="button" className="btn w-full" onClick={() => setPickDistance(true)}>
          Drag race
        </button>
        <button
          type="button"
          className="btn w-full"
          onClick={() =>
            onBegin({
              mode: "freeride",
              raceDistanceM: 0,
              raceLabel: "Free ride",
            })
          }
        >
          Free ride
        </button>
      </div>
    </div>
  );
}
