import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { OctaneConfig } from "./octaneConfig";
import { formatRaceTime, scoreOctaneDrag, type GameResult } from "./gameResult";
import {
  createOctaneBrakeSound,
  createOctaneEngineSound,
  playOctaneBadShift,
  playOctaneBrakeChirp,
  playOctaneHit,
  playOctaneNitroPerfect,
  playOctaneRevShift,
  playOctaneWarning,
  preloadOctaneAudio,
  preloadSamples,
  SAMPLE_SRC,
  unlockGameAudio,
} from "./gameAudio";
import { hapticLaunch, hapticLight, hapticThrottled } from "@/lib/haptic";
import { canvasDpr } from "./gameLoop";

interface Props {
  width: number;
  height: number;
  config: OctaneConfig;
  onGameOver: (result: number | GameResult) => void;
  paused?: boolean;
}

const GEARS = 6;
const RPM_MAX = 9000;
const REDLINE_START = 7500;
const REDLINE_END = 9000;
const SHIFT_PERFECT_MIN = 7000;
const SHIFT_PERFECT_MAX = 8800;
const MPH_MAX = 300;
/** Wheel rotation rate (lower = slower spin). */
const WHEEL_SPIN_RATE = 100;
/** Per-gear top speed (mph). Must shift to exceed each cap. */
const GEAR_SPEED_CAP = [40, 80, 120, 150, 220, 301];
/** MPH gained per frame at redline, per gear (60fps baseline). */
const GEAR_ACCEL = [0.52, 0.44, 0.36, 0.28, 0.22, 0.17];
const SCENERY_TILE = 3200;
const SAKURA_TILE = 2400;
/** Roadside tree draw height (px); variants add TREE_VARIANT_STEP each. */
const TREE_BASE_HEIGHT = 205;
const TREE_VARIANT_STEP = 46;
/** Pixels to nudge trees upward (higher = sits higher above the road). */
const TREE_Y_LIFT = 15;
const BG_PARALLAX = 0.005;
const TREE_PARALLAX = 0.92;
const SAKURA_PARALLAX = 1.82;
/** Crop/zoom factor for background sprites (higher = more zoomed in). */
const BG_ZOOM = 1.45;
/** Extend draw height below the scene (top-anchored) so the horizon sits lower without a gap at the top. */
const BG_EXTEND_DOWN = 0.4;
/** Chance each run is a night drive (dark + moon / street-light beams). */
const NIGHT_RUN_CHANCE = 0.34;
/** Car height as a fraction of road band height. */
const CAR_HEIGHT_RATIO = 0.72;

/** Perfect-shift speed-boost lunge: quick snap right, slow settle back with bounce. */
const BOOST_LUNGE_TUNING = {
  /** Animation length (60fps frames, scaled by dt). */
  duration: 52,
  /** Peak horizontal nudge to the right (px). */
  maxX: 34,
  /** Vertical bounce amplitude during the return (px). */
  bounceY: 8,
  /** Fraction of the animation spent lunging right (rest is return). */
  lungeOutFrac: 0.2,
  /** MPH at/above which the shift lunge starts fading. */
  speedFadeStart: 35,
  /** MPH where the lunge reaches minimum intensity. */
  speedFadeEnd: 190,
  /** Floor intensity at very high speed (0-1). */
  minIntensity: 0.28,
  /** Gas-pedal animation length (60fps frames, scaled by dt). */
  launchDuration: 64,
  /** Gas-pedal peak horizontal nudge to the right (px). */
  launchMaxX: 48,
  /** Gas-pedal lunge-out phase (fraction of launchDuration). */
  launchLungeOutFrac: 0.24,
  /** Max wheelie pitch on gas (radians, nose-up). */
  launchMaxPitch: 0.11,
  /** Gas animation phase when the wheelie peaks. */
  launchWheeliePeak: 0.3,
  /** Gas animation phase when the front wheels are back on the ground. */
  launchWheelieLand: 0.58,
  /** Brake-pedal animation length (60fps frames, scaled by dt). */
  brakeDuration: 64,
  /** Brake-pedal peak backward nudge (px, applied as negative X). */
  brakeMaxX: 42,
  /** Brake-pedal lunge-out phase (fraction of brakeDuration). */
  brakeLungeOutFrac: 0.24,
  /** Max stoppie pitch on brake (radians, rear-up around front axle). */
  brakeMaxPitch: 0.1,
  /** Brake animation phase when the stoppie peaks. */
  brakeStoppiePeak: 0.3,
  /** Brake animation phase when the rear wheels are back on the ground. */
  brakeStoppieLand: 0.58,
  /** Minimum MPH to start the gas wheelie. */
  launchMinMph: 20,
  /** Minimum MPH to start / hold the brake stoppie. */
  brakeMinMph: 80,
  /** Frames to ease into the held stoppie pose. */
  brakeEngageDuration: 14,
  /** Frames to settle back after brake release or dropping below brakeMinMph. */
  brakeReleaseDuration: 38,
  /** Master switch for the low-speed burnout bounce. */
  burnoutEnabled: false,
  /** Below this MPH (when enabled), gas uses burnout bounce instead of wheelie. */
  burnoutMaxMph: 20,
  /** Once exceeded, burnout is disabled for the rest of the run (even back at 0). */
  burnoutDisableMph: 30,
  /** Frames until burnout oscillation fades out (60fps baseline). */
  burnoutDecayDuration: 200,
  /** Peak rear lift pitch at burnout start (radians, front-axle pivot). */
  burnoutPitch: 0.01,
  /** Starting oscillation speed (radians/frame). */
  burnoutStartFreq: 0.15,
  /** Oscillation speed ramp per frame. */
  burnoutFreqRamp: 0.001,
  /** Burnout side-to-side shake at start (px). */
  burnoutShakeX: 300,
  /** Extra rear-wheel spin rate during burnout (rad/frame at 60fps). */
  burnoutWheelSpin: 1.15,
} as const;

type BoostLungeKind = "shift" | "gas";

interface CarPoseEffect {
  x: number;
  y: number;
  pitch: number;
  pivot: "rear" | "front";
}

function boostLungeIntensity(mph: number): number {
  const { speedFadeStart, speedFadeEnd, minIntensity } = BOOST_LUNGE_TUNING;
  if (mph <= speedFadeStart) return 1;
  if (mph >= speedFadeEnd) return minIntensity;
  const t = (mph - speedFadeStart) / (speedFadeEnd - speedFadeStart);
  return 1 - t * (1 - minIntensity);
}

function burnoutAllowed(mph: number, permanentlyDisabled: boolean): boolean {
  const { burnoutEnabled, burnoutMaxMph } = BOOST_LUNGE_TUNING;
  return burnoutEnabled && !permanentlyDisabled && mph < burnoutMaxMph;
}

/** Gas wheelie: full just above launchMinMph, fades out as speed rises. */
function gasWheelieIntensity(mph: number): number {
  if (mph < BOOST_LUNGE_TUNING.launchMinMph) return 0;
  return boostLungeIntensity(mph);
}

/** Brake stoppie: weak at low speed, full at high speed. */
function brakeStoppieIntensity(mph: number): number {
  const { speedFadeStart, speedFadeEnd, minIntensity } = BOOST_LUNGE_TUNING;
  if (mph <= speedFadeStart) return minIntensity;
  if (mph >= speedFadeEnd) return 1;
  const t = (mph - speedFadeStart) / (speedFadeEnd - speedFadeStart);
  return minIntensity + t * (1 - minIntensity);
}

function shiftBoostOffset(
  remaining: number,
  intensity: number,
  duration: number,
): { x: number; y: number } {
  if (remaining <= 0) return { x: 0, y: 0 };
  const t = 1 - remaining / duration;
  const { maxX, bounceY, lungeOutFrac } = BOOST_LUNGE_TUNING;

  if (t <= lungeOutFrac) {
    const p = t / lungeOutFrac;
    const eased = 1 - (1 - p) ** 3;
    return { x: eased * maxX * intensity, y: 0 };
  }

  const p = (t - lungeOutFrac) / (1 - lungeOutFrac);
  const x = maxX * (1 - p) ** 2.4 * intensity;
  const y = Math.sin(p * Math.PI * 2.2) * bounceY * (1 - p * 0.8) * intensity;
  return { x, y };
}

function gasBoostEffect(remaining: number, intensity: number, duration: number): CarPoseEffect {
  if (remaining <= 0) return { x: 0, y: 0, pitch: 0, pivot: "rear" };

  const t = 1 - remaining / duration;
  const {
    launchMaxX,
    launchLungeOutFrac,
    launchMaxPitch,
    launchWheeliePeak,
    launchWheelieLand,
  } = BOOST_LUNGE_TUNING;

  let x = 0;
  if (t <= launchLungeOutFrac) {
    const p = t / launchLungeOutFrac;
    x = (1 - (1 - p) ** 3) * launchMaxX * intensity;
  } else if (t >= launchWheelieLand) {
    const p = (t - launchWheelieLand) / (1 - launchWheelieLand);
    x = launchMaxX * intensity * (1 - p) ** 2.4;
  } else {
    x = launchMaxX * intensity;
  }

  let pitch = 0;
  if (t <= launchWheeliePeak) {
    const p = t / launchWheeliePeak;
    pitch = -launchMaxPitch * (1 - (1 - p) ** 2);
  } else if (t <= launchWheelieLand) {
    const p = (t - launchWheeliePeak) / (launchWheelieLand - launchWheeliePeak);
    const eased = p * p * (3 - 2 * p);
    pitch = -launchMaxPitch * (1 - eased);
  }

  return { x, y: 0, pitch, pivot: "rear" };
}

function heldBrakeStoppieEffect(
  engageRemaining: number,
  hold: boolean,
  releaseRemaining: number,
  mph: number,
): CarPoseEffect {
  const {
    brakeMaxX,
    brakeMaxPitch,
    brakeEngageDuration,
    brakeReleaseDuration,
  } = BOOST_LUNGE_TUNING;
  const intensity = brakeStoppieIntensity(mph);

  if (hold) {
    return {
      x: -brakeMaxX * intensity,
      y: 0,
      pitch: brakeMaxPitch * intensity,
      pivot: "front",
    };
  }

  if (engageRemaining > 0) {
    const t = 1 - engageRemaining / brakeEngageDuration;
    const eased = 1 - (1 - t) ** 2;
    return {
      x: -brakeMaxX * intensity * eased,
      y: 0,
      pitch: brakeMaxPitch * intensity * eased,
      pivot: "front",
    };
  }

  if (releaseRemaining > 0) {
    const t = 1 - releaseRemaining / brakeReleaseDuration;
    const eased = t * t * (3 - 2 * t);
    const remain = 1 - eased;
    return {
      x: -brakeMaxX * intensity * remain,
      y: 0,
      pitch: brakeMaxPitch * intensity * remain,
      pivot: "front",
    };
  }

  return { x: 0, y: 0, pitch: 0, pivot: "front" };
}

