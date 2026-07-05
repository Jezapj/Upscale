import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { OctaneConfig } from "./octaneConfig";
import { formatRaceTime, scoreOctaneDrag, type GameResult } from "./gameResult";
import {
  createOctaneEngineSound,
  playOctaneBadShift,
  playOctaneNitroPerfect,
  playOctaneRevShift,
  preloadOctaneAudio,
  unlockGameAudio,
} from "./gameAudio";

interface Props {
  width: number;
  height: number;
  config: OctaneConfig;
  onGameOver: (result: number | GameResult) => void;
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
const NIGHT_RUN_CHANCE = 0.24;
/** Car height as a fraction of road band height. */
const CAR_HEIGHT_RATIO = 0.92;

/** Center-lane dashed markings (world-locked to road scroll) */
const ROAD_MARKINGS = {
  dashLength: 180,
  dashGap: 102,
  yRatio: 0.55,
  lineWidth: 5,
  /** 1 = scrolls with road distance; keep at 1 for painted-on-road feel */
  scrollRate: 1,
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
  alpha: 0.08,
  /** Wider outer halo opacity multiplier. */
  outerAlpha: 0.68,
} as const;

/**
 * Overhead street / moon beams that parallax-scroll onto the road.
 * Tweak spacing, origin, spread, and color until pools look right on the asphalt.
 */
const ROAD_LIGHT_TUNING = {
  /** Horizontal repeat distance (px) — lower = more lights on screen. */
  tileSpacing: 1200,
  /** Scroll speed relative to the car (higher = faster across the screen). */
  parallax: 1.38,
  /** 0–1 chance a light spawns in each tile. */
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
    { spreadMult: 0.18, alphaMult: 0.05, yBias: 0.9 },
    { spreadMult: 0.6, alphaMult: 0.62, yBias: 0.78 },
    { spreadMult: 0.75, alphaMult: 0.3, yBias: 0.65 },
  ],
} as const;

/** Night overhead beam → reflective sweep on the car body (front → rear) */
const CAR_GLINT_TUNING = {
  /** Width of the moving highlight band (fraction of car width) */
  bandWidth: 0.2,
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
  /** 0 = rear (left), 1 = front (right) — band center along the body */
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
  /** 0–1 chance to spawn when an attempt fires. */
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
 * Wheel spin axis on the car sprite (normalized 0–1).
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
) {
  const startA = Math.PI * 0.75;
  const endA = Math.PI * 2.25;
  const span = endA - startA;

  ctx.fillStyle = faceColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startA, endA);
  ctx.stroke();

  if (redlineStart !== null && redlineEnd !== null) {
    const rs = startA + (redlineStart / max) * span;
    const re = startA + (redlineEnd / max) * span;
    ctx.strokeStyle = "#e03030";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, rs, re);
    ctx.stroke();
  }

  const majorTicks = max <= 10 ? 9 : 8;
  for (let i = 0; i <= majorTicks; i++) {
    const t = i / majorTicks;
    const ang = startA + t * span;
    const inner = r - 14;
    const outer = r - 4;
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();

    if (i % 2 === 0) {
      const display =
        tickMode === "speed"
          ? i * (max / majorTicks)
          : max <= 10
            ? i
            : i * (max / majorTicks / 1000);
      ctx.fillStyle = tickColor;
      ctx.font = "bold 9px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(display)), cx + Math.cos(ang) * (r - 22), cy + Math.sin(ang) * (r - 22) + 3);
    }
  }

  const pct = Math.min(1, value / max);
  const needleA = startA + pct * span;
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needleA) * (r - 18), cy + Math.sin(needleA) * (r - 18));
  ctx.stroke();
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = tickColor;
  ctx.font = "bold 10px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + r * 0.45);
  ctx.font = "bold 13px Nunito, sans-serif";
  ctx.fillText(unit, cx, cy + 8);
  ctx.textAlign = "left";
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

