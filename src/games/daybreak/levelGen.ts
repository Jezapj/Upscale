/**
 * Daybreak procedural level generator.
 *
 * The level is a strip of columns where 1 column = a quarter-beat (16th note)
 * and 1 row = one diatonic scale step. All upward climbs and spiked landings
 * are capped to what a one-beat jump (apex ≈ 2.35 rows) can physically clear.
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

/**
 * Physics caps — must stay in sync with DaybreakGame jump apex (~2.35 rows).
 * A clean climb of 2 is clearable; a spiked landing needs ~0.5 extra clearance,
 * so spiked rises are capped at 1.
 */
export const MAX_RISE = 2;
export const MAX_RISE_WITH_SPIKE = 1;
/**
 * Thin platforms sit exactly this many rows above the floor: high enough to
 * walk under (player height ~0.82), low enough to jump onto (≤ MAX_RISE).
 */
export const PLATFORM_HEIGHT = 2;

export interface LevelColumn {
  /** Walkable ground elevation (-7..+7) or null for a pitfall. */
  floor: number | null;
  /** Spike sitting on top of the floor at this column. */
  spike: boolean;
  /**
   * Thin floating platform elevation, or null. Player can land on top or
   * pass underneath; hitting the underside kills.
   */
  platform: number | null;
  /** Spike sitting on top of the thin platform. */
  platformSpike: boolean;
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

type PatternKind =
  | "rest"
  | "spikes"
  | "stairs"
  | "arpeggio"
  | "pit"
  | "wall"
  | "platform";

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

function clampFloor(f: number): number {
  return Math.min(ELEVATION_SPAN, Math.max(-ELEVATION_SPAN, f));
}

/** Clamp an upward delta so a beat-timed jump can clear it (and any spike). */
function clampRise(delta: number, spiked: boolean): number {
  if (delta <= 0) return delta;
  const cap = spiked ? MAX_RISE_WITH_SPIKE : MAX_RISE;
  return Math.min(delta, cap);
}

export function generateLevel(seed: number): DaybreakLevel {
  const rng = mulberry32(seed);
  const key = pickKey(rng);
  const bpm = pickBpm(key, rng);
  const difficulty = key.accidentals;

  // ~20% of the original 48–96 measure length → roughly 9–19 measures.
  const measures = 9 + Math.round(difficulty * 1.5);

  const columns: LevelColumn[] = [];
  let floor = 0;
  let lastHazardCol = -100;

  const push = (
    count: number,
    f: number | null,
    spike = false,
    platform: number | null = null,
    platformSpike = false,
  ) => {
    for (let i = 0; i < count; i++) {
      columns.push({ floor: f, spike, platform, platformSpike });
    }
  };
  const flat = (count: number) => push(count, floor);

  /** Flat stretch packed with single / double / triple spikes. */
  const spikeMeasure = () => {
    const start = columns.length;
    const slots =
      difficulty >= 2
        ? [4, 6, 8, 10, 12, 14]
        : [4, 6, 8, 10, 12];
    const maxClusters = 2 + Math.floor(rng() * (2 + difficulty * 0.5));
    const chance = 0.72 + difficulty * 0.04;

    const spikeCols = new Set<number>();
    let placed = 0;
    for (const slot of slots) {
      if (placed >= maxClusters) break;
      const abs = start + slot;
      if (abs - lastHazardCol < 5) continue;
      if (rng() > chance) continue;

      let width = 1;
      const roll = rng();
      if (difficulty >= 1 && roll < 0.45) width = 2;
      if (difficulty >= 3 && roll < 0.22) width = 3;
      if (difficulty >= 5 && roll < 0.12) width = 3;

      for (let w = 0; w < width && slot + w < COLUMNS_PER_MEASURE; w++) {
        spikeCols.add(slot + w);
      }
      lastHazardCol = abs + width - 1;
      placed++;
    }

    for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
      push(1, floor, spikeCols.has(i));
    }
  };