function burnoutPoseEffect(animTime: number, elapsed: number): CarPoseEffect {
  const {
    burnoutDecayDuration,
    burnoutPitch,
    burnoutShakeX,
    burnoutStartFreq,
    burnoutFreqRamp,
  } = BOOST_LUNGE_TUNING;

  const life = Math.min(1, elapsed / burnoutDecayDuration);
  const amp = (1 - life) ** 0.0010;
  if (amp <= 0.002) return { x: 0, y: 0, pitch: 0, pivot: "front" };

  const freq = burnoutStartFreq + elapsed * burnoutFreqRamp;
  const wave = Math.sin(animTime * freq);

  return {
    x: Math.sin(animTime * freq * 0.002) * burnoutShakeX * amp,
    y: 0,
    pitch: -wave * burnoutPitch * amp,
    pivot: "front",
  };
}

function computeTimedBoostEffect(
  remaining: number,
  kind: BoostLungeKind,
  mph: number,
  duration: number,
): CarPoseEffect {
  if (kind === "gas") {
    return gasBoostEffect(remaining, gasWheelieIntensity(mph), duration);
  }
  const { x, y } = shiftBoostOffset(remaining, boostLungeIntensity(mph), duration);
  return { x, y, pitch: 0, pivot: "rear" };
}

function computeCarPoseEffect(args: {
  boostLunge: number;
  boostKind: BoostLungeKind;
  boostMph: number;
  boostDuration: number;
  brakeEngage: number;
  brakeHold: boolean;
  brakeRelease: number;
  brakeMph: number;
  burnoutActive: boolean;
  burnoutElapsed: number;
  animTime: number;
}): CarPoseEffect {
  const {
    boostLunge,
    boostKind,
    boostMph,
    boostDuration,
    brakeEngage,
    brakeHold,
    brakeRelease,
    brakeMph,
    burnoutActive,
    burnoutElapsed,
    animTime,
  } = args;

  if (brakeHold || brakeEngage > 0 || brakeRelease > 0) {
    return heldBrakeStoppieEffect(brakeEngage, brakeHold, brakeRelease, brakeMph);
  }

  if (burnoutActive) {
    return burnoutPoseEffect(animTime, burnoutElapsed);
  }

  if (boostLunge > 0) {
    return computeTimedBoostEffect(boostLunge, boostKind, boostMph, boostDuration);
  }

  return { x: 0, y: 0, pitch: 0, pivot: "rear" };
}

function withCarPitch(
  ctx: CanvasRenderingContext2D,
  carDrawX: number,
  carDrawY: number,
  carDrawW: number,
  carDrawH: number,
  pitch: number,
  pivot: "rear" | "front",
  draw: () => void,
) {
  if (pitch === 0) {
    draw();
    return;
  }
  const axle = pivot === "rear" ? WHEEL_TUNING.rear : WHEEL_TUNING.front;
  const pivotX = carDrawX + carDrawW * axle.x;
  const pivotY = carDrawY + carDrawH * axle.y;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(pitch);
  ctx.translate(-pivotX, -pivotY);
  draw();
  ctx.restore();
}

/** Multi-lane dashed markings (world-locked to road scroll) */
const ROAD_MARKINGS = {
  dashLength: 220,
  dashGap: 150,
  lineWidth: 6,
  /** 1 = scrolls with road distance; keep at 1 for painted-on-road feel */
  scrollRate: 1,
} as const;

const LANE_COUNT = 3;
/** Fraction of road band height for each lane's car baseline (far → near). */
const LANE_BASELINES = [0.24, 0.62, 0.99] as const;
const LANE_SCALE = [0.94, 1, 1.06] as const;
/**
 * The car PNG has transparent padding under the wheels; drop the sprite by this
 * fraction of its own height so the tyres meet the lane it is driving in.
 */
const CAR_BASE_INSET = 0.07;
const LANE_SWITCH_MS = 180;
const PX_PER_M = 0.22 / 0.00745;
/** How far ahead (px) an off-screen obstacle raises its lane warning sign. */
const WARN_LEAD_PX = 1100;

type ObstacleKind = "cone" | "oil" | "car";
interface RoadObstacle {
  id: number;
  distanceM: number;
  lane: number;
  kind: ObstacleKind;
  mph: number;
  hit: boolean;
}

const OBSTACLE_PENALTY = {
  cone: { base: 4, factor: 0.06 },
  oil: { base: 6, factor: 0.1 },
  car: { base: 10, factor: 0.16 },
} as const;

/**
 * Tweak normalized car coords and reach until the pools line up with the sprite.
 */
const HEADLIGHT_TUNING = {
  left: { x: 0.89, y: 0.57 },
  right: { x: 0.91, y: 0.55 },
  /** How far ahead beams reach, as a fraction of screen width from the car front. */
  reach: 0.66,
  /** Where beams meet the road: fraction of road band height from road top. */
  roadAnchor: 0.2,
  /** Cone half-width at the far end, as a fraction of road band height. */
  spreadFar: 0.32,
  /** Cone half-width near the car, as a fraction of road band height. */
  spreadNear: 0.04,
  color: { r: 155, g: 146, b: 215 },
  /** Core beam opacity (screen blend). */
  alpha: 0.18,
  /** Wider outer halo opacity multiplier. */
  outerAlpha: 0.68,
} as const;

/**
 * Overhead street / moon beams that parallax-scroll onto the road.
 * Tweak spacing, origin, spread, and color until pools look right on the asphalt.
 */
const ROAD_LIGHT_TUNING = {
  /** Horizontal repeat distance (px): lower = more lights on screen. */
  tileSpacing: 1200,
  /** Scroll speed relative to the car (higher = faster across the screen). */
  parallax: 1.38,
  /** 0-1 chance a light spawns in each tile. */
  spawnChance: 0.37,
  /** Random horizontal offset within each tile (px). */
  spawnXMin: 80,
  spawnXRange: 720,
  /** Beam origin Y as a fraction of scene height (negative = above the top edge). */
  apexY: -1.24,
  /** Where the beam fades out on the road: fraction of road band height from road top. */
  roadFloor: 5.98,
  /** Beam spread radius as a fraction of scene height. */
  spread: 0.7,
  color: { r: 155, g: 155, b: 255 },
  /** Core opacity (screen blend); multiplied by the pulse animation. */
  alpha: 0.99,
  /** Pulse animation: base brightness and sine-wave amplitude (0 = static). */
  pulseBase: 0.99,
  pulseAmount: 0.14,
  pulseSpeed: 0.04,
  /** Skip drawing when this far past the left/right screen edge (px). */
  cullMargin: 320,
  /** Feathered gradient layers (outer → inner). */
  layers: [
    { spreadMult: 0.18, alphaMult: 0.15, yBias: 0.9 },
    { spreadMult: 0.6, alphaMult: 0.72, yBias: 0.78 },
    { spreadMult: 0.75, alphaMult: 0.4, yBias: 0.65 },
  ],
} as const;

/** Night overhead beam → reflective sweep on the car body (front → rear) */
const CAR_GLINT_TUNING = {
  /** Width of the moving highlight band (fraction of car width) */
  bandWidth: 0.4,
  /** How far past the body the sweep stays visible (fraction of car width) */
  sweepOvershoot: 0.94,
  /** Overall glint intensity multiplier */
  strength: 0.22,
  /** Peak brightness at band center (screen blend) */
  specularPeak: 0.52,
  /** Vertical bias - brighter on upper body panels */
  roofBias: 0.92,
} as const;

interface CarGlintPass {
  /** 0 = rear (left), 1 = front (right): band center along the body */
  sweepPos: number;
  strength: number;
}

/**
 * Occasional cinematic lens flare sweeping across the scene (daytime only).
 * Tweak path, timing, and ghost layout until it feels like sun hitting the lens.
 */
const LENS_FLARE_TUNING = {
  /** Seconds between flare spawn attempts (randomized in this range). */
  minInterval: 100,
  maxInterval: 240,
  /** 0-1 chance to spawn when an attempt fires. */
  triggerChance: 0.68,
  /** Seconds for one flare to cross the screen. */
  duration: 230.6,
  /** Sun enters/exits as fractions of screen width (1.15 = off right edge). */
  enterX: 1.18,
  exitX: -0.22,
  /** Base vertical position as a fraction of scene height. */
  y: 0.14,
  /** Random vertical jitter (± fraction of scene height). */
  yJitter: 0.06,
  /** Bright core radius as a fraction of screen width. */
  coreRadius: 0.29,
  /** Horizontal anamorphic streak length / height (fractions of screen). */
  streakLength: 0.62,
  streakHeight: 0.028,
  /** Lens ghost offsets from the sun along X (fraction of width) and radii (fraction of width). */
  ghosts: [
    { x: -0.2, r: 0.038, a: 0.2 },
    { x: 0.14, r: 0.024, a: 0.16 },
    { x: 0.31, r: 0.018, a: 0.12 },
    { x: -0.36, r: 0.03, a: 0.14 },
  ],
  color: { r: 215, g: 212, b: 250 },
  /** Peak opacity multipliers (screen blend), scaled by pass envelope. */
  coreAlpha: 0.52,
  streakAlpha: 0.38,
  haloAlpha: 0.22,
  /** Only attempt flares above this speed (mph). */
  minMph: 20,
} as const;

/**
 * Wheel spin axis on the car sprite (normalized 0-1).
 * Tweak x/y until each wheel rotates around its own center.
 */
const WHEEL_TUNING = {
  rear: { x: 0.2, y: 0.63 },
  front: { x: 0.77, y: 0.64 },
} as const;

/** Above 75% of gear cap, acceleration tapers to 0 at the cap. */
function gearAccelMultiplier(mph: number, gear: number): number {
  const cap = GEAR_SPEED_CAP[gear - 1] ?? MPH_MAX;
  const softStart = cap * 0.75;
  if (mph <= softStart) return 1;
  if (mph >= cap) return 0;
  const t = (mph - softStart) / (cap - softStart);
  return 1 - t * t;
}

type SceneryKind = "tree";

interface SceneryItem {
  x: number;
  kind: SceneryKind;
  variant: number;
}

interface SakuraItem {
  x: number;
  variant: number;
}

function tileScenery(tile: number): SceneryItem[] {
  const v = Math.abs(tile * 7919 + 104729) % 1000;
  return [
    { x: 60 + (v % 100), kind: "tree", variant: tile % 3 },
    { x: 1050 + (v % 180), kind: "tree", variant: (tile + 1) % 3 },
    { x: 2100 + (v % 140), kind: "tree", variant: (tile + 2) % 3 },
  ];
}

