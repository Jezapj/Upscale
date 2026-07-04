/** Tunable timing/volume for procedural game sounds. Times are in seconds. */
export interface SoundTiming {
  /** Output level 0–1 */
  volume: number;
  /** Delay before the sound begins */
  startTime: number;
  /** When the main envelope finishes fading */
  endTime: number;
  /** Total scheduled length (≥ endTime) */
  duration: number;
}

/** Dissiada — piano-like lane taps */
export const DISSIADA_SOUND = {
  note: { volume: 0.3, startTime: 0, endTime: 0.16, duration: 0.2 },
  noteMiss: { volume: 0.22, startTime: 0, endTime: 0.09, duration: 0.11 },
} as const satisfies Record<string, SoundTiming>;

/** Per-lane base frequencies (Hz) */
export const DISSIADA_NOTE_HZ = [261.63, 293.66, 349.23, 392.0] as const;

/** TipTop — flap thump and hole-in-one */
export const TIPTOP_SOUND = {
  flap: { volume: 0.88, startTime: 0, endTime: 0.06, duration: 0.09 },
  holeIn: { volume: 0.42, startTime: 0, endTime: 0.52, duration: 0.52 },
} as const satisfies Record<string, SoundTiming>;

/** Octane — engine loop, gear revs, perfect-shift nitro */
export const OCTANE_SOUND = {
  engine: { volume: 0.14, startTime: 0, endTime: 999, duration: 999 },
  engineIdle: { volume: 0.16, startTime: 0, endTime: 999, duration: 999 },
  revShift: { volume: 0.38, startTime: 0, endTime: 0.42, duration: 0.48 },
  nitroPerfect: { volume: 0.5, startTime: 0.02, endTime: 0.62, duration: 0.68 },
  badShift: { volume: 0.28, startTime: 0, endTime: 0.18, duration: 0.22 },
} as const satisfies Record<string, SoundTiming>;

/** Base rev pitch multiplier per gear (1-indexed gear after shift) */
export const OCTANE_REV_GEAR_PITCH = [1.0, 1.12, 1.24, 1.36, 1.48, 1.6, 1.72] as const;