  /**
   * Climb or drop. Upward steps never exceed MAX_RISE (and are spaced so each
   * requires its own beat-timed jump). No spikes on the riser column itself.
   */
  const stairsMeasure = () => {
    let dir: 1 | -1;
    if (floor >= 5) dir = -1;
    else if (floor <= -5) dir = 1;
    else dir = rng() < 0.5 ? 1 : -1;

    // Up: 1 or 2 rows (never 3). Down: 1–2 for drama.
    const stepSize =
      dir === 1
        ? difficulty >= 3 && rng() < 0.4
          ? MAX_RISE
          : 1
        : difficulty >= 3 && rng() < 0.45
          ? 2
          : 1;

    // Climbing needs a full beat between risers so the jump can land.
    const stepEvery =
      dir === 1 ? COLUMNS_PER_BEAT * 2 : COLUMNS_PER_BEAT;

    for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
      if (i > 0 && i % stepEvery === 0) {
        const delta = dir * stepSize;
        const next = clampFloor(floor + (delta > 0 ? clampRise(delta, false) : delta));
        if (next !== floor) {
          floor = next;
          lastHazardCol = columns.length;
        }
      }
      flat(1);
    }
  };

  /**
   * Multi-measure arpeggio: sweeps elevation with occasional turnarounds.
   * Upward steps capped; spikes only on flat or descending landings, or on
   * +1 rises (never on +2 rises).
   */
  const arpeggioPassage = () => {
    const measuresLong = 2 + (difficulty >= 3 && rng() < 0.5 ? 1 : 0);
    let dir: 1 | -1 =
      floor > 2 ? -1 : floor < -2 ? 1 : rng() < 0.55 ? 1 : -1;
    const stepEvery = COLUMNS_PER_BEAT;
    let flipsLeft = 1 + (difficulty >= 4 ? 1 : 0);

    for (let m = 0; m < measuresLong; m++) {
      for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
        if (i > 0 && i % stepEvery === 0) {
          if (
            flipsLeft > 0 &&
            rng() < 0.28 &&
            i >= COLUMNS_PER_BEAT &&
            i <= COLUMNS_PER_MEASURE - COLUMNS_PER_BEAT
          ) {
            dir = (dir * -1) as 1 | -1;
            flipsLeft--;
          }
          if (floor >= ELEVATION_SPAN - 1 && dir === 1) dir = -1;
          if (floor <= -ELEVATION_SPAN + 1 && dir === -1) dir = 1;

          // Prefer step of 1 upward so spikes remain placeable; occasional +2 clean.
          let step = 1;
          if (dir === 1 && difficulty >= 4 && rng() < 0.3) step = MAX_RISE;
          if (dir === -1 && difficulty >= 3 && rng() < 0.35) step = 2;

          const rise = dir * step;
          const wantSpike = rng() < 0.18 + difficulty * 0.03;
          const safeRise =
            rise > 0 ? clampRise(rise, wantSpike) : rise;
          floor = clampFloor(floor + safeRise);
          lastHazardCol = columns.length;

          // Spikes only when the rise is still clearable with the spike.
          const spiked =
            wantSpike &&
            (safeRise <= 0 || safeRise <= MAX_RISE_WITH_SPIKE);
          if (spiked) {
            push(1, floor, true);
            lastHazardCol = columns.length - 1;
            continue;
          }
        }
        flat(1);
      }
    }
  };

  /** Gap in the floor; far-side rise is capped to a clearable jump. */
  const pitMeasure = () => {
    const start = columns.length;
    const gapAt = rng() < 0.45 ? 4 : 8;
    const gapW =
      difficulty >= 4 && rng() < 0.4 ? 3 : difficulty >= 2 && rng() < 0.5 ? 3 : 2;
    if (start + gapAt - lastHazardCol < 5) {
      flat(COLUMNS_PER_MEASURE);
      return;
    }

    // Downward can be steeper; upward never exceeds MAX_RISE.
    let jump: number;
    if (rng() < 0.55) {
      jump = -(1 + Math.floor(rng() * (difficulty >= 3 ? 3 : 2))); // -1..-3
    } else {
      jump = 1 + Math.floor(rng() * MAX_RISE); // +1..+2
      jump = clampRise(jump, false);
    }

    flat(gapAt);
    push(gapW, null);
    floor = clampFloor(floor + jump);
    flat(COLUMNS_PER_MEASURE - gapAt - gapW);
    lastHazardCol = start + gapAt + gapW - 1;
  };

  /** Raised block ≤ MAX_RISE. Spikes only on height-1 walls. */
  const wallMeasure = () => {
    const start = columns.length;
    const h =
      difficulty >= 2 && rng() < 0.55 ? MAX_RISE : 1;
    if (floor + h > ELEVATION_SPAN || start + 4 - lastHazardCol < 5) {
      flat(COLUMNS_PER_MEASURE);
      return;
    }
    flat(4);
    // Spiking the top of a +2 wall is uncleatable — only spike height-1 walls.
    const spiked = h <= MAX_RISE_WITH_SPIKE && difficulty >= 2 && rng() < 0.4;
    for (let i = 0; i < 8; i++) {
      push(1, floor + h, spiked && (i === 3 || i === 4));
    }
    // After the wall the floor stays at the approach height (drop off the back).
    flat(4);
    lastHazardCol = start + 12;
  };

  /**
   * Thin platforms at PLATFORM_HEIGHT above the floor — walk under or jump on.
   * No platform-top spikes (landing on a spiked +2 platform exceeds jump apex).
   * Floor spikes under the platform are fine (forces the hop up).
   */
  const platformMeasure = () => {
    const start = columns.length;
    const platElev = clampFloor(floor + PLATFORM_HEIGHT);
    if (
      platElev - floor !== PLATFORM_HEIGHT ||
      start + 4 - lastHazardCol < 4
    ) {
      flat(COLUMNS_PER_MEASURE);
      return;
    }

    const platAt = rng() < 0.5 ? 4 : 6;
    const platW = 4 + Math.floor(rng() * 5); // 4–8 columns
    const end = Math.min(COLUMNS_PER_MEASURE, platAt + platW);

    const floorSpike = difficulty >= 1 && rng() < 0.5;
    const floorSpikeAt = platAt + Math.floor(platW / 2);

    for (let i = 0; i < COLUMNS_PER_MEASURE; i++) {
      const onPlat = i >= platAt && i < end;
      push(
        1,
        floor,
        floorSpike && onPlat && i === floorSpikeAt,
        onPlat ? platElev : null,
        false,
      );
      if (onPlat && i === platAt) lastHazardCol = start + i;
    }
  };

  flat(COLUMNS_PER_MEASURE);

  const weights: Weighted[] = [
    { kind: "rest", weight: Math.max(0.1, 0.9 - difficulty * 0.12) },
    { kind: "spikes", weight: 4.5 + difficulty * 1.2 },
    { kind: "stairs", weight: 2.5 + difficulty * 0.6 },
    { kind: "arpeggio", weight: 2.2 + difficulty * 0.7 },
    { kind: "pit", weight: 1.8 + difficulty * 0.5 },
    { kind: "wall", weight: 1.6 + difficulty * 0.5 },
    // Platforms are a signature choice — spawn often.
    { kind: "platform", weight: 4.5 + difficulty * 0.6 },
  ];

  for (let m = 0; m < measures; m++) {
    switch (pickPattern(weights, rng)) {
      case "rest":
        if (rng() < 0.55) spikeMeasure();
        else flat(COLUMNS_PER_MEASURE);
        break;
      case "spikes":
        spikeMeasure();
        break;
      case "stairs":
        stairsMeasure();
        break;
      case "arpeggio":
        arpeggioPassage();
        break;
      case "pit":
        pitMeasure();
        break;
      case "wall":
        wallMeasure();
        break;
      case "platform":
        platformMeasure();
        break;
    }
  }

  // Safety pass moved to after outro — see below.

  let outroGuard = 0;
  while (floor !== 0 && outroGuard++ < 24) {
    if (floor > 0) {
      floor -= Math.min(MAX_RISE, floor);
      flat(COLUMNS_PER_BEAT);
    } else {
      floor += Math.min(MAX_RISE, -floor);
      flat(COLUMNS_PER_BEAT * 2);
    }
  }
  floor = 0;
  flat(COLUMNS_PER_MEASURE);

  sanitizeClimbs(columns);

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
 * Walk the level and fix any upward floor jump that exceeds jump apex,
 * accounting for spikes on the destination. Also strips platform spikes and
 * clamps platforms to PLATFORM_HEIGHT above their floor.
 */
