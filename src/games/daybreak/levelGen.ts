/**
 * Daybreak procedural level generator.
 *
 * The level is a strip of columns where 1 column = a quarter-beat (16th note)
 * and 1 row = one diatonic scale step. Every obstacle therefore sits exactly
 * on a beat, half-beat, or quarter-beat of the chosen BPM, and the jump arc
 * (tuned to last exactly one beat) naturally clears them when timed to the
 * rhythmic grid.
 */

import {
  ELEVATION_SPAN,
  pickBpm,
  pickKey,
  type MusicalKey,
  type Rng,
} from "./musicTheory";

export const COLUMNS_PER_BEAT = 4;
export const BEATS_PER_MEASURE = 4;
export const COLUMNS_PER_MEASURE = COLUMNS_PER_BEAT * BEATS_PER_MEASURE;

export interface LevelColumn {
  /** Walkable ground elevation (-7..+7) or null for a pitfall. */
  floor: number | null;
  /** Spike sitting on top of the floor at this column. */
  spike: boolean;
}

export interface DaybreakLevel {
  seed: number;
  key: MusicalKey;
  bpm: number;
  /** 0-6, equals the key signature's accidental count. */
  difficulty: number;
  columns: LevelColumn[];
  totalColumns: number;
}

/** Deterministic RNG so a death-reset replays the identical level. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PatternKind = "rest" | "spikes" | "stairs" | "pit" | "wall";

interface Weighted {
  kind: PatternKind;
  weight: number;
}

function pickPattern(options: Weighted[], rng: Rng): PatternKind {
  let total = 0;
  for (const o of options) total += o.weight;
  let roll = rng() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.kind;
  }
  return "rest";
}

export function generateLevel(seed: number): DaybreakLevel {
  const rng = mulberry32(seed);
  const key = pickKey(rng);
  const bpm = pickBpm(key, rng);
  const difficulty = key.accidentals;

  // Harder keys get longer, denser levels (48-96 measures per the design).
  const measures = 48 + difficulty * 8;

  const columns: LevelColumn[] = [];
  let floor = 0;
  // Absolute column index of the most recent hazard, used to guarantee that
  // consecutive obstacles are always at least one full jump apart.
  let lastHazardCol = -100;

  const push = (count: number, f: number | null, spike = false) => {
    for (let i = 0; i < count; i++) columns.push({ floor: f, spike });
  };
  const flat = (count: number) => push(count, floor);

  /** Flat measure with spikes on beat / half-beat slots. */
  const spikeMeasure = () => {
    const start = columns.length;
    // Never place hazards on the first beat of a measure so pattern
    // boundaries always leave room to recover from the previous pattern.
    const slots =
      difficulty >= 3 ? [4, 6, 8, 10, 12, 14] : [4, 8, 12];
    const maxSpikes = 1 + Math.floor(rng() * (1 + difficulty * 0.45));
    const chance = 0.4 + difficulty * 0.07;

    const spikeCols = new Set<number>();
    let placed = 0;
    for (const slot of slots) {
      if (placed >= maxSpikes) break;
      const abs = start + slot;
      if (abs - lastHazardCol < 6) continue;
      if (rng() > chance) continue;
      spikeCols.add(slot);
      lastHazardCol = abs;
      placed++;
      // Occasionally widen to a double spike on hard keys.
      if (difficulty >= 4 && rng() < 0.3 && slot < 15) {
        spikeCols.add(slot + 1);
        lastHazardCol = abs + 1;
      }
    }

    for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
      push(1, floor, spikeCols.has(i));
    }
  };

  /** Climb or descend, one scale step at a time, aligned to beats. */
  const stairsMeasure = () => {
    // Drift back toward the baseline so the level uses the full ±1 octave
    // without pinning against the boundaries.
    let dir: 1 | -1;
    if (floor >= 4) dir = -1;
    else if (floor <= -4) dir = 1;
    else dir = rng() < 0.5 ? 1 : -1;

    if (dir === 1) {
      // Climbing requires a beat-timed jump per riser. Steps land every two
      // beats (half-note rhythm) so each jump has a full beat of ground to
      // set up the next one; harder keys climb via more stair measures.
      const stepEvery = COLUMNS_PER_BEAT * 2;
      for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
        if (i > 0 && i % stepEvery === 0 && floor < ELEVATION_SPAN) {
          floor += 1;
          lastHazardCol = columns.length; // riser acts as a wall hazard
        }
        flat(1);
      }
    } else {
      // Descending is free-fall; steps land on half-beats.
      const stepEvery = COLUMNS_PER_BEAT * (difficulty >= 3 ? 1 : 2);
      const drop = difficulty >= 5 && rng() < 0.4 ? 2 : 1;
      for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
        if (i > 0 && i % stepEvery === 0 && floor - drop >= -ELEVATION_SPAN) {
          floor -= drop;
        }
        flat(1);
      }
    }
  };

  /** A gap in the floor, 2-3 columns wide, starting on a beat. */
  const pitMeasure = () => {
    const start = columns.length;
    const gapAt = rng() < 0.5 ? 4 : 8;
    const gapW = difficulty >= 3 && rng() < 0.5 ? 3 : 2;
    if (start + gapAt - lastHazardCol < 6) {
      flat(COLUMNS_PER_MEASURE);
      return;
    }
    // Occasionally the far side sits one step lower (descending phrase).
    const dropAfter = rng() < 0.3 && floor > -ELEVATION_SPAN + 1 ? 1 : 0;

    flat(gapAt);
    push(gapW, null);
    floor -= dropAfter;
    flat(COLUMNS_PER_MEASURE - gapAt - gapW);
    lastHazardCol = start + gapAt + gapW - 1;
  };

  /** A raised block: side hit kills, landing on top is safe. */
  const wallMeasure = () => {
    const start = columns.length;
    const h = difficulty >= 3 ? 2 : 1;
    if (floor + h > ELEVATION_SPAN || start + 4 - lastHazardCol < 6) {
      flat(COLUMNS_PER_MEASURE);
      return;
    }
    flat(4); // one clear beat of approach
    push(8, floor + h); // block spans beats 2-3
    flat(4);
    lastHazardCol = start + 12;
  };

  // Two rest measures of lead-in so the player starts with the music.
  flat(COLUMNS_PER_MEASURE * 2);

  const weights: Weighted[] = [
    { kind: "rest", weight: Math.max(0.6, 5 - difficulty) },
    { kind: "spikes", weight: 2 + difficulty },
    { kind: "stairs", weight: 1.5 + difficulty * 0.4 },
    { kind: "pit", weight: 1 + difficulty * 0.5 },
    { kind: "wall", weight: 1 + difficulty * 0.5 },
  ];

  for (let m = 0; m < measures; m++) {
    switch (pickPattern(weights, rng)) {
      case "rest":
        flat(COLUMNS_PER_MEASURE);
        break;
      case "spikes":
        spikeMeasure();
        break;
      case "stairs":
        stairsMeasure();
        break;
      case "pit":
        pitMeasure();
        break;
      case "wall":
        wallMeasure();
        break;
    }
  }

  // Outro: glide back to the baseline, then two victory-lap measures.
  // Descents are free-fall drops each beat; climbs get two beats per riser
  // so the final stretch never demands a tighter rhythm than the level did.
  while (floor !== 0) {
    if (floor > 0) {
      floor -= 1;
      flat(COLUMNS_PER_BEAT);
    } else {
      floor += 1;
      flat(COLUMNS_PER_BEAT * 2);
    }
  }
  flat(COLUMNS_PER_MEASURE * 2);

  return {
    seed,
    key,
    bpm,
    difficulty,
    columns,
    totalColumns: columns.length,
  };
}

/**
 * Score: progress percentage weighted by how demanding the run was
 * (key complexity + tempo), with a chunky bonus for a full clear.
 */
export function scoreDaybreak(
  level: DaybreakLevel,
  progress: number,
  completed: boolean,
): number {
  const p = Math.min(1, Math.max(0, progress));
  const multiplier = 8 + level.difficulty * 4 + level.bpm / 12;
  const base = Math.round(p * 100 * multiplier);
  const bonus = completed ? 1200 + level.difficulty * 500 : 0;
  return base + bonus;
}
