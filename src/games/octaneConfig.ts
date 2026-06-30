export type OctaneMode = "drag" | "freeride";
export type DragDistanceKey = "quarter" | "half" | "mile";

export interface OctaneConfig {
  mode: OctaneMode;
  /** Race length in meters (drag mode only). */
  raceDistanceM: number;
  raceLabel: string;
}

export const DRAG_DISTANCES: Record<DragDistanceKey, { meters: number; label: string }> = {
  quarter: { meters: 402, label: "1/4 mile" },
  half: { meters: 805, label: "1/2 mile" },
  mile: { meters: 1609, label: "1 mile" },
};