function drawCheckeredPedal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
) {
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(x, y, w, h);

  const cell = 6;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const even = (row + col) % 2 === 0;
      ctx.fillStyle = even ? "#f2f2f2" : "#1a1a1a";
      const cw = Math.min(cell, x + w - (x + col * cell));
      const ch = Math.min(cell, y + h - (y + row * cell));
      ctx.fillRect(x + col * cell, y + row * cell, cw, ch);
    }
  }

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "rgba(255,255,255,0.22)");
  grad.addColorStop(0.5, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  if (active) {
    ctx.fillStyle = "rgba(92, 208, 168, 0.4)";
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
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

/** Screen-fixed cones on the road — scroll with the car, not parallax scenery. */
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

  ctx.fillStyle = "rgba(1, 2, 10, 0.88)";
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

/** Pixel drag racer: hold gas, clutch to shift at redline, scrolling road, dashboard gauges. */
export function OctaneGame({ width, height, config, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gasRef = useRef(false);
  const palette = useGamePalette();
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);
  const configRef = useRef(config);

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;
  configRef.current = config;

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
      const dpr = window.devicePixelRatio || 1;
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
      return {
        width: w,
        height: h,
        sceneH,
        dashY,
        dashH,
        roadY,
        roadH,
        carX: w * 0.06,
        clutchBtn: { x: 14, y: h - 62, w: 40, h: 40 },
        brakeBtn: { x: 60, y: h - 62, w: 40, h: 40 },
        gasBtn: { x: w - 62, y: h - 98, w: 48, h: 76 },
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
    const frontWheelImg = new Image();
    const backWheelImg = new Image();
    const bgImg = new Image();
    const treeImg = new Image();
    const sakuraTop1 = new Image();
    const sakuraTop2 = new Image();

    carImg.src = "/OctanePixelCar2.png";
    frontWheelImg.src = "/FrontWheel.png";
    backWheelImg.src = "/BackWheel.png";
    bgImg.src = Math.random() < 0.5 ? "/bg1.png" : "/bg2.png";
    treeImg.src = "/tree.png";
    sakuraTop1.src = "/sakuratop1.png";
    sakuraTop2.src = "/sakuratop2.png";

    let carReady = false;
    let wheelsReady = false;
    let carDrawW = 100;
    let carDrawH = 36;
    let carY = 0;
    const sizeCar = () => {
      const { roadY, roadH } = getLayout();
      carDrawH = roadH * CAR_HEIGHT_RATIO;
      carDrawW = (carImg.naturalWidth / carImg.naturalHeight) * carDrawH;
      carY = roadY + roadH * 0.52 - carDrawH;
    };
    const tryReady = () => {
      if (carImg.complete && carImg.naturalWidth > 0) sizeCar();
      carReady = carImg.complete && carImg.naturalWidth > 0;
      wheelsReady =
        frontWheelImg.complete &&
        frontWheelImg.naturalWidth > 0 &&
        backWheelImg.complete &&
        backWheelImg.naturalWidth > 0;
    };
    carImg.onload = tryReady;
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
    let time = 0;
    let topMph = 0;
    const raceStartTime = performance.now();
    let clutchDown = false;
    let brakeDown = false;
    let gasDown = false;

    let flareCooldown =
      LENS_FLARE_TUNING.minInterval +
      Math.random() * (LENS_FLARE_TUNING.maxInterval - LENS_FLARE_TUNING.minInterval);
    let activeFlare: LensFlarePass | null = null;

    const rpmRiseRate = (g: number) => 175 / Math.pow(g, 1.85);

    const shift = () => {
      if (!alive || finished || gear >= GEARS) return;
      unlockGameAudio();
      preloadOctaneAudio();
      if (rpm < SHIFT_PERFECT_MIN * 0.5) {
        shiftQuality = -1;
        shiftFlash = 22;
        playOctaneBadShift();
        rpm = Math.max(0, rpm - 1200);
        mph = Math.max(0, mph - 4);
        return;
      }
      const perfect = rpm >= SHIFT_PERFECT_MIN && rpm <= SHIFT_PERFECT_MAX;
      shiftQuality = perfect ? 1 : rpm > SHIFT_PERFECT_MAX ? -1 : 0;
      shiftFlash = perfect ? 40 : 18;
      gear++;
      playOctaneRevShift(gear);
      if (perfect) playOctaneNitroPerfect();
      else if (rpm > SHIFT_PERFECT_MAX) playOctaneBadShift();
      rpm = perfect ? 3800 + gear * 100 : rpm > SHIFT_PERFECT_MAX ? 5200 : 4500;
      mph += perfect ? 14 : rpm > SHIFT_PERFECT_MAX ? 4 : 8;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      unlockGameAudio();
      preloadOctaneAudio();
      const { clutchBtn, brakeBtn, gasBtn } = getLayout();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (hit(x, y, clutchBtn)) {
        clutchDown = true;
        shift();
      } else if (hit(x, y, brakeBtn)) {
        brakeDown = true;
      } else if (hit(x, y, gasBtn)) {
        gasDown = true;
        gasRef.current = true;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const { clutchBtn, brakeBtn, gasBtn } = getLayout();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (clutchDown && hit(x, y, clutchBtn)) clutchDown = false;
      if (brakeDown && hit(x, y, brakeBtn)) brakeDown = false;
      if (gasDown && hit(x, y, gasBtn)) {
        gasDown = false;
        gasRef.current = false;
      }
    };
    const onLeave = () => {
      clutchDown = false;
      brakeDown = false;
      gasDown = false;
      gasRef.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        unlockGameAudio();
        preloadOctaneAudio();
        gasRef.current = true;
      }
      if (e.code === "ShiftLeft" || e.code === "KeyE") {
        e.preventDefault();
        shift();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") gasRef.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let last = performance.now();
    const engineSound = createOctaneEngineSound();

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
        clutchBtn,
        brakeBtn,
        gasBtn,
      } = syncLayout();
      const palette = paletteRef.current;

      if (!finished) {
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

        if (rpm > REDLINE_END) rpm = REDLINE_END;
        rpm = Math.max(0, Math.min(RPM_MAX, rpm));
        mph = Math.max(0, Math.min(MPH_MAX, mph));
        topMph = Math.max(topMph, mph);

        distance += mph * 0.00745 * dt;
        scrollPx += mph * 0.22 * dt;
        wheelAngle += (mph / WHEEL_SPIN_RATE) * dt;

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

      if (shiftFlash > 0) shiftFlash -= dt;

      engineSound?.update(rpm, gasRef.current, gear);

      drawParallaxBackground(ctx, bgImg, width, sceneH, scrollPx, BG_PARALLAX);

      drawSceneryLayer(ctx, width, roadY, scrollPx, TREE_PARALLAX, treeImg);

      ctx.fillStyle = p.road;
      ctx.fillRect(0, roadY, width, roadH);

      const markY = roadY + roadH * ROAD_MARKINGS.yRatio;
      const spacing = ROAD_MARKINGS.dashLength + ROAD_MARKINGS.dashGap;
      const offset =
        ((scrollPx * ROAD_MARKINGS.scrollRate) % spacing + spacing) % spacing;

      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = ROAD_MARKINGS.lineWidth;
      ctx.lineCap = "butt";
      for (let lx = -offset; lx < width + ROAD_MARKINGS.dashLength; lx += spacing) {
        ctx.beginPath();
        ctx.moveTo(lx, markY);
        ctx.lineTo(lx + ROAD_MARKINGS.dashLength, markY);
        ctx.stroke();
      }

      drawSakuraOverhead(ctx, width, roadY, roadH, scrollPx, sakuraTop1, sakuraTop2);

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(carX + carDrawW * 0.45, roadY + roadH * 0.38, carDrawW * 0.4, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      if (carReady) {
        ctx.drawImage(carImg, carX, carY, carDrawW, carDrawH);
      }

      if (wheelsReady) {
        drawRotatedWheelLayer(ctx, backWheelImg, carX, carY, carDrawW, carDrawH, WHEEL_TUNING.rear, wheelAngle);
        drawRotatedWheelLayer(ctx, frontWheelImg, carX, carY, carDrawW, carDrawH, WHEEL_TUNING.front, wheelAngle);
      }

      if (gasRef.current && !finished) {
        ctx.fillStyle = "rgba(255,180,80,0.7)";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(carX - 12 - i * 8 - (scrollPx % 4), carY + carDrawH * 0.55 + i, 6, 4);
        }
      }

      if (isNight) {
        drawNightScene(ctx, width, sceneH, roadY, roadH, scrollPx, time);
        const glintPasses = collectCarGlintPasses(scrollPx, time, carX, carDrawW, width);
        if (carReady) {
          drawCarTopLightReflection(ctx, carImg, carX, carY, carDrawW, carDrawH, glintPasses);
        }
        drawCarHeadlights(ctx, width, roadY, roadH, carX, carY, carDrawW, carDrawH);
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

      ctx.fillStyle = palette.isDark ? "#080a10" : "#1e2026";
      ctx.fillRect(0, dashY, width, dashH);
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
      const face = palette.isDark ? "#1a1c24" : "#e8eaee";
      const tick = palette.isDark ? "#ccc" : "#333";

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
      );

      const gearX = width * 0.5;
      const gearTop = dashY + dashH * 0.18;
      ctx.fillStyle = tick;
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GEAR", gearX, gearTop);
      const bars = ["#4aa3ff", "#5cd0a8", "#ffb43d", "#ff7a59", "#ff5a5a", "#c084fc"];
      for (let i = 0; i < GEARS; i++) {
        ctx.fillStyle = i < gear ? bars[i % bars.length] : "rgba(120,120,120,0.35)";
        ctx.fillRect(gearX - 28 + i * 10, gearTop + 8, 8, 22);
      }
      ctx.font = "bold 28px Nunito, sans-serif";
      ctx.fillStyle = gear === 0 ? tick : bars[(gear - 1) % bars.length];
      ctx.fillText(gear >= 1 ? String(gear) : "N", gearX, gearTop + 58);
      ctx.font = "bold 10px Nunito, sans-serif";
      ctx.fillStyle = "rgba(150,150,150,0.8)";
      ctx.fillText("R", gearX - 20, gearTop + 58);
      ctx.textAlign = "left";

      ctx.fillStyle = tick;
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.fillText(`${Math.round(distance)}m`, 14, dashY + 16);
      if (sessionIsDrag) {
        ctx.fillText(`${sessionRaceDistanceM}m`, width - 58, dashY + 16);
      } else {
        ctx.textAlign = "right";
        ctx.fillText("Free ride", width - 14, dashY + 16);
        ctx.textAlign = "left";
      }

      drawCheckeredPedal(ctx, clutchBtn.x, clutchBtn.y, clutchBtn.w, clutchBtn.h, clutchDown);
      drawCheckeredPedal(ctx, brakeBtn.x, brakeBtn.y, brakeBtn.w, brakeBtn.h, brakeDown);
      drawCheckeredPedal(ctx, gasBtn.x, gasBtn.y, gasBtn.w, gasBtn.h, gasDown || gasRef.current);

      ctx.fillStyle = tick;
      ctx.font = "9px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CLUTCH", clutchBtn.x + clutchBtn.w / 2, height - 6);
      ctx.fillText("BRAKE", brakeBtn.x + brakeBtn.w / 2, height - 6);
      ctx.fillText("GAS", gasBtn.x + gasBtn.w / 2, height - 6);
      ctx.textAlign = "left";

      if (shiftFlash > 0) {
        ctx.fillStyle =
          shiftQuality === 1 ? "#5cd0a8" : shiftQuality === 0 ? "#ffb43d" : "#ff5a5a";
        ctx.font = "bold 15px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          shiftQuality === 1 ? "PERFECT!" : shiftQuality === 0 ? "Good shift" : rpm > SHIFT_PERFECT_MAX ? "Over-rev!" : "Too early!",
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
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
