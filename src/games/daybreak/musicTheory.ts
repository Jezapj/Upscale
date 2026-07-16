/**
 * Daybreak music theory: key selection, difficulty from the key signature,
 * BPM biasing, and the 2-octave scale-to-elevation frequency map that drives
 * both the level generator and the synthesized notes.
 */

export type Rng = () => number;

export interface MusicalKey {
  /** Display name, e.g. "E Major". */
  name: string;
  /** MIDI note of the baseline tonic (elevation 0). */
  tonicMidi: number;
  mode: "major" | "minor";
  /** Number of sharps/flats in the key signature (0-6). Drives difficulty. */
  accidentals: number;
}

/** Elevations span the tonic ± one octave: -7..+7 diatonic steps. */
export const ELEVATION_SPAN = 7;
export const ELEVATION_COUNT = ELEVATION_SPAN * 2 + 1;

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

/**
 * All 24 keys. Tonic MIDI notes are kept within A3-G#4 so the full 2-octave
 * playfield stays in a comfortable ~110-830 Hz register.
 */
export const KEYS: MusicalKey[] = [
  // Majors — sharps
  { name: "C Major", tonicMidi: 60, mode: "major", accidentals: 0 },
  { name: "G Major", tonicMidi: 67, mode: "major", accidentals: 1 },
  { name: "D Major", tonicMidi: 62, mode: "major", accidentals: 2 },
  { name: "A Major", tonicMidi: 57, mode: "major", accidentals: 3 },
  { name: "E Major", tonicMidi: 64, mode: "major", accidentals: 4 },
  { name: "B Major", tonicMidi: 59, mode: "major", accidentals: 5 },
  { name: "F# Major", tonicMidi: 66, mode: "major", accidentals: 6 },
  // Majors — flats
  { name: "F Major", tonicMidi: 65, mode: "major", accidentals: 1 },
  { name: "Bb Major", tonicMidi: 58, mode: "major", accidentals: 2 },
  { name: "Eb Major", tonicMidi: 63, mode: "major", accidentals: 3 },
  { name: "Ab Major", tonicMidi: 68, mode: "major", accidentals: 4 },
  { name: "Db Major", tonicMidi: 61, mode: "major", accidentals: 5 },
  // Minors — sharps
  { name: "A Minor", tonicMidi: 57, mode: "minor", accidentals: 0 },
  { name: "E Minor", tonicMidi: 64, mode: "minor", accidentals: 1 },
  { name: "B Minor", tonicMidi: 59, mode: "minor", accidentals: 2 },
  { name: "F# Minor", tonicMidi: 66, mode: "minor", accidentals: 3 },
  { name: "C# Minor", tonicMidi: 61, mode: "minor", accidentals: 4 },
  { name: "G# Minor", tonicMidi: 68, mode: "minor", accidentals: 5 },
  { name: "D# Minor", tonicMidi: 63, mode: "minor", accidentals: 6 },
  // Minors — flats
  { name: "D Minor", tonicMidi: 62, mode: "minor", accidentals: 1 },
  { name: "G Minor", tonicMidi: 67, mode: "minor", accidentals: 2 },
  { name: "C Minor", tonicMidi: 60, mode: "minor", accidentals: 3 },
  { name: "F Minor", tonicMidi: 65, mode: "minor", accidentals: 4 },
  { name: "Bb Minor", tonicMidi: 58, mode: "minor", accidentals: 5 },
];

export function pickKey(rng: Rng): MusicalKey {
  return KEYS[Math.floor(rng() * KEYS.length) % KEYS.length];
}

/**
 * BPM scales with the complexity of the key signature: simple keys sit around
 * 85-105 BPM while 5-6 accidental keys push into the 150-170 range.
 */
export function pickBpm(key: MusicalKey, rng: Rng): number {
  const base = 88 + key.accidentals * 11;
  const jitter = rng() * 18 - 6; // skewed slightly upward
  return Math.round(Math.min(172, Math.max(82, base + jitter)));
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Frequencies for every elevation, index 0 = elevation -7 (one octave below
 * the tonic) through index 14 = elevation +7 (one octave above).
 */
export function scaleFrequencies(key: MusicalKey): number[] {
  const steps = key.mode === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const out: number[] = [];
  for (let e = -ELEVATION_SPAN; e <= ELEVATION_SPAN; e++) {
    const octave = Math.floor(e / 7);
    const degree = ((e % 7) + 7) % 7;
    out.push(midiToHz(key.tonicMidi + octave * 12 + steps[degree]));
  }
  return out;
}

/** Frequency for one elevation (-7..+7), clamped to the valid range. */
export function elevationHz(freqs: number[], elevation: number): number {
  const idx = Math.min(
    ELEVATION_COUNT - 1,
    Math.max(0, Math.round(elevation) + ELEVATION_SPAN),
  );
  return freqs[idx];
}
