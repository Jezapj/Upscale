/** Tunable timing/volume for game sounds. Times are in seconds. */
export interface SoundTiming {
  /** Output level 0–1 */
  volume: number;
  /** Seconds into the source where playback begins (clip start) */
  startTime: number;
  /** Seconds into the source where the clip/loop region ends */
  endTime: number;
  /** Playback length for one-shots; loops use startTime→endTime */
  duration: number;
}

/** Sample file + clip trim points */
export interface SampleClip extends SoundTiming {
  src: string;
  loop?: boolean;
}

/** Dissiada — piano-like lane taps */
export const DISSIADA_SOUND = {
  note: { volume: 0.3, startTime: 0, endTime: 0.16, duration: 0.2 },
  noteMiss: { volume: 0.22, startTime: 0, endTime: 0.09, duration: 0.11 },
  /** Harmonic layer level relative to harmonic.volume */
  harmonicVolume: 1,
  /** Longer tail for combo harmonics */
  harmonic: { volume: 0.2, startTime: 0, endTime: 0.45, duration: 0.58 },
  harmonicChorus: { detuneCents: 5, voiceWet: 0.4 },
  harmonicReverb: { wet: 0.42, duration: 1.15, decay: 2.6 },
} as const satisfies Record<string, SoundTiming | number | { detuneCents: number; voiceWet: number } | { wet: number; duration: number; decay: number }>;

/** Combo milestone — extra harmonic above base (equal temperament) */
export interface DissiadaComboHarmonic {
  minCombo: number;
  semitones: number;
  /** Override DISSIADA_SOUND.harmonic.startTime (seconds) */
  startTime?: number;
  /** Override DISSIADA_SOUND.harmonic.endTime (seconds) */
  endTime?: number;
  /** Override DISSIADA_SOUND.harmonic.duration (seconds) */
  duration?: number;
}

/** Combo milestones — extra harmonic above base (equal temperament) */
export const DISSIADA_COMBO_HARMONICS = [
  { minCombo: 10, semitones: 4, startTime: 0.05, endTime: 0.20, duration: 0.4 },
  { minCombo: 20, semitones: 7,  startTime: 0.1, endTime: 0.25, duration: 0.3 },
  { minCombo: 30, semitones: 12, startTime: 0.15, endTime: 0.35, duration: 0.2  },
  { minCombo: 40, semitones: 16, startTime: 0.2, endTime: 0.4, duration: 0.1  },
  { minCombo: 50, semitones: 19, startTime: 0.25, endTime: 0.45, duration: 0.1  },
] as const satisfies readonly DissiadaComboHarmonic[];

/** Combo visual milestones — white hit feedback */
export const DISSIADA_COMBO_VISUALS = {
  edgeHighlight: DISSIADA_COMBO_HARMONICS[0].minCombo,
  fullFlash: DISSIADA_COMBO_HARMONICS[1].minCombo,
} as const;

/** Per-lane base frequencies (Hz) */
export const DISSIADA_NOTE_HZ = [261.63, 293.66, 349.23, 392.0] as const;

/** TipTop — flap thump and hole-in-one */
export const TIPTOP_SOUND = {
  flap: { volume: 0.88, startTime: 0, endTime: 0.06, duration: 0.09 },
  holeIn: { volume: 0.62, startTime: 0, endTime: 0.52, duration: 0.52 },
} as const satisfies Record<string, SoundTiming>;

/** Octane — car samples from /public */
export const OCTANE_SAMPLES = {
  /** Looped idle rumble while coasting / off throttle */
  idle: {
    src: "/CarIdle.mp3",
    volume: 0.5,
    startTime: 0,
    endTime: 8,
    duration: 8,
    loop: true,
  },
  /** CarRev clip — loops only while pinned at the redline */
  revLoop: {
    src: "/CarRev.mp3",
    volume: 0.62,
    startTime: 1.1,
    endTime: 1.2,
    duration: 2,
    loop: true,
  },
  /** Engine start when the run begins */
  startup: {
    src: "/CarStartup.mp3",
    volume: 0.85,
    startTime: 0,
    endTime: 4.8,
    duration: 4.85,
    loop: false,
  },
} as const satisfies Record<string, SampleClip>;

/** Procedural engine + shift sounds */
export const OCTANE_SOUND = {
  engine: { volume: 0.08, startTime: 0, endTime: 999, duration: 999 },
  engineIdle: { volume: 0.16, startTime: 0, endTime: 999, duration: 999 },
  revShift: { volume: 0.78, startTime: 0, endTime: 0.42, duration: 0.48 },
  nitroPerfect: { volume: 0.3, startTime: 0, endTime: 0.62, duration: 0.68 },
  nitroSweep: { volume: 0.3, startTime: 0.02, endTime: 0.62, duration: 0.68 },
  badShift: { volume: 0.28, startTime: 0, endTime: 0.18, duration: 0.22 },
} as const satisfies Record<string, SoundTiming>;

/** Procedural shift rev pitch multiplier per gear (1-indexed gear after shift) */
export const OCTANE_REV_GEAR_PITCH = [0.92, 1.0, 1.08, 1.16, 1.24, 1.32, 1.4] as const;

/** Tach redline band — CarRev sample fades in across this RPM range */
export const OCTANE_REDLINE = { start: 7500, end: 9000 } as const;

/** Off-throttle mix — duck synth/rev so CarIdle is clearer */
export const OCTANE_IDLE_MIX = {
  idleOffGas: 0.9,
  idleOnGas: 0.3,
  synthOffGas: 0.14,
  synthOnGas: 1,
  revOffGas: 0,
} as const;