/** Intermittent overhead sakura canopies along the route. */
function tileSakura(tile: number): SakuraItem | null {
  const v = Math.abs(tile * 4327 + 91823) % 100;
  if (v > 26) return null;
  return {
    x: 30 + (v * 31) % 420,
    variant: Math.abs(tile) % 2,
  };
}

function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  value: number,
  max: number,
  label: string,
  unit: string,
  redlineStart: number | null,
  redlineEnd: number | null,
  faceColor: string,
  tickColor: string,
  needleColor: string,
  tickMode: "rpm" | "speed" = "rpm",
  cachedGradients?: { bezel: CanvasGradient; faceGrad: CanvasGradient; hub: CanvasGradient },
) {
  const startA = Math.PI * 0.75;
  const endA = Math.PI * 2.25;
  const span = endA - startA;

  ctx.save();

  // Use cached gradients if provided, otherwise create new ones.
  const gradients = cachedGradients ?? {
    bezel: ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r),
    faceGrad: ctx.createRadialGradient(
      cx - r * 0.3,
      cy - r * 0.4,
      r * 0.1,
      cx,
      cy,
      r,
    ),
    hub: ctx.createLinearGradient(cx - 6, cy - 6, cx + 6, cy + 6),
  };

  if (!cachedGradients) {
    gradients.bezel.addColorStop(0, "#8d95a6");
    gradients.bezel.addColorStop(0.35, "#454c5a");
    gradients.bezel.addColorStop(0.62, "#7c8494");
    gradients.bezel.addColorStop(1, "#2b303a");

    gradients.faceGrad.addColorStop(0, "#252b38");
    gradients.faceGrad.addColorStop(0.7, faceColor);
    gradients.faceGrad.addColorStop(1, "#05070c");

    gradients.hub.addColorStop(0, "#e9edf5");
    gradients.hub.addColorStop(1, "#5b6272");
  }

  // Brushed metal bezel.
  ctx.fillStyle = gradients.bezel;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();

  // Recessed dial face.
  ctx.fillStyle = gradients.faceGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Sweep track.
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, startA, endA);
  ctx.stroke();

  // Value arc glows in the needle colour.
  const pct = Math.min(1, Math.max(0, value / max));
  if (pct > 0.001) {
    ctx.save();
    ctx.shadowColor = needleColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = needleColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startA, startA + pct * span);
    ctx.stroke();
    ctx.restore();
  }

  if (redlineStart !== null && redlineEnd !== null) {
    const rs = startA + (redlineStart / max) * span;
    const re = startA + (redlineEnd / max) * span;
    ctx.strokeStyle = "#e03030";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, rs, re);
    ctx.stroke();
  }

  const majorTicks = max <= 10 ? 9 : 8;
  for (let i = 0; i <= majorTicks * 2; i++) {
    const t = i / (majorTicks * 2);
    const ang = startA + t * span;
    const major = i % 2 === 0;
    const inner = r - (major ? 15 : 10);
    const outer = r - 11;
    ctx.strokeStyle = major ? tickColor : "rgba(230,235,245,0.45)";
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();

    if (major && (i / 2) % 2 === 0) {
      const step = i / 2;
      const display =
        tickMode === "speed"
          ? step * (max / majorTicks)
          : max <= 10
            ? step
            : step * (max / majorTicks / 1000);
      ctx.fillStyle = tickColor;
      ctx.font = "bold 9px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        String(Math.round(display)),
        cx + Math.cos(ang) * (r - 24),
        cy + Math.sin(ang) * (r - 24) + 3,
      );
    }
  }

  const needleA = startA + pct * span;
  const needleLen = r - 16;
  const tailLen = r * 0.16;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(needleA);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.moveTo(needleLen, 0);
  ctx.lineTo(0, -2.6);
  ctx.lineTo(-tailLen, 0);
  ctx.lineTo(0, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Chrome hub.
  ctx.fillStyle = gradients.hub;
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(230,235,245,0.7)";
  ctx.font = "bold 9px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + r * 0.5);
  ctx.fillStyle = tickColor;
  ctx.font = "bold 15px Nunito, sans-serif";
  ctx.fillText(unit, cx, cy + 9);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawRotatedWheelLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  carX: number,
  carY: number,
  carW: number,
  carH: number,
  pivot: { x: number; y: number },
  angle: number,
) {
  const axisX = carX + carW * pivot.x;
  const axisY = carY + carH * pivot.y;
  ctx.save();
  ctx.translate(axisX, axisY);
  ctx.rotate(angle);
  ctx.drawImage(img, -carW * pivot.x, -carH * pivot.y, carW, carH);
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Cached inactive pedal gradient (shared across all inactive pedals). */
    const inactivePedalGradCache = {
      grad: null as CanvasGradient | null,
      lastKey: "" as string,
    };

    /** Get or create cached inactive pedal gradient. */
    const getInactivePedalGrad = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number) => {
      const key = `${x}:${y}:${h}`;
      if (inactivePedalGradCache.lastKey === key && inactivePedalGradCache.grad) {
        return inactivePedalGradCache.grad;
      }
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, "#4a505c");
      grad.addColorStop(0.52, "#333844");
      grad.addColorStop(1, "#20242c");
      inactivePedalGradCache.grad = grad;
      inactivePedalGradCache.lastKey = key;
      return grad;
    };

    /** Get or create cached pedal sheen gradient. */
    const getPedalSheenGrad = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number) => {
      const key = `sheen:${x}:${y}:${h}`;
      if (inactivePedalGradCache.lastKey === key && inactivePedalGradCache.grad) {
        return inactivePedalGradCache.grad;
      }
      const grad = ctx.createLinearGradient(x, y, x, y + h * 0.45);
      grad.addColorStop(0, "rgba(255,255,255,0.26)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      inactivePedalGradCache.grad = grad;
      inactivePedalGradCache.lastKey = key;
      return grad;
    };

    /** Solid moulded control button; `accent` lights it up while held. */
    function drawPedal(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      active: boolean,
      accent: string,
    ) {
      const r = Math.min(10, w * 0.22);
      const press = active ? 1.5 : 0;

      ctx.save();
      // Recessed socket behind the button.
      roundRectPath(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fill();

      roundRectPath(ctx, x, y + press, w, h - press, r);
      if (active) {
        const body = ctx.createLinearGradient(x, y, x, y + h);
        body.addColorStop(0, accent);
        body.addColorStop(1, "rgba(20,22,28,0.95)");
        ctx.fillStyle = body;
      } else {
        ctx.fillStyle = getInactivePedalGrad(ctx, x, y, h);
      }
      ctx.fill();

      // Top sheen.
      ctx.save();
      ctx.clip();
      ctx.fillStyle = getPedalSheenGrad(ctx, x, y, h);
      ctx.fillRect(x, y, w, h * 0.45);
      ctx.restore();

      if (active) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
      }
      roundRectPath(ctx, x + 0.5, y + press + 0.5, w - 1, h - press - 1, r);
      ctx.strokeStyle = active ? accent : "rgba(220,228,240,0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

/** Stable sub-tile scroll offset (avoids float drift on long drives). */
function scrollFrac(scrollPx: number, parallax: number, period: number): {
  baseTile: number;
  frac: number;
} {
  const scroll = scrollPx * parallax;
  const baseTile = Math.floor(scroll / period);
  const frac = scroll - baseTile * period;
  return { baseTile, frac };
}

function drawHeadlightCone(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  farX: number,
  farY: number,
  spreadNear: number,
  spreadFar: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  const dx = farX - originX;
  const dy = farY - originY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const nearLx = originX + nx * spreadNear;
  const nearLy = originY + ny * spreadNear;
  const nearRx = originX - nx * spreadNear;
  const nearRy = originY - ny * spreadNear;
  const farLx = farX + nx * spreadFar;
  const farLy = farY + ny * spreadFar;
  const farRx = farX - nx * spreadFar;
  const farRy = farY - ny * spreadFar;

  const grad = ctx.createLinearGradient(originX, originY, farX, farY);
  grad.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
  grad.addColorStop(0.35, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.72})`);
  grad.addColorStop(0.7, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.28})`);
  grad.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(nearLx, nearLy);
  ctx.lineTo(farLx, farLy);
  ctx.lineTo(farRx, farRy);
  ctx.lineTo(nearRx, nearRy);
  ctx.closePath();
  ctx.fill();
}

/** Screen-fixed cones on the road: scroll with the car, not parallax scenery. */
function drawCarHeadlights(
  ctx: CanvasRenderingContext2D,
  width: number,
  roadY: number,
  roadH: number,
  carX: number,
  carY: number,
  carW: number,
  carH: number,
) {
  const t = HEADLIGHT_TUNING;
  const carFront = carX + carW;
  const farX = carFront + width * t.reach;
  const farY = roadY + roadH * t.roadAnchor;
  const spreadNear = roadH * t.spreadNear;
  const spreadFar = roadH * t.spreadFar;
  const lamps = [t.left, t.right];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, roadY, width, roadH);
  ctx.clip();
  ctx.globalCompositeOperation = "screen";

  for (const lamp of lamps) {
    const ox = carX + carW * lamp.x;
    const oy = carY + carH * lamp.y;

    drawHeadlightCone(
      ctx,
      ox,
      oy,
      farX,
      farY,
      spreadNear * 1.35,
      spreadFar * 1.22,
      t.color.r,
      t.color.g,
      t.color.b,
      t.alpha * t.outerAlpha,
    );
    drawHeadlightCone(
      ctx,
      ox,
      oy,
      farX,
      farY,
      spreadNear,
      spreadFar,
      t.color.r,
      t.color.g,
      t.color.b,
      t.alpha,
    );
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}


interface TopLightItem {
  x: number;
}

function roadLightPulse(time: number): number {
  const t = ROAD_LIGHT_TUNING;
  return t.pulseBase + Math.sin(time * t.pulseSpeed) * t.pulseAmount;
}

function forEachTopLight(
  width: number,
  scrollPx: number,
  fn: (screenX: number) => void,
) {
  const t = ROAD_LIGHT_TUNING;
  const { baseTile, frac } = scrollFrac(scrollPx, t.parallax, t.tileSpacing);
  const tilesOnScreen = Math.ceil(width / t.tileSpacing) + 2;

  for (let i = -1; i <= tilesOnScreen; i++) {
    const tileIndex = baseTile + i;
    for (const item of tileTopLights(tileIndex)) {
      const screenX = item.x + i * t.tileSpacing - frac;
      if (screenX < -t.cullMargin || screenX > width + t.cullMargin) continue;
      fn(screenX);
    }
  }
}

/** Overhead lights that scroll in from the top of the screen. */
function tileTopLights(tile: number): TopLightItem[] {
  const t = ROAD_LIGHT_TUNING;
  const v = Math.abs(tile * 5821 + 44101) % 100;
  if (v > Math.round(t.spawnChance * 100) - 1) return [];
  return [{ x: t.spawnXMin + (v * 47) % t.spawnXRange }];
}