function sanitizeClimbs(columns: LevelColumn[]): void {
  let prevFloor: number | null = 0;
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];

    // Platforms: force jumpable / walk-under height; never spike the top.
    if (col.platform !== null && col.floor !== null) {
      col.platform = col.floor + PLATFORM_HEIGHT;
      if (col.platform > ELEVATION_SPAN) {
        col.platform = null;
        col.platformSpike = false;
      } else {
        col.platformSpike = false;
      }
    } else if (col.platform !== null && col.floor === null) {
      // Platform over a pit — keep relative to previous solid floor if possible.
      const base = prevFloor ?? 0;
      col.platform = clampFloor(base + PLATFORM_HEIGHT);
      col.platformSpike = false;
    }

    if (col.floor === null) {
      prevFloor = null;
      continue;
    }

    if (prevFloor !== null && col.floor > prevFloor) {
      const rise = col.floor - prevFloor;
      const capped = clampRise(rise, col.spike);
      if (capped < rise) {
        col.floor = prevFloor + capped;
        // If we still can't fit a spike on this rise, strip it.
        if (col.spike && capped > MAX_RISE_WITH_SPIKE) {
          col.spike = false;
        }
      }
    }

    // Spikes on a floor that was just climbed by > MAX_RISE_WITH_SPIKE from the
    // previous solid column: strip them.
    if (col.spike && prevFloor !== null && col.floor - prevFloor > MAX_RISE_WITH_SPIKE) {
      col.spike = false;
    }

    prevFloor = col.floor;
  }
}

/**
 * Score: progress × difficulty/tempo, plus a bonus for each BPM-synced jump
 * (crotchet / quaver / semiquaver timing) and a clear bonus.
 */
export function scoreDaybreak(
  level: DaybreakLevel,
  progress: number,
  completed: boolean,
  syncJumps: number,
): number {
  const p = Math.min(1, Math.max(0, progress));
  const multiplier = 8 + level.difficulty * 4 + level.bpm / 12;
  const base = Math.round(p * 100 * multiplier);
  const syncBonus =
    Math.max(0, Math.round(syncJumps)) * (42 + level.difficulty * 8);
  const clearBonus = completed ? 1200 + level.difficulty * 500 : 0;
  return base + syncBonus + clearBonus;
}