function drawFeatheredTopLight(
  ctx: CanvasRenderingContext2D,
  apexX: number,
  apexY: number,
  floorY: number,
  spread: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  const depth = floorY - apexY;

  for (const layer of ROAD_LIGHT_TUNING.layers) {
    const radius = spread * layer.spreadMult;
    const centerY = apexY + depth * layer.yBias;
    const grad = ctx.createRadialGradient(apexX, apexY, 0, apexX, centerY, radius);
    grad.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha * layer.alphaMult})`);
    grad.addColorStop(0.18, `rgba(${red}, ${green}, ${blue}, ${alpha * layer.alphaMult * 0.72})`);
    grad.addColorStop(0.42, `rgba(${red}, ${green}, ${blue}, ${alpha * layer.alphaMult * 0.32})`);
    grad.addColorStop(0.72, `rgba(${red}, ${green}, ${blue}, ${alpha * layer.alphaMult * 0.1})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(apexX - radius, apexY - radius * 0.15, radius * 2, depth + radius);
  }
}

function collectCarGlintPasses(
  scrollPx: number,
  time: number,
  carX: number,
  carW: number,
  width: number,
): CarGlintPass[] {
  const pulse = roadLightPulse(time);
  const passes: CarGlintPass[] = [];
  const overshoot = CAR_GLINT_TUNING.sweepOvershoot;

  forEachTopLight(width, scrollPx, (screenX) => {
    const sweepPos = (screenX - carX) / carW;
    if (sweepPos < -overshoot || sweepPos > 1 + overshoot) return;

    let edgeFade = 1;
    if (sweepPos < 0) {
      edgeFade = 1 - -sweepPos / overshoot;
    } else if (sweepPos > 1) {
      edgeFade = 1 - (sweepPos - 1) / overshoot;
    }

    const strength = edgeFade * pulse * CAR_GLINT_TUNING.strength;
    if (strength > 0.04) {
      passes.push({ sweepPos, strength: Math.min(1, strength) });
    }
  });

  return passes;
}

let glintScratch: HTMLCanvasElement | null = null;
let glintScratchCtx: CanvasRenderingContext2D | null = null;

function getGlintScratch(w: number, h: number) {
  const iw = Math.max(1, Math.ceil(w));
  const ih = Math.max(1, Math.ceil(h));
  if (!glintScratch || glintScratch.width !== iw || glintScratch.height !== ih) {
    glintScratch = document.createElement("canvas");
    glintScratch.width = iw;
    glintScratch.height = ih;
    glintScratchCtx = glintScratch.getContext("2d");
  }
  return { canvas: glintScratch, ctx: glintScratchCtx };
}

function drawCarTopLightReflection(
  ctx: CanvasRenderingContext2D,
  carImg: HTMLImageElement,
  carX: number,
  carY: number,
  carW: number,
  carH: number,
  passes: CarGlintPass[],
) {
  if (passes.length === 0) return;

  const scratch = getGlintScratch(carW, carH);
  const sctx = scratch.ctx;
  if (!sctx) return;

  const { r, g, b } = ROAD_LIGHT_TUNING.color;
  const halfBand = carW * CAR_GLINT_TUNING.bandWidth * 0.5;
  const roofEnd = carH * CAR_GLINT_TUNING.roofBias;

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const pass of passes) {
    const bandCenter = pass.sweepPos * carW;
    const peak = pass.strength * CAR_GLINT_TUNING.specularPeak;

    sctx.clearRect(0, 0, carW, carH);
    sctx.globalCompositeOperation = "source-over";

    const bandGrad = sctx.createLinearGradient(bandCenter - halfBand, 0, bandCenter + halfBand, 0);
    bandGrad.addColorStop(0, "rgba(0,0,0,0)");
    bandGrad.addColorStop(0.32, `rgba(${r},${g},${b},${peak * 0.25})`);
    bandGrad.addColorStop(0.5, `rgba(255,255,255,${peak})`);
    bandGrad.addColorStop(0.68, `rgba(${r},${g},${b},${peak * 0.25})`);
    bandGrad.addColorStop(1, "rgba(0,0,0,0)");
    sctx.fillStyle = bandGrad;
    sctx.fillRect(bandCenter - halfBand, 0, halfBand * 2, carH);

    const roofGrad = sctx.createLinearGradient(0, 0, 0, carH);
    roofGrad.addColorStop(0, `rgba(255,255,255,${peak * 0.35})`);
    roofGrad.addColorStop(roofEnd / carH, `rgba(255,255,255,${peak * 0.08})`);
    roofGrad.addColorStop(1, "rgba(0,0,0,0)");
    sctx.globalCompositeOperation = "lighter";
    sctx.fillStyle = roofGrad;
    sctx.fillRect(bandCenter - halfBand, 0, halfBand * 2, carH);

    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(carImg, 0, 0, carW, carH);

    ctx.drawImage(scratch.canvas, carX, carY);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawNightScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  sceneH: number,
  roadY: number,
  roadH: number,
  scrollPx: number,
  time: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, sceneH);
  ctx.clip();

  ctx.fillStyle = "rgba(1, 2, 10, 0.558)";
  ctx.fillRect(0, 0, width, sceneH);

  ctx.fillStyle = "rgba(0, 0, 8, 0.38)";
  ctx.fillRect(0, roadY, width, sceneH - roadY);

  const t = ROAD_LIGHT_TUNING;
  const pulse = roadLightPulse(time);
  ctx.globalCompositeOperation = "screen";

  const apexY = sceneH * t.apexY;
  const floorY = roadY + roadH * t.roadFloor;
  const spread = sceneH * t.spread;

  forEachTopLight(width, scrollPx, (screenX) => {
    drawFeatheredTopLight(
      ctx,
      screenX,
      apexY,
      floorY,
      spread,
      t.color.r,
      t.color.g,
      t.color.b,
      t.alpha * pulse,
    );
  });

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

interface LensFlarePass {
  startTime: number;
  yOffset: number;
}

function drawLensFlare(
  ctx: CanvasRenderingContext2D,
  width: number,
  sceneH: number,
  progress: number,
  yOffset: number,
) {
  const t = LENS_FLARE_TUNING;
  const envelope = Math.sin(progress * Math.PI);
  if (envelope <= 0.001) return;

  const sunX = width * (t.enterX + (t.exitX - t.enterX) * progress);
  const sunY = sceneH * (t.y + yOffset);
  const { r, g, b } = t.color;
  const alpha = envelope;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, sceneH);
  ctx.clip();
  ctx.globalCompositeOperation = "screen";

  const streakW = width * t.streakLength * alpha;
  const streakH = Math.max(2, sceneH * t.streakHeight);
  const streakGrad = ctx.createLinearGradient(sunX - streakW * 0.5, sunY, sunX + streakW * 0.5, sunY);
  streakGrad.addColorStop(0, "rgba(0,0,0,0)");
  streakGrad.addColorStop(0.35, `rgba(${r},${g},${b},${t.streakAlpha * alpha * 0.45})`);
  streakGrad.addColorStop(0.5, `rgba(255,255,255,${t.streakAlpha * alpha})`);
  streakGrad.addColorStop(0.65, `rgba(${r},${g},${b},${t.streakAlpha * alpha * 0.45})`);
  streakGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = streakGrad;
  ctx.fillRect(sunX - streakW * 0.5, sunY - streakH * 0.5, streakW, streakH);

  const haloR = width * t.coreRadius * 2.4;
  const haloGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, haloR);
  haloGrad.addColorStop(0, `rgba(255,255,255,${t.haloAlpha * alpha})`);
  haloGrad.addColorStop(0.35, `rgba(${r},${g},${b},${t.haloAlpha * alpha * 0.55})`);
  haloGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haloGrad;
  ctx.fillRect(sunX - haloR, sunY - haloR, haloR * 2, haloR * 2);

  const coreR = width * t.coreRadius;
  const coreGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, coreR);
  coreGrad.addColorStop(0, `rgba(255,255,255,${t.coreAlpha * alpha})`);
  coreGrad.addColorStop(0.25, `rgba(${r},${g},${b},${t.coreAlpha * alpha * 0.85})`);
  coreGrad.addColorStop(0.65, `rgba(${r},${g},${b},${t.coreAlpha * alpha * 0.2})`);
  coreGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(sunX - coreR, sunY - coreR, coreR * 2, coreR * 2);

  for (const ghost of t.ghosts) {
    const gx = sunX + width * ghost.x;
    const gr = width * ghost.r;
    const ghostGrad = ctx.createRadialGradient(gx, sunY, 0, gx, sunY, gr);
    ghostGrad.addColorStop(0, `rgba(255,255,255,${ghost.a * alpha})`);
    ghostGrad.addColorStop(0.4, `rgba(${r},${g},${b},${ghost.a * alpha * 0.45})`);
    ghostGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ghostGrad;
    ctx.fillRect(gx - gr, sunY - gr, gr * 2, gr * 2);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawParallaxBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  sceneH: number,
  scrollPx: number,
  rate: number,
) {
  if (!img.complete || img.naturalWidth <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, sceneH);
  ctx.clip();

  const scale = (sceneH / img.naturalHeight) * BG_ZOOM;
  const tileW = img.naturalWidth * scale;
  const srcH = img.naturalHeight / BG_ZOOM;
  const srcY = Math.max(0, img.naturalHeight - srcH);
  const { frac } = scrollFrac(scrollPx, rate, tileW);
  const tilesOnScreen = Math.ceil(width / tileW) + 2;
  const destY = 0;
  const destH = sceneH * (1 + BG_EXTEND_DOWN);

  for (let i = -1; i <= tilesOnScreen; i++) {
    const x = i * tileW - frac;
    ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, x, destY, tileW, destH);
  }

  ctx.restore();
}

function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  roadTop: number,
  variant: number,
) {
  const h = TREE_BASE_HEIGHT + variant * TREE_VARIANT_STEP;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  const bury = h * 0.28;
  const y = roadTop - h + bury - 10 - TREE_Y_LIFT;
  ctx.drawImage(img, x, y, w, h);
}

function drawSakuraOverhead(
  ctx: CanvasRenderingContext2D,
  width: number,
  roadY: number,
  roadH: number,
  scrollPx: number,
  sakura1: HTMLImageElement,
  sakura2: HTMLImageElement,
) {
  if (!sakura1.complete || !sakura2.complete) return;

  const { baseTile, frac } = scrollFrac(scrollPx, SAKURA_PARALLAX, SAKURA_TILE);
  const hangH = roadY + roadH * 0.35;
  const tilesOnScreen = Math.ceil(width / SAKURA_TILE) + 2;

  for (let i = -1; i <= tilesOnScreen; i++) {
    const tileIndex = baseTile + i;
    const item = tileSakura(tileIndex);
    if (!item) continue;

    const img = item.variant === 0 ? sakura1 : sakura2;
    if (!img.naturalWidth) continue;

    const screenX = item.x + i * SAKURA_TILE - frac;
    const drawH = hangH;
    const drawW = (img.naturalWidth / img.naturalHeight) * drawH;
    if (screenX + drawW < -80 || screenX > width + 80) continue;

    ctx.drawImage(img, screenX, 0, drawW, drawH);
  }
}

function drawSceneryLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  roadTop: number,
  scrollPx: number,
  parallax: number,
  treeImg: HTMLImageElement,
) {
  if (!treeImg.complete || treeImg.naturalWidth <= 0) return;

  const { baseTile, frac } = scrollFrac(scrollPx, parallax, SCENERY_TILE);
  const tilesOnScreen = Math.ceil(width / SCENERY_TILE) + 2;

  const maxTreeH = TREE_BASE_HEIGHT + 2 * TREE_VARIANT_STEP;
  const maxTreeW = (treeImg.naturalWidth / treeImg.naturalHeight) * maxTreeH;
  const margin = Math.ceil(maxTreeW) + 32;

  for (let i = -1; i <= tilesOnScreen; i++) {
    const tileIndex = baseTile + i;
    const items = tileScenery(tileIndex);
    for (const item of items) {
      const screenX = item.x + i * SCENERY_TILE - frac;
      if (screenX + margin < 0 || screenX > width + margin) continue;
      drawTreeSprite(ctx, treeImg, screenX, roadTop, item.variant);
    }
  }
}

/** Pixel drag racer: hold gas, shift up at redline / down to drop a gear, scrolling road, dashboard gauges. */
export function OctaneGame({ width, height, config, onGameOver, paused = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gasRef = useRef(false);
  const palette = useGamePalette();
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);
  const configRef = useRef(config);
  const pausedRef = useRef(paused);

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;
  configRef.current = config;
  pausedRef.current = paused;

  useEffect(() => {
    const sessionConfig = configRef.current;
    const sessionIsDrag = sessionConfig.mode === "drag";
    const sessionRaceDistanceM = sessionConfig.raceDistanceM;
    const p = paletteRef.current.octane;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let canvasW = 0;
    let canvasH = 0;

    const resizeCanvas = (w: number, h: number) => {
      if (w === canvasW && h === canvasH) return;
      canvasW = w;
      canvasH = h;
      const dpr = canvasDpr();
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const getLayout = () => {
      const { width: w, height: h } = sizeRef.current;
      const sceneH = h * 0.58;
      const dashY = sceneH;
      const dashH = h - sceneH;
      const roadY = sceneH * 0.72;
      const roadH = sceneH - roadY;
      // Left: shift up/down stacked, lane ▲▼ stacked. Right: tall brake beside
      // a square gas pedal (same height, twice as wide). Sized from the dash
      // so they stay thumb-friendly without swallowing the gauges.
      const pad = 12;
      const gap = 8;
      const bottom = h - 14;
      const clusterH = Math.round(Math.min(dashH * 0.66, 108));
      const gasH = clusterH;
      const gasW = clusterH;
      const brakeH = clusterH;
      const brakeW = Math.round(clusterH * 0.5);
      const rowH = Math.round((clusterH - gap) / 2);
      const colW = Math.round(Math.min(70, clusterH * 0.64));
      const leftY = bottom - clusterH;
      const gasX = w - pad - gasW;
      const brakeX = gasX - gap - brakeW;
      return {
        width: w,
        height: h,
        sceneH,
        dashY,
        dashH,
        roadY,
        roadH,
        carX: w * 0.06,
        shiftUpBtn: { x: pad, y: leftY, w: colW, h: rowH },
        shiftDownBtn: { x: pad, y: leftY + rowH + gap, w: colW, h: rowH },
        laneUpBtn: { x: pad + colW + gap, y: leftY, w: colW, h: rowH },
        laneDownBtn: { x: pad + colW + gap, y: leftY + rowH + gap, w: colW, h: rowH },
        brakeBtn: { x: brakeX, y: leftY, w: brakeW, h: brakeH },
        gasBtn: { x: gasX, y: leftY, w: gasW, h: gasH },
      };
    };

    const syncLayout = () => {
      const layout = getLayout();
      resizeCanvas(layout.width, layout.height);
      if (carReady) sizeCar();
      return layout;
    };

    resizeCanvas(sizeRef.current.width, sizeRef.current.height);

    const carImg = new Image();
    const trafficImg = new Image();
    const frontWheelImg = new Image();
    const backWheelImg = new Image();
    const bgImg = new Image();
    const treeImg = new Image();
    const sakuraTop1 = new Image();
    const sakuraTop2 = new Image();

    carImg.src = "/OctanePixelCar2.png";
    trafficImg.src = "/OctanePixelCar.png";
    frontWheelImg.src = "/FrontWheel.png";
    backWheelImg.src = "/BackWheel.png";
    bgImg.src = Math.random() < 0.99 ? "/bg1.png" : "/bg2.png"; // bg2 is not as good, find replacement then move then back to 0.5
    treeImg.src = "/tree.png";
    sakuraTop1.src = "/sakuratop1.png";
    sakuraTop2.src = "/sakuratop2.png";

    let carReady = false;
    let trafficReady = false;
    let wheelsReady = false;
    let carDrawW = 100;
    let carDrawH = 36;
    let carY = 0;
    let playerLane = 1;
    let laneFrom = 1;
    let laneTo = 1;
    let laneAnimT = 1;
    let oilLockMs = 0;
    let hitCooldownMs = 0;
    let hitFlash = 0;
    let obstacles: RoadObstacle[] = [];
    let nextObstacleId = 1;
    let nextSpawnM = 80;
    const warnedObstacles = new Set<number>();
    let lastWarnSoundAt = 0;
    const occupiedLanesNear = (distM: number, windowM = 55): Set<number> => {
      const used = new Set<number>();
      for (const o of obstacles) {
        if (Math.abs(o.distanceM - distM) < windowM) used.add(o.lane);
      }
      return used;
    };
    const laneBaseline = (lane: number) =>
      LANE_BASELINES[Math.max(0, Math.min(LANE_COUNT - 1, lane))] ?? 0.52;
    const laneScale = (lane: number) =>
      LANE_SCALE[Math.max(0, Math.min(LANE_COUNT - 1, lane))] ?? 1;
    const currentLaneFrac = () => {
      if (laneAnimT >= 1) return laneBaseline(playerLane);
      const t = laneAnimT * laneAnimT * (3 - 2 * laneAnimT);
      return laneBaseline(laneFrom) + (laneBaseline(laneTo) - laneBaseline(laneFrom)) * t;
    };
    const currentLaneScale = () => {
      if (laneAnimT >= 1) return laneScale(playerLane);
      const t = laneAnimT * laneAnimT * (3 - 2 * laneAnimT);
      return laneScale(laneFrom) + (laneScale(laneTo) - laneScale(laneFrom)) * t;
    };
    const trySwitchLane = (dir: -1 | 1) => {
      if (laneAnimT < 1 || oilLockMs > 0 || finished || !alive) return;
      const next = Math.max(0, Math.min(LANE_COUNT - 1, playerLane + dir));
      if (next === playerLane) return;
      laneFrom = playerLane;
      laneTo = next;
      playerLane = next;
      laneAnimT = 0;
    };
    const sizeCar = () => {
      const { roadY, roadH } = getLayout();
      const scale = currentLaneScale();
      carDrawH = roadH * CAR_HEIGHT_RATIO * scale;
      carDrawW = (carImg.naturalWidth / carImg.naturalHeight) * carDrawH;
      carY =
        roadY + roadH * currentLaneFrac() - carDrawH * (1 - CAR_BASE_INSET);
    };
    const tryReady = () => {
      if (carImg.complete && carImg.naturalWidth > 0) sizeCar();
      carReady = carImg.complete && carImg.naturalWidth > 0;
      trafficReady = trafficImg.complete && trafficImg.naturalWidth > 0;
      wheelsReady =
        frontWheelImg.complete &&
        frontWheelImg.naturalWidth > 0 &&
        backWheelImg.complete &&
        backWheelImg.naturalWidth > 0;
    };
    carImg.onload = tryReady;
    trafficImg.onload = tryReady;
    frontWheelImg.onload = tryReady;
    backWheelImg.onload = tryReady;
    tryReady();

    const isNight = Math.random() < NIGHT_RUN_CHANCE;

    const hit = (x: number, y: number, b: { x: number; y: number; w: number; h: number }) =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    let rpm = 0;
    let gear = 1;
    let mph = 0;
    let distance = 0;
    let scrollPx = 0;
    let wheelAngle = 0;
    let alive = true;
    let finished = false;
    let shiftFlash = 0;
    let shiftQuality = 0;
    let lastShiftKind: "up" | "down" = "up";
    let boostLunge = 0;
    let boostLungeMph = 0;
    let boostLungeKind: BoostLungeKind = "shift";
    let boostLungeDuration: number = BOOST_LUNGE_TUNING.duration;
    let gasWasDown = false;
    let brakeWasDown = false;

    const triggerBoostLunge = (speedMph: number, kind: BoostLungeKind = "shift") => {
      boostLungeKind = kind;
      boostLungeDuration =
        kind === "gas" ? BOOST_LUNGE_TUNING.launchDuration : BOOST_LUNGE_TUNING.duration;
      boostLunge = boostLungeDuration;
      boostLungeMph = speedMph;
    };

    let brakeStoppieEngage = 0;
    let brakeStoppieHold = false;
    let brakeStoppieRelease = 0;
    let brakeStoppieMph = 0;
    let burnoutTime = 0;
    let burnoutPermanentlyDisabled = false;
    let time = 0;
    let topMph = 0;
    const raceStartTime = performance.now();
    let shiftUpDown = false;
    let shiftDownDown = false;
    let brakeDown = false;
    let gasDown = false;

    let flareCooldown =
      LENS_FLARE_TUNING.minInterval +
      Math.random() * (LENS_FLARE_TUNING.maxInterval - LENS_FLARE_TUNING.minInterval);
    let activeFlare: LensFlarePass | null = null;

    const rpmRiseRate = (g: number) => 175 / Math.pow(g, 1.85);

    const shiftUp = () => {
      if (!alive || finished || gear >= GEARS) return;
      unlockGameAudio();
      preloadOctaneAudio();
      if (rpm < SHIFT_PERFECT_MIN * 0.5) {
        lastShiftKind = "up";
        shiftQuality = -1;
        shiftFlash = 22;
        playOctaneBadShift();
        rpm = Math.max(0, rpm - 1200);
        mph = Math.max(0, mph - 4);
        return;
      }
      lastShiftKind = "up";
      const perfect = rpm >= SHIFT_PERFECT_MIN && rpm <= SHIFT_PERFECT_MAX;
      shiftQuality = perfect ? 1 : rpm > SHIFT_PERFECT_MAX ? -1 : 0;
      shiftFlash = perfect ? 40 : 18;
      gear++;
      playOctaneRevShift(gear);
      hapticLight();
      if (perfect) playOctaneNitroPerfect();
      else if (rpm > SHIFT_PERFECT_MAX) playOctaneBadShift();
      rpm = perfect ? 3800 + gear * 100 : rpm > SHIFT_PERFECT_MAX ? 5200 : 4500;
      mph += perfect ? 14 : rpm > SHIFT_PERFECT_MAX ? 4 : 8;
      if (shiftQuality === 1) triggerBoostLunge(mph);
    };

    const shiftDown = () => {
      if (!alive || finished || gear <= 1) return;
      unlockGameAudio();
      preloadOctaneAudio();
      lastShiftKind = "down";
      gear--;
      shiftQuality = 0;
      shiftFlash = 16;
      playOctaneRevShift(gear);
      hapticLight();
      rpm = Math.min(RPM_MAX, rpm + 1800);
      const cap = GEAR_SPEED_CAP[gear - 1] ?? MPH_MAX;
      mph = Math.min(mph, cap);
    };

    const warmSamples = () =>
      preloadSamples(SAMPLE_SRC.octaneWarning, SAMPLE_SRC.octaneHit);

    /**
     * Each touch owns one control until it lifts, so a finger holding the gas
     * doesn't block (or get cancelled by) a second finger on the brake.
     */
    type HeldControl = "shiftUp" | "shiftDown" | "brake" | "gas";
    const pointerControl = new Map<number, HeldControl>();

    const releaseControl = (control: HeldControl) => {
      if (control === "shiftUp") shiftUpDown = false;
      else if (control === "shiftDown") shiftDownDown = false;
      else if (control === "brake") brakeDown = false;
      else {
        gasDown = false;
        gasRef.current = false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      unlockGameAudio();
      preloadOctaneAudio();
      warmSamples();
      const { shiftUpBtn, shiftDownBtn, brakeBtn, gasBtn, laneUpBtn, laneDownBtn } =
        getLayout();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Keep receiving this pointer's events even if the finger slides off.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      if (hit(x, y, shiftUpBtn)) {
        shiftUpDown = true;
        pointerControl.set(e.pointerId, "shiftUp");
        shiftUp();
      } else if (hit(x, y, shiftDownBtn)) {
        shiftDownDown = true;
        pointerControl.set(e.pointerId, "shiftDown");
        shiftDown();
      } else if (hit(x, y, brakeBtn)) {
        brakeDown = true;
        pointerControl.set(e.pointerId, "brake");
      } else if (hit(x, y, gasBtn)) {
        gasDown = true;
        gasRef.current = true;
        pointerControl.set(e.pointerId, "gas");
      } else if (hit(x, y, laneUpBtn)) {
        trySwitchLane(-1);
      } else if (hit(x, y, laneDownBtn)) {
        trySwitchLane(1);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const control = pointerControl.get(e.pointerId);
      if (control === undefined) return;
      pointerControl.delete(e.pointerId);
      releaseControl(control);
    };
    const onLeave = (e: PointerEvent) => {
      // Touch pointers keep their control until they lift; only a mouse
      // leaving the canvas should drop everything.
      if (e.pointerType !== "mouse") return;
      pointerControl.clear();
      shiftUpDown = false;
      shiftDownDown = false;
      brakeDown = false;
      gasDown = false;
      gasRef.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        unlockGameAudio();
        preloadOctaneAudio();
        warmSamples();
        gasRef.current = true;
      }
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        trySwitchLane(-1);
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        trySwitchLane(1);
      }
      if (e.code === "ShiftLeft" || e.code === "KeyE") {
        e.preventDefault();
        shiftUp();
      }
      if (e.code === "ShiftRight" || e.code === "KeyQ" || e.code === "ControlLeft") {
        e.preventDefault();
        shiftDown();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") gasRef.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let last = performance.now();
    const engineSound = createOctaneEngineSound();
    const brakeSound = createOctaneBrakeSound();

    /** Cached gradients to avoid per-frame allocations. */
    const gradientCache = {
      dashGrad: null as CanvasGradient | null,
      rpmBezel: null as CanvasGradient | null,
      rpmFace: null as CanvasGradient | null,
      rpmHub: null as CanvasGradient | null,
      lastDashKey: "" as string,
      lastGaugeKey: "" as string,
    };

    /** Get or create cached dashboard gradient. */
    const getDashGrad = (
      ctx: CanvasRenderingContext2D,
      dashY: number,
      dashH: number,
      isDark: boolean,
    ) => {
      const key = `${dashY}:${dashH}:${isDark}`;
      if (gradientCache.lastDashKey === key && gradientCache.dashGrad) {
        return gradientCache.dashGrad;
      }
      const grad = ctx.createLinearGradient(0, dashY, 0, dashY + dashH);
      grad.addColorStop(0, isDark ? "#151922" : "#252a33");
      grad.addColorStop(0.25, isDark ? "#0c0f16" : "#181c23");
      grad.addColorStop(1, "#05070c");
      gradientCache.dashGrad = grad;
      gradientCache.lastDashKey = key;
      return grad;
    };

    /** Get or create cached gauge gradients. */
    const getGaugeGradients = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      r: number,
      faceColor: string,
    ) => {
      const key = `${cx}:${cy}:${r}:${faceColor}`;
      if (gradientCache.lastGaugeKey === key && gradientCache.rpmBezel) {
        return {
          bezel: gradientCache.rpmBezel!,
          faceGrad: gradientCache.rpmFace!,
          hub: gradientCache.rpmHub!,
        };
      }
      const bezel = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      bezel.addColorStop(0, "#8d95a6");
      bezel.addColorStop(0.35, "#454c5a");
      bezel.addColorStop(0.62, "#7c8494");
      bezel.addColorStop(1, "#2b303a");

      const faceGrad = ctx.createRadialGradient(
        cx - r * 0.3,
        cy - r * 0.4,
        r * 0.1,
        cx,
        cy,
        r,
      );
      faceGrad.addColorStop(0, "#252b38");
      faceGrad.addColorStop(0.7, faceColor);
      faceGrad.addColorStop(1, "#05070c");

      const hub = ctx.createLinearGradient(cx - 6, cy - 6, cx + 6, cy + 6);
      hub.addColorStop(0, "#e9edf5");
      hub.addColorStop(1, "#5b6272");

      gradientCache.rpmBezel = bezel;
      gradientCache.rpmFace = faceGrad;
      gradientCache.rpmHub = hub;
      gradientCache.lastGaugeKey = key;
      return { bezel, faceGrad, hub };
    };

    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      time += dt;

      const {
        width,
        height,
        sceneH,
        dashY,
        dashH,
        roadY,
        roadH,
        carX,
        shiftUpBtn,
        shiftDownBtn,
        brakeBtn,
        gasBtn,
        laneUpBtn,
        laneDownBtn,
      } = syncLayout();
      const palette = paletteRef.current;

      if (!finished && !pausedRef.current) {
        if (mph > BOOST_LUNGE_TUNING.burnoutDisableMph) {
          burnoutPermanentlyDisabled = true;
        }

        if (
          gasRef.current &&
          !gasWasDown &&
          mph < 8
        ) {
          hapticLaunch();
        }
        if (
          gasRef.current &&
          !gasWasDown &&
          mph >= BOOST_LUNGE_TUNING.launchMinMph &&
          !burnoutAllowed(mph, burnoutPermanentlyDisabled)
        ) {
          triggerBoostLunge(mph, "gas");
        }
        if (brakeDown && !brakeWasDown && mph >= BOOST_LUNGE_TUNING.brakeMinMph) {
          brakeStoppieMph = mph;
          brakeStoppieEngage = BOOST_LUNGE_TUNING.brakeEngageDuration;
          brakeStoppieHold = false;
          brakeStoppieRelease = 0;
        }
        if (brakeDown && !brakeWasDown) {
          playOctaneBrakeChirp(mph);
        }
        gasWasDown = gasRef.current;
        brakeWasDown = brakeDown;

        if (gasRef.current) {
          rpm += rpmRiseRate(gear) * dt;
          const revFactor = rpm / REDLINE_END;
          const cap = GEAR_SPEED_CAP[gear - 1] ?? MPH_MAX;
          const accelMult = gearAccelMultiplier(mph, gear);
          mph += GEAR_ACCEL[gear - 1] * revFactor * accelMult * dt;
          mph = Math.min(mph, cap);
        } else {
          rpm -= 110 * dt;
          mph = Math.max(0, mph - 0.06 * dt);
        }
        if (brakeDown) {
          rpm -= 140 * dt;
          mph = Math.max(0, mph - 0.35 * dt);
        }

        if (brakeStoppieEngage > 0) {
          if (!brakeDown || mph < BOOST_LUNGE_TUNING.brakeMinMph) {
            brakeStoppieEngage = 0;
          } else {
            brakeStoppieEngage = Math.max(0, brakeStoppieEngage - dt);
            if (brakeStoppieEngage <= 0) brakeStoppieHold = true;
          }
        }

        if (brakeStoppieHold) {
          if (!brakeDown || mph < BOOST_LUNGE_TUNING.brakeMinMph) {
            brakeStoppieHold = false;
            brakeStoppieRelease = BOOST_LUNGE_TUNING.brakeReleaseDuration;
          }
        }

        if (brakeStoppieRelease > 0) {
          brakeStoppieRelease = Math.max(0, brakeStoppieRelease - dt);
        }

        if (rpm > REDLINE_END) rpm = REDLINE_END;
        rpm = Math.max(0, Math.min(RPM_MAX, rpm));
        mph = Math.max(0, Math.min(MPH_MAX, mph));
        topMph = Math.max(topMph, mph);

        distance += mph * 0.00745 * dt;
        scrollPx += mph * 0.22 * dt;

        if (laneAnimT < 1) {
          laneAnimT = Math.min(1, laneAnimT + (dt * 16.67) / LANE_SWITCH_MS);
          sizeCar();
        }
        if (oilLockMs > 0) oilLockMs = Math.max(0, oilLockMs - dt * 16.67);
        if (hitCooldownMs > 0) hitCooldownMs = Math.max(0, hitCooldownMs - dt * 16.67);
        if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt);

        // Spawn road obstacles ahead of the player.
        while (nextSpawnM < distance + 900) {
          const used = occupiedLanesNear(nextSpawnM);
          const free: number[] = [];
          for (let l = 0; l < LANE_COUNT; l++) {
            if (!used.has(l)) free.push(l);
          }
          if (free.length === 0) {
            nextSpawnM += 40 + Math.random() * 30;
            continue;
          }
          // Keep at least one lane empty in this window when possible.
          const spawnLane =
            free.length === LANE_COUNT
              ? free[Math.floor(Math.random() * free.length)]!
              : free[Math.floor(Math.random() * free.length)]!;
          const roll = Math.random();
          const kind: ObstacleKind =
            roll < 0.38 ? "cone" : roll < 0.68 ? "oil" : "car";
          const trafficMph =
            kind === "car"
              ? Math.max(25, (GEAR_SPEED_CAP[gear - 1] ?? 80) * (0.45 + Math.random() * 0.25))
              : 0;
          obstacles.push({
            id: nextObstacleId++,
            distanceM: nextSpawnM,
            lane: spawnLane,
            kind,
            mph: trafficMph,
            hit: false,
          });
          const gap = Math.max(55, 140 - mph * 0.25) + Math.random() * 40;
          nextSpawnM += gap;
        }

        for (const o of obstacles) {
          if (o.kind === "car") {
            o.distanceM += o.mph * 0.00745 * dt;
          }
        }
        obstacles = obstacles.filter((o) => o.distanceM > distance - 40);

        // Collision: same lane, overlapping car length.
        if (hitCooldownMs <= 0) {
          const carLenM = Math.max(4, carDrawW / PX_PER_M);
          for (const o of obstacles) {
            if (o.hit || o.lane !== playerLane) continue;
            const dx = o.distanceM - distance;
            if (dx < -2 || dx > carLenM + 6) continue;
            o.hit = true;
            const pen = OBSTACLE_PENALTY[o.kind];
            const penalty = pen.base + mph * pen.factor;
            mph = Math.max(0, mph - penalty);
            rpm = Math.max(0, rpm - 900);
            hitCooldownMs = 600;
            hitFlash = 18;
            if (o.kind === "oil") oilLockMs = 400;
            playOctaneHit();
            hapticThrottled("octane-obstacle", 1600, 28);
            break;
          }
        }

        // Klaxon the first time a hazard enters warning range.
        const nowMs = performance.now();
        for (const o of obstacles) {
          if (warnedObstacles.has(o.id)) continue;
          const sx = carX + (o.distanceM - distance) * PX_PER_M;
          if (sx <= width + 20 || sx > width + WARN_LEAD_PX) continue;
          warnedObstacles.add(o.id);
          if (nowMs - lastWarnSoundAt > 900) {
            lastWarnSoundAt = nowMs;
            playOctaneWarning();
          }
        }
        if (warnedObstacles.size > 64) {
          const live = new Set(obstacles.map((o) => o.id));
          for (const id of warnedObstacles) {
            if (!live.has(id)) warnedObstacles.delete(id);
          }
        }

        const burnoutActive =
          gasRef.current && burnoutAllowed(mph, burnoutPermanentlyDisabled);
        if (burnoutActive) {
          burnoutTime += dt;
          wheelAngle += BOOST_LUNGE_TUNING.burnoutWheelSpin * dt;
        } else {
          burnoutTime = 0;
          wheelAngle += (mph / WHEEL_SPIN_RATE) * dt;
        }

        if (sessionIsDrag && distance >= sessionRaceDistanceM) {
          finished = true;
          const elapsedMs = performance.now() - raceStartTime;
          const score = scoreOctaneDrag(sessionRaceDistanceM, elapsedMs, topMph);
          setTimeout(
            () =>
              onGameOverRef.current({
                score,
                title: "Finish!",
                leaderboardKey: `octane:${sessionRaceDistanceM}`,
                stats: [
                  { label: "Distance", value: sessionConfig.raceLabel },
                  { label: "Top speed", value: `${Math.round(topMph)} mph` },
                  { label: "Time", value: formatRaceTime(elapsedMs) },
                ],
              }),
            800,
          );
        }
      }

      if (!pausedRef.current) {
        if (shiftFlash > 0) shiftFlash -= dt;
        if (boostLunge > 0) boostLunge = Math.max(0, boostLunge - dt);

        engineSound?.update(rpm, gasRef.current, gear);
        brakeSound?.update(brakeDown, mph);
      } else {
        engineSound?.update(rpm, false, gear);
        brakeSound?.update(false, mph);
      }

      drawParallaxBackground(ctx, bgImg, width, sceneH, scrollPx, BG_PARALLAX);

      drawSceneryLayer(ctx, width, roadY, scrollPx, TREE_PARALLAX, treeImg);

      ctx.fillStyle = p.road;
      ctx.fillRect(0, roadY, width, roadH);

      // Lane dividers, scaled and parallaxed per lane like the cars they separate.
      ctx.lineCap = "butt";
      for (let i = 1; i < LANE_COUNT; i++) {
        const a = LANE_BASELINES[i - 1]!;
        const b = LANE_BASELINES[i]!;
        const laneS = (LANE_SCALE[i - 1]! + LANE_SCALE[i]!) / 2;
        const markY = roadY + roadH * ((a + b) / 2);
        const dashLen = ROAD_MARKINGS.dashLength * laneS;
        const spacing = dashLen + ROAD_MARKINGS.dashGap * laneS;
        const offset =
          ((scrollPx * ROAD_MARKINGS.scrollRate * laneS) % spacing + spacing) %
          spacing;
        ctx.strokeStyle = `rgba(255,255,255,${0.62 + (laneS - 1) * 2.4})`;
        ctx.lineWidth = ROAD_MARKINGS.lineWidth * laneS;
        // Batch all dashes into a single path per lane for performance.
        ctx.beginPath();
        for (let lx = -offset; lx < width + dashLen; lx += spacing) {
          ctx.moveTo(lx, markY);
          ctx.lineTo(lx + dashLen, markY);
        }
        ctx.stroke();
      }

      /**
       * Lanes are depth-sorted: everything in a lane nearer than the player is
       * drawn after the car, so it passes in front of it.
       */
      const drawObstacle = (o: RoadObstacle) => {
        const screenX = carX + (o.distanceM - distance) * PX_PER_M;
        if (screenX < -120 || screenX > width + 120) return;
        const scale = laneScale(o.lane);
        const bas = laneBaseline(o.lane);
        const oh = roadH * CAR_HEIGHT_RATIO * scale * (o.kind === "car" ? 0.92 : 0.55);
        const oy = roadY + roadH * bas - oh;
        if (o.kind === "cone") {
          const ow = oh * 0.7;
          ctx.fillStyle = o.hit ? "rgba(255,120,40,0.45)" : "#ff7a2e";
          ctx.beginPath();
          ctx.moveTo(screenX, oy + oh);
          ctx.lineTo(screenX + ow / 2, oy);
          ctx.lineTo(screenX + ow, oy + oh);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillRect(screenX + ow * 0.2, oy + oh * 0.45, ow * 0.6, oh * 0.12);
        } else if (o.kind === "oil") {
          const ow = oh * 1.6;
          ctx.fillStyle = o.hit ? "rgba(20,20,30,0.35)" : "rgba(18,18,28,0.82)";
          ctx.beginPath();
          ctx.ellipse(screenX + ow / 2, oy + oh * 0.75, ow / 2, oh * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(120,180,255,0.25)";
          ctx.beginPath();
          ctx.ellipse(screenX + ow * 0.4, oy + oh * 0.68, ow * 0.18, oh * 0.1, -0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (trafficReady) {
          const ow = (trafficImg.naturalWidth / trafficImg.naturalHeight) * oh;
          ctx.globalAlpha = o.hit ? 0.45 : 1;
          ctx.drawImage(trafficImg, screenX, oy, ow, oh);
          ctx.globalAlpha = 1;
        } else {
          const ow = oh * 1.8;
          ctx.fillStyle = o.hit ? "rgba(80,80,100,0.4)" : "#4a5568";
          ctx.fillRect(screenX, oy, ow, oh);
        }
      };

      const depthSorted = [...obstacles].sort((a, b) => a.lane - b.lane);
      for (const o of depthSorted) {
        if (o.lane <= playerLane) drawObstacle(o);
      }

      // Warning sign per lane for the nearest hazard still off the right edge.
      const warnByLane = new Map<number, RoadObstacle>();
      for (const o of obstacles) {
        const sx = carX + (o.distanceM - distance) * PX_PER_M;
        if (sx <= width + 20 || sx > width + WARN_LEAD_PX) continue;
        const prev = warnByLane.get(o.lane);
        if (!prev || o.distanceM < prev.distanceM) warnByLane.set(o.lane, o);
      }
      for (const [lane, o] of [...warnByLane].sort((a, b) => a[0] - b[0])) {
        const sx = carX + (o.distanceM - distance) * PX_PER_M;
        const closeness = Math.min(1, Math.max(0, 1 - (sx - width) / WARN_LEAD_PX));
        const laneS = laneScale(lane);
        const size = roadH * 0.34 * laneS;
        const cx = width - size * 0.85;
        const cy = roadY + roadH * laneBaseline(lane) - size * 0.7;
        const blink = 0.6 + 0.4 * Math.sin(time * (0.18 + closeness * 0.5));

        ctx.save();
        ctx.globalAlpha = (0.3 + closeness * 0.7) * blink;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size / 2);
        ctx.lineTo(cx + size / 2, cy + size / 2);
        ctx.lineTo(cx - size / 2, cy + size / 2);
        ctx.closePath();
        ctx.fillStyle = o.kind === "oil" ? "#ff4d4d" : "#ffcc33";
        ctx.fill();
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, size * 0.09);
        ctx.strokeStyle = "rgba(30,22,4,0.9)";
        ctx.stroke();
        ctx.fillStyle = "rgba(30,22,4,0.95)";
        ctx.font = `bold ${Math.max(9, Math.round(size * 0.46))}px Nunito, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", cx, cy + size * 0.16);
        ctx.restore();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      drawSakuraOverhead(ctx, width, roadY, roadH, scrollPx, sakuraTop1, sakuraTop2);

      const burnoutActive =
        !finished &&
        gasRef.current &&
        burnoutAllowed(mph, burnoutPermanentlyDisabled);

      const boost = computeCarPoseEffect({
        boostLunge,
        boostKind: boostLungeKind,
        boostMph: boostLungeMph,
        boostDuration: boostLungeDuration,
        brakeEngage: brakeStoppieEngage,
        brakeHold: brakeStoppieHold,
        brakeRelease: brakeStoppieRelease,
        brakeMph: brakeStoppieMph,
        burnoutActive,
        burnoutElapsed: burnoutTime,
        animTime: time,
      });
      const carDrawX = carX + boost.x;
      const carDrawY = carY + boost.y;

      // Ground shadow tracks the car's lane (and its horizontal lunge), not the pitch.
      const shadowY = carY + carDrawH * (1 - CAR_BASE_INSET * 0.5) - 15;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(
        carDrawX + carDrawW * 0.45 + 5,
        shadowY,
        carDrawW * 0.4 + 20,
        Math.max(5, carDrawH * 0.13),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      withCarPitch(ctx, carDrawX, carDrawY, carDrawW, carDrawH, boost.pitch, boost.pivot, () => {
        if (carReady) {
          ctx.drawImage(carImg, carDrawX, carDrawY, carDrawW, carDrawH);
        }

        if (wheelsReady) {
          drawRotatedWheelLayer(ctx, backWheelImg, carDrawX, carDrawY, carDrawW, carDrawH, WHEEL_TUNING.rear, wheelAngle);
          drawRotatedWheelLayer(ctx, frontWheelImg, carDrawX, carDrawY, carDrawW, carDrawH, WHEEL_TUNING.front, wheelAngle);
        }

        if ((gasRef.current && !finished) || burnoutActive) {
          ctx.fillStyle = burnoutActive ? "rgba(120,120,120,0.75)" : "rgba(255,180,80,0.7)";
          const streakCount = burnoutActive ? 6 : 4;
          for (let i = 0; i < streakCount; i++) {
            const yOff = burnoutActive
              ? carDrawH * 0.58 + (i % 2) * 3
              : carDrawH * 0.55 + i;
            ctx.fillRect(carDrawX - 12 - i * 8 - (scrollPx % 4), carDrawY + yOff, 6, 4);
          }
        }

        if (isNight) {
          const glintPasses = collectCarGlintPasses(scrollPx, time, carDrawX, carDrawW, width);
          if (carReady) {
            drawCarTopLightReflection(ctx, carImg, carDrawX, carDrawY, carDrawW, carDrawH, glintPasses);
          }
          drawCarHeadlights(ctx, width, roadY, roadH, carDrawX, carDrawY, carDrawW, carDrawH);
        }
      });

      for (const o of depthSorted) {
        if (o.lane > playerLane) drawObstacle(o);
      }

      if (isNight) {
        drawNightScene(ctx, width, sceneH, roadY, roadH, scrollPx, time);
      } else {
        if (activeFlare) {
          const elapsed = time - activeFlare.startTime;
          const progress = elapsed / LENS_FLARE_TUNING.duration;
          if (progress >= 1) {
            activeFlare = null;
            flareCooldown =
              LENS_FLARE_TUNING.minInterval +
              Math.random() * (LENS_FLARE_TUNING.maxInterval - LENS_FLARE_TUNING.minInterval);
          } else {
            drawLensFlare(ctx, width, sceneH, progress, activeFlare.yOffset);
          }
        } else {
          flareCooldown -= dt;
          if (flareCooldown <= 0) {
            flareCooldown =
              LENS_FLARE_TUNING.minInterval +
              Math.random() * (LENS_FLARE_TUNING.maxInterval - LENS_FLARE_TUNING.minInterval);
            if (mph >= LENS_FLARE_TUNING.minMph && Math.random() < LENS_FLARE_TUNING.triggerChance) {
              activeFlare = {
                startTime: time,
                yOffset: (Math.random() * 2 - 1) * LENS_FLARE_TUNING.yJitter,
              };
            }
          }
        }
      }

      ctx.fillStyle = getDashGrad(ctx, dashY, dashH, palette.isDark);
      ctx.fillRect(0, dashY, width, dashH);
      // Chrome lip along the top of the dash.
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(0, dashY, width, 2);
      ctx.strokeStyle = p.hudBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, dashY);
      ctx.lineTo(width, dashY);
      ctx.stroke();

      const gaugeR = Math.min(dashH * 0.38, width * 0.17);
      const rpmCx = width * 0.28;
      const mphCx = width * 0.72;
      const gaugeCy = dashY + dashH * 0.42;
      // The dash is always dark, so gauge colours don't follow the app theme.
      const face = "#12151d";
      const tick = "#e6ebf5";

      const rpmGradients = getGaugeGradients(ctx, rpmCx, gaugeCy, gaugeR, face);
      const mphGradients = getGaugeGradients(ctx, mphCx, gaugeCy, gaugeR, face);

      drawGauge(
        ctx,
        rpmCx,
        gaugeCy,
        gaugeR,
        rpm / 1000,
        9,
        "RPM",
        `${Math.round(rpm)}`,
        REDLINE_START / 1000,
        REDLINE_END / 1000,
        face,
        tick,
        rpm >= REDLINE_START ? "#ff4444" : "#ffaa44",
        "rpm",
        rpmGradients,
      );

      const mphDisplay = Math.round(mph);
      drawGauge(
        ctx,
        mphCx,
        gaugeCy,
        gaugeR,
        mphDisplay,
        MPH_MAX,
        "MPH",
        `${mphDisplay}`,
        null,
        null,
        face,
        tick,
        "#44aaff",
        "speed",
        mphGradients,
      );

      const gearX = width * 0.5;
      const gearTop = dashY + dashH * 0.18;
      ctx.fillStyle = "rgba(230,235,245,0.7)";
      ctx.font = "bold 10px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GEAR", gearX, gearTop);
      const bars = ["#4aa3ff", "#5cd0a8", "#ffb43d", "#ff7a59", "#ff5a5a", "#c084fc"];
      // Draw unlit bars first (no shadow).
      for (let i = 0; i < GEARS; i++) {
        const bx = gearX - 28 + i * 10;
        const lit = i < gear;
        if (!lit) {
          ctx.fillStyle = "rgba(140,150,170,0.22)";
          roundRectPath(ctx, bx, gearTop + 8, 8, 22, 3);
          ctx.fill();
        }
      }
      // Draw lit bars with a single shadow pass.
      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      for (let i = 0; i < GEARS; i++) {
        const bx = gearX - 28 + i * 10;
        const lit = i < gear;
        if (lit) {
          ctx.fillStyle = bars[i % bars.length];
          roundRectPath(ctx, bx, gearTop + 8, 8, 22, 3);
          ctx.fill();
        }
      }
      ctx.restore();
      // Draw gear number with glow.
      ctx.save();
      ctx.font = "bold 30px Nunito, sans-serif";
      ctx.fillStyle = gear === 0 ? tick : bars[(gear - 1) % bars.length];
      ctx.shadowColor = gear === 0 ? "transparent" : bars[(gear - 1) % bars.length];
      ctx.shadowBlur = 14;
      ctx.textAlign = "center";
      ctx.fillText(gear >= 1 ? String(gear) : "N", gearX, gearTop + 60);
      ctx.restore();
      ctx.font = "bold 10px Nunito, sans-serif";
      ctx.fillStyle = "rgba(190,198,214,0.7)";
      ctx.fillText("R", gearX - 20, gearTop + 60);
      ctx.textAlign = "left";

      // Trip readouts on small chips so they stay legible over the dash.
      const chip = (text: string, cxPos: number, align: CanvasTextAlign) => {
        ctx.font = "bold 11px Nunito, sans-serif";
        const tw = ctx.measureText(text).width;
        const bx = align === "right" ? cxPos - tw - 10 : cxPos - 4;
        roundRectPath(ctx, bx, dashY + 5, tw + 14, 18, 9);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(text, bx + 7, dashY + 18);
      };
      chip(`${Math.round(distance)} m`, 14, "left");
      chip(
        sessionIsDrag ? `${sessionRaceDistanceM} m` : "Free ride",
        width - 14,
        "right",
      );
      ctx.textAlign = "left";

      drawPedal(ctx, shiftUpBtn.x, shiftUpBtn.y, shiftUpBtn.w, shiftUpBtn.h, shiftUpDown, "#4aa3ff");
      drawPedal(
        ctx,
        shiftDownBtn.x,
        shiftDownBtn.y,
        shiftDownBtn.w,
        shiftDownBtn.h,
        shiftDownDown,
        "#4aa3ff",
      );
      drawPedal(ctx, brakeBtn.x, brakeBtn.y, brakeBtn.w, brakeBtn.h, brakeDown, "#ff5a5a");
      drawPedal(
        ctx,
        gasBtn.x,
        gasBtn.y,
        gasBtn.w,
        gasBtn.h,
        gasDown || gasRef.current,
        "#5cd0a8",
      );
      const laneSwitchable = laneAnimT >= 1 && oilLockMs <= 0;
      drawPedal(ctx, laneUpBtn.x, laneUpBtn.y, laneUpBtn.w, laneUpBtn.h, false, "#c084fc");
      drawPedal(
        ctx,
        laneDownBtn.x,
        laneDownBtn.y,
        laneDownBtn.w,
        laneDownBtn.h,
        false,
        "#c084fc",
      );

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("UP", shiftUpBtn.x + shiftUpBtn.w / 2, shiftUpBtn.y + shiftUpBtn.h / 2 + 4);
      ctx.fillText("DOWN", shiftDownBtn.x + shiftDownBtn.w / 2, shiftDownBtn.y + shiftDownBtn.h / 2 + 4);
      ctx.save();
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.translate(brakeBtn.x + brakeBtn.w / 2, brakeBtn.y + brakeBtn.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("BRAKE", 0, 4);
      ctx.restore();
      ctx.font = "bold 14px Nunito, sans-serif";
      ctx.fillText("GAS", gasBtn.x + gasBtn.w / 2, gasBtn.y + gasBtn.h / 2 + 5);
      ctx.globalAlpha = laneSwitchable ? 1 : 0.4;
      ctx.font = "bold 20px Nunito, sans-serif";
      ctx.fillText("▲", laneUpBtn.x + laneUpBtn.w / 2, laneUpBtn.y + laneUpBtn.h / 2 + 7);
      ctx.fillText("▼", laneDownBtn.x + laneDownBtn.w / 2, laneDownBtn.y + laneDownBtn.h / 2 + 7);
      ctx.globalAlpha = 1;
      ctx.font = "bold 9px Nunito, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("SHIFT", shiftUpBtn.x + shiftUpBtn.w / 2, shiftUpBtn.y - 6);
      ctx.fillText("LANE", laneUpBtn.x + laneUpBtn.w / 2, laneUpBtn.y - 6);
      ctx.textAlign = "left";

      if (shiftFlash > 0) {
        ctx.fillStyle =
          shiftQuality === 1 ? "#5cd0a8" : shiftQuality === 0 ? "#ffb43d" : "#ff5a5a";
        ctx.font = "bold 15px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          lastShiftKind === "down"
            ? "Downshift"
            : shiftQuality === 1
              ? "PERFECT!"
              : shiftQuality === 0
                ? "Good shift"
                : rpm > SHIFT_PERFECT_MAX
                  ? "Over-rev!"
                  : "Too early!",
          width / 2,
          sceneH * 0.35,
        );
        ctx.textAlign = "left";
      }

      if (finished) {
        ctx.fillStyle = palette.isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = p.hudText;
        ctx.font = "bold 28px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FINISH!", width / 2, height / 2);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engineSound?.stop();
      brakeSound?.stop();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none select-none"
      style={{ width, height }}
    />
  );
}
