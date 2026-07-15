import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import { formatRaceTime, scoreTipTop, type GameResult } from "./gameResult";
import { playTipTopFlap, playTipTopHoleIn, unlockGameAudio } from "./gameAudio";
import { frameDecay, frameScale, MAX_PHYSICS_STEPS, renderLerp } from "./gameLoop";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: number | GameResult) => void;
}

type StageTheme = "forest" | "beach" | "mountain" | "space";

interface Pit {
  x: number;
  width: number;
  depth: number;
  scored: boolean;
}

type ObstacleKind = "platform" | "stone" | "tree" | "wall" | "flag" | "ceiling" | "bump";

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  w: number;
  h: number;
  /** Ground-anchored, or floating above terrain. */
  anchor: "ground" | "float";
  floatAbove: number;
}

function isCeilingSurface(obs: Obstacle): boolean {
  return obs.kind === "ceiling" || (obs.kind === "platform" && obs.anchor === "float");
}

interface ThemeCloud {
  x: number;
  y: number;
  w: number;
}

interface ThemeStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

type SurfaceFace = "top" | "bottom" | "left" | "right";

type StageElementKind = "sticky" | "laser" | "portal" | "gravity";

interface StickyPatch {
  kind: "sticky";
  /** Along-surface coverage in world X (for top/bottom) or world Y offset range unused. */
  x: number;
  w: number;
  attach: "ground" | { obsIndex: number; face: SurfaceFace };
  thickness: number;
}

interface LaserBeam {
  kind: "laser";
  /** Beam X for vertical span between platform underside and ground. */
  x: number;
  obsIndex: number;
}

interface PortalPad {
  x: number;
  w: number;
  h: number;
  attach: "ground" | { obsIndex: number; face: SurfaceFace };
  /** Outward normal from the surface the portal sits on. */
  nx: number;
  ny: number;
}

interface PortalPair {
  kind: "portal";
  blue: PortalPad;
  orange: PortalPad;
}

type GravityDir = "up" | "down" | "left" | "right";

interface GravityZone {
  kind: "gravity";
  x: number;
  w: number;
  h: number;
  /** Zone center height above local ground. */
  aboveGround: number;
  dir: GravityDir;
}

type StageElement = StickyPatch | LaserBeam | PortalPair | GravityZone;

interface Stage {
  worldW: number;
  pit: Pit;
  groundPhase: number;
  groundAmp: number;
  obstacles: Obstacle[];
  elements: StageElement[];
  theme: StageTheme;
  gravity: number;
  clouds: ThemeCloud[];
  stars: ThemeStar[];
  /** Pre-rendered sky layer (built once per stage). */
  backdrop: HTMLCanvasElement | null;
}

const STAGE_COUNT = 3;
const GRAVITY = 0.21;
const SPACE_GRAVITY = 0.13;
const FLAP_POWER = 5.9;
const FLAP_ANGLE = (75 * Math.PI) / 180;
const GROUND_Y = 0.78;
const STAGE_CLEAR_FRAMES = 50;
const GRAVITY_ZONE_FORCE = 0.42;
const PORTAL_COOLDOWN_FRAMES = 18;
/** Physics steps (~60/s) sticky stays off after a flap escape. */
const STICKY_ESCAPE_FRAMES = 12;
const ELEMENT_KINDS: StageElementKind[] = ["sticky", "laser", "portal", "gravity"];

/** White tangential hit flash after a flap — tune `size` and `alpha`. */
const FLAP_IMPACT_TUNING = {
  size: 4.0,
  alpha: 0.52,
  durationMs: 200,
  /** 1 = fully horizontal at max speed; lower = less speed influence on angle. */
  speedFlatness: 1.0,
};

/** White motion trail behind the ball. */
const BALL_TRAIL_TUNING = {
  maxPoints: 20,
  minDist: 2.2,
  minSpeed: 1.2,
  alpha: 0.62,
  width: 7,
  /** How quickly discarded portal trails fade (per ms). */
  fadePerMs: 0.0032,
};

interface TrailPoint {
  x: number;
  y: number;
}

interface FadingTrail {
  points: TrailPoint[];
  fade: number;
}

interface FlapImpact {
  /** Effect direction (flap force, flattened toward horizontal by speed). */
  forceX: number;
  forceY: number;
  ageMs: number;
}

function flapImpactDirection(
  forceX: number,
  forceY: number,
  speed: number,
  maxSpd: number,
  speedFlatness: number,
): { x: number; y: number } {
  const t = Math.min(1, speed / maxSpd) * speedFlatness;
  const x = forceX;
  const y = forceY * (1 - t);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function drawFlapImpact(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ballR: number,
  forceX: number,
  forceY: number,
  progress: number,
  tuning: typeof FLAP_IMPACT_TUNING,
) {
  const fade = 1 - progress;
  const alpha = tuning.alpha * fade * fade;
  if (alpha <= 0.01) return;

  const nx = -forceX;
  const ny = -forceY;
  const impactAngle = Math.atan2(ny, nx);
  const arcSpan = (0.75 + 0.25 * tuning.size) * fade;
  const innerR = ballR * (0.5 + 0.05 * tuning.size);
  const outerR = ballR * (1.02 + 0.18 * tuning.size * fade);

  const tx = -ny;
  const ty = nx;
  const contactX = cx + nx * ballR * 0.9;
  const contactY = cy + ny * ballR * 0.9;
  const streakLen = ballR * (0.95 + 0.35 * tuning.size) * fade;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, impactAngle - arcSpan / 2, impactAngle + arcSpan / 2);
  ctx.arc(cx, cy, innerR, impactAngle + arcSpan / 2, impactAngle - arcSpan / 2, true);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5 + 2 * tuning.size * fade;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(contactX - tx * streakLen, contactY - ty * streakLen);
  ctx.lineTo(contactX + tx * streakLen, contactY + ty * streakLen);
  ctx.stroke();
  ctx.restore();
}

function drawBallTrail(
  ctx: CanvasRenderingContext2D,
  trail: readonly TrailPoint[],
  camX: number,
  ballR: number,
  tuning: typeof BALL_TRAIL_TUNING,
  fadeScale = 1,
) {
  if (trail.length < 2 || fadeScale <= 0.02) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < trail.length; i++) {
    const fade = (i / trail.length) * fadeScale;
    const alpha = tuning.alpha * fade * fade;
    if (alpha <= 0.02) continue;

    const p0 = trail[i - 1];
    const p1 = trail[i];
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = ballR * 0.25 + tuning.width * fade;
    ctx.beginPath();
    ctx.moveTo(p0.x - camX, p0.y);
    ctx.lineTo(p1.x - camX, p1.y);
    ctx.stroke();
  }

  for (let i = 0; i < trail.length; i++) {
    const fade = ((i + 1) / trail.length) * fadeScale;
    const alpha = tuning.alpha * fade * 0.45;
    if (alpha <= 0.02) continue;

    const p = trail[i];
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y, ballR * (0.22 + 0.42 * fade), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function updateBallTrail(
  trail: TrailPoint[],
  x: number,
  y: number,
  speed: number,
  tuning: typeof BALL_TRAIL_TUNING,
) {
  if (speed < tuning.minSpeed) return;
  const last = trail[trail.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < tuning.minDist) return;
  trail.push({ x, y });
  while (trail.length > tuning.maxPoints) trail.shift();
}

function ageFadingTrails(
  trails: FadingTrail[],
  deltaMs: number,
  tuning: typeof BALL_TRAIL_TUNING,
) {
  for (let i = trails.length - 1; i >= 0; i--) {
    const t = trails[i];
    t.fade -= deltaMs * tuning.fadePerMs;
    if (deltaMs > 0 && t.points.length > 0 && Math.random() < deltaMs * 0.08) {
      t.points.shift();
    }
    if (t.fade <= 0.03 || t.points.length < 2) trails.splice(i, 1);
  }
}

function splitTrailOnPortal(
  active: TrailPoint[],
  fading: FadingTrail[],
) {
  if (active.length >= 2) {
    fading.push({
      points: active.map((p) => ({ x: p.x, y: p.y })),
      fade: 1,
    });
  }
  active.length = 0;
}

const STAGE_THEMES: StageTheme[] = ["forest", "beach", "mountain", "space"];

const THEME_LABELS: Record<StageTheme, string> = {
  forest: "Forest",
  beach: "Beach",
  mountain: "Mountain",
  space: "Space",
};

interface ThemePalette {
  skyTop: string;
  skyBot: string;
  rough: string;
  fairway: string;
  fairwayStripe: string;
  cup: string;
  cupInner: string;
}

const THEME_PALETTES: Record<StageTheme, ThemePalette> = {
  forest: {
    skyTop: "",
    skyBot: "",
    rough: "",
    fairway: "",
    fairwayStripe: "",
    cup: "",
    cupInner: "",
  },
  beach: {
    skyTop: "#6ec8f0",
    skyBot: "#b8e8ff",
    rough: "#c9a96a",
    fairway: "#e8d49a",
    fairwayStripe: "#dcc080",
    cup: "#2a7aaa",
    cupInner: "#1a5a88",
  },
  mountain: {
    skyTop: "#7eb8e8",
    skyBot: "#c8e4f8",
    rough: "#4a3828",
    fairway: "#7a5c40",
    fairwayStripe: "#6a4c30",
    cup: "#3a2a18",
    cupInner: "#2a1a10",
  },
  space: {
    skyTop: "#020818",
    skyBot: "#0a1840",
    rough: "#3a3a48",
    fairway: "#9a9aa8",
    fairwayStripe: "#7a7a88",
    cup: "#4a4a58",
    cupInner: "#2a2a38",
  },
};

function themePalette(theme: StageTheme, fallback: ThemePalette): ThemePalette {
  if (theme === "forest") return fallback;
  return THEME_PALETTES[theme];
}

/** True when any part of the ball overlaps the pit horizontally (lenient margins). */
function ballOverlapsPitX(px: number, ballR: number, pit: Pit): boolean {
  const half = pit.width / 2 + ballR * 0.3;
  return px + ballR > pit.x - half && px - ballR < pit.x + half;
}

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function obstacleY(obs: Obstacle, viewH: number, stage: Stage): number {
  const base = groundHeight(obs.x + obs.w / 2, viewH, stage);
  return obs.anchor === "ground" ? base - obs.h : base - obs.floatAbove - obs.h;
}

function overlapsPit(x: number, w: number, pitX: number, pitW: number, margin = 70): boolean {
  const half = pitW / 2 + margin;
  return x + w > pitX - half && x < pitX + half;
}

function pickElementCount(rand: () => number): 0 | 1 | 2 {
  const roll = rand();
  if (roll < 0.2) return 0;
  if (roll < 0.7) return 1;
  return 2;
}

function shuffleKinds(rand: () => number): StageElementKind[] {
  const kinds = [...ELEMENT_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }
  return kinds;
}

function stickyWorldBounds(
  sticky: StickyPatch,
  playH: number,
  stage: Stage,
): { x: number; y: number; w: number; h: number; nx: number; ny: number } | null {
  const t = sticky.thickness;
  if (sticky.attach === "ground") {
    const y0 = Math.min(
      groundHeight(sticky.x, playH, stage),
      groundHeight(sticky.x + sticky.w, playH, stage),
    );
    return {
      x: sticky.x,
      y: y0 - t * 0.35,
      w: sticky.w,
      h: t,
      nx: 0,
      ny: -1,
    };
  }
  const obs = stage.obstacles[sticky.attach.obsIndex];
  if (!obs) return null;
  const oy = obstacleY(obs, playH, stage);
  const face = sticky.attach.face;
  if (face === "top") {
    return {
      x: sticky.x,
      y: oy - t * 0.55,
      w: sticky.w,
      h: t,
      nx: 0,
      ny: -1,
    };
  }
  if (face === "bottom") {
    return {
      x: sticky.x,
      y: oy + obs.h - t * 0.45,
      w: sticky.w,
      h: t,
      nx: 0,
      ny: 1,
    };
  }
  if (face === "left") {
    return {
      x: obs.x - t * 0.55,
      y: oy + sticky.x,
      w: t,
      h: sticky.w,
      nx: -1,
      ny: 0,
    };
  }
  return {
    x: obs.x + obs.w - t * 0.45,
    y: oy + sticky.x,
    w: t,
    h: sticky.w,
    nx: 1,
    ny: 0,
  };
}

function portalWorldRect(
  pad: PortalPad,
  playH: number,
  stage: Stage,
): { x: number; y: number; w: number; h: number; nx: number; ny: number } | null {
  const solid = 5;
  if (pad.attach === "ground") {
    const gy = groundHeight(pad.x + pad.w / 2, playH, stage);
    return {
      x: pad.x,
      y: gy - solid * 0.35,
      w: pad.w,
      h: solid,
      nx: pad.nx,
      ny: pad.ny,
    };
  }
  const obs = stage.obstacles[pad.attach.obsIndex];
  if (!obs) return null;
  const oy = obstacleY(obs, playH, stage);
  const face = pad.attach.face;
  if (face === "top") {
    return {
      x: pad.x,
      y: oy - solid * 0.65,
      w: pad.w,
      h: solid,
      nx: pad.nx,
      ny: pad.ny,
    };
  }
  if (face === "bottom") {
    return {
      x: pad.x,
      y: oy + obs.h - solid * 0.35,
      w: pad.w,
      h: solid,
      nx: pad.nx,
      ny: pad.ny,
    };
  }
  if (face === "left") {
    return {
      x: obs.x - solid * 0.65,
      y: oy + pad.x,
      w: solid,
      h: pad.w,
      nx: pad.nx,
      ny: pad.ny,
    };
  }
  return {
    x: obs.x + obs.w - solid * 0.35,
    y: oy + pad.x,
    w: solid,
    h: pad.w,
    nx: pad.nx,
    ny: pad.ny,
  };
}

function gravityZoneRect(
  zone: GravityZone,
  playH: number,
  stage: Stage,
): { x: number; y: number; w: number; h: number } {
  const gy = groundHeight(zone.x + zone.w / 2, playH, stage);
  return {
    x: zone.x,
    y: gy - zone.aboveGround - zone.h / 2,
    w: zone.w,
    h: zone.h,
  };
}

function laserEndpoints(
  laser: LaserBeam,
  playH: number,
  stage: Stage,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const obs = stage.obstacles[laser.obsIndex];
  if (!obs) return null;
  const oy = obstacleY(obs, playH, stage);
  const x = laser.x;
  const yTop = oy + obs.h;
  const yBot = groundHeight(x, playH, stage);
  if (yBot - yTop < 40) return null;
  return { x0: x, y0: yTop, x1: x, y1: yBot };
}

function circleHitsSegment(
  px: number,
  py: number,
  r: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + dx * t;
  const cy = y0 + dy * t;
  return Math.hypot(px - cx, py - cy) <= r + 3;
}

function circleHitsAabb(
  px: number,
  py: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const nearX = Math.max(x, Math.min(px, x + w));
  const nearY = Math.max(y, Math.min(py, y + h));
  return Math.hypot(px - nearX, py - nearY) <= r;
}

function pointInRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function tryPlaceSticky(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  obstacles: Obstacle[],
): StickyPatch | null {
  const surfaces = obstacles
    .map((obs, i) => ({ obs, i }))
    .filter(
      ({ obs }) =>
        isCeilingSurface(obs) ||
        obs.kind === "bump" ||
        obs.kind === "platform" ||
        obs.kind === "wall",
    );

  for (let attempt = 0; attempt < 24; attempt++) {
    if (surfaces.length > 0 && rand() > 0.28) {
      const { obs, i } = surfaces[Math.floor(rand() * surfaces.length)];
      const faceRoll = rand();
      let face: SurfaceFace = "top";
      if (isCeilingSurface(obs) && faceRoll < 0.7) face = "bottom";
      else if (obs.kind === "bump" && faceRoll < 0.35) face = rand() > 0.5 ? "left" : "right";
      else if (obs.anchor === "float" && faceRoll < 0.45) face = "bottom";
      else if (faceRoll > 0.85) face = rand() > 0.5 ? "left" : "right";

      if (face === "top" || face === "bottom") {
        const w = Math.min(obs.w * (0.55 + rand() * 0.35), obs.w - 8);
        const x = obs.x + (obs.w - w) * rand();
        if (overlapsPit(x, w, pitX, pitW, 40)) continue;
        return {
          kind: "sticky",
          x,
          w,
          attach: { obsIndex: i, face },
          thickness: 18 + Math.floor(rand() * 10),
        };
      }
      const h = Math.min(obs.h * (0.45 + rand() * 0.4), obs.h - 6);
      const yOff = (obs.h - h) * rand();
      return {
        kind: "sticky",
        x: yOff,
        w: h,
        attach: { obsIndex: i, face },
        thickness: 16 + Math.floor(rand() * 8),
      };
    }

    const w = 70 + Math.floor(rand() * 90);
    const x = 280 + Math.floor(rand() * Math.max(80, worldW - 420));
    if (x + w > worldW - 40) continue;
    if (overlapsPit(x, w, pitX, pitW, 50)) continue;
    return {
      kind: "sticky",
      x,
      w,
      attach: "ground",
      thickness: 20 + Math.floor(rand() * 10),
    };
  }
  return null;
}

function ensureCeiling(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  obstacles: Obstacle[],
): number | null {
  const existing = obstacles
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => isCeilingSurface(obs) && obs.w >= 70 && obs.floatAbove >= 55);
  if (existing.length > 0) {
    return existing[Math.floor(rand() * existing.length)].i;
  }

  for (let attempt = 0; attempt < 14; attempt++) {
    const w = 100 + Math.floor(rand() * 90);
    const x = 280 + Math.floor(rand() * Math.max(60, worldW - w - 160));
    if (x < 220) continue;
    if (overlapsPit(x, w, pitX, pitW, 50)) continue;
    const overlaps = obstacles.some((o) => x < o.x + o.w + 36 && x + w + 36 > o.x);
    if (overlaps) continue;
    obstacles.push({
      kind: "ceiling",
      x,
      w,
      h: 22 + Math.floor(rand() * 14),
      anchor: "float",
      floatAbove: 85 + Math.floor(rand() * 95),
    });
    return obstacles.length - 1;
  }
  return null;
}

function tryPlaceLaser(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  obstacles: Obstacle[],
): LaserBeam | null {
  const obsIndex = ensureCeiling(rand, worldW, pitX, pitW, obstacles);
  if (obsIndex === null) return null;
  const obs = obstacles[obsIndex];
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = obs.x + obs.w * (0.18 + rand() * 0.64);
    if (overlapsPit(x - 10, 20, pitX, pitW, 40)) continue;
    return { kind: "laser", x, obsIndex };
  }
  return { kind: "laser", x: obs.x + obs.w * 0.5, obsIndex };
}

function tryPlacePortals(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  obstacles: Obstacle[],
): PortalPair | null {
  const ceilingIndex = ensureCeiling(rand, worldW, pitX, pitW, obstacles);
  if (ceilingIndex === null) return null;
  const obs = obstacles[ceilingIndex];

  for (let attempt = 0; attempt < 22; attempt++) {
    const pw = Math.min(58, Math.max(40, obs.w * (0.4 + rand() * 0.35)));
    const px = obs.x + (obs.w - pw) * (0.1 + rand() * 0.8);
    if (overlapsPit(px, pw, pitX, pitW, 40)) continue;

    const gw = 48 + Math.floor(rand() * 22);
    let gx = 240 + Math.floor(rand() * Math.max(80, worldW - 360));
    if (Math.abs(gx + gw / 2 - (obs.x + obs.w / 2)) < 100) {
      gx = obs.x > worldW * 0.5 ? obs.x - gw - 90 : obs.x + obs.w + 90;
    }
    if (gx < 200) gx = 200;
    if (gx + gw > worldW - 40) gx = worldW - gw - 40;
    if (overlapsPit(gx, gw, pitX, pitW, 50)) continue;

    const orangeOnCeiling = rand() > 0.35;
      const ceiling: PortalPad = {
        x: px,
        w: pw,
        h: 5,
        attach: { obsIndex: ceilingIndex, face: "bottom" },
        nx: 0,
        ny: 1,
      };
      const floor: PortalPad = {
        x: gx,
        w: gw,
        h: 5,
        attach: "ground",
        nx: 0,
        ny: -1,
      };
    return orangeOnCeiling
      ? { kind: "portal", blue: floor, orange: ceiling }
      : { kind: "portal", blue: ceiling, orange: floor };
  }
  return null;
}

function pickGravityDir(rand: () => number, zoneCenterX: number, pitX: number): GravityDir {
  const towardGoal: GravityDir = zoneCenterX < pitX ? "right" : "left";
  const awayGoal: GravityDir = towardGoal === "right" ? "left" : "right";
  const roll = rand();
  // Up + toward-goal common, down less rare, away-from-goal rare.
  if (roll < 0.38) return "up";
  if (roll < 0.72) return towardGoal;
  if (roll < 0.92) return "down";
  return awayGoal;
}

function tryPlaceGravity(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
): GravityZone | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const w = 50 + Math.floor(rand() * 451);
    const h = 50 + Math.floor(rand() * 451);
    const x = 260 + Math.floor(rand() * Math.max(80, worldW - w - 180));
    if (x + w > worldW - 50) continue;
    if (overlapsPit(x, w, pitX, pitW, 60)) continue;
    const aboveGround = 55 + Math.floor(rand() * 140);
    return {
      kind: "gravity",
      x,
      w,
      h,
      aboveGround,
      dir: pickGravityDir(rand, x + w / 2, pitX),
    };
  }
  return null;
}

function generateElements(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  obstacles: Obstacle[],
): StageElement[] {
  const count = pickElementCount(rand);
  if (count === 0) return [];

  const elements: StageElement[] = [];
  const kinds = shuffleKinds(rand);

  for (const kind of kinds) {
    if (elements.length >= count) break;
    let placed: StageElement | null = null;
    if (kind === "sticky") placed = tryPlaceSticky(rand, worldW, pitX, pitW, obstacles);
    else if (kind === "laser") placed = tryPlaceLaser(rand, worldW, pitX, pitW, obstacles);
    else if (kind === "portal") placed = tryPlacePortals(rand, worldW, pitX, pitW, obstacles);
    else placed = tryPlaceGravity(rand, worldW, pitX, pitW);
    if (placed) elements.push(placed);
  }
  return elements;
}

function generateObstacles(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  theme: StageTheme,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const placeGap = (x: number, w: number, margin = 36) =>
    obstacles.some((o) => x < o.x + o.w + margin && x + w + margin > o.x);

  const tryPlace = (make: () => Obstacle | null): boolean => {
    for (let attempt = 0; attempt < 22; attempt++) {
      const obs = make();
      if (!obs) continue;
      if (obs.x < 220) continue;
      if (obs.x + obs.w > worldW - 36) continue;
      if (overlapsPit(obs.x, obs.w, pitX, pitW)) continue;
      if (placeGap(obs.x, obs.w)) continue;
      obstacles.push(obs);
      return true;
    }
    return false;
  };

  const ceilingCount = 2 + Math.floor(rand() * 3);
  for (let n = 0; n < ceilingCount; n++) {
    tryPlace(() => {
      const w = 80 + Math.floor(rand() * 140);
      const x = 260 + Math.floor(rand() * Math.max(40, worldW - w - 120));
      return {
        kind: "ceiling",
        x,
        w,
        h: 18 + Math.floor(rand() * 20),
        anchor: "float",
        floatAbove: 70 + Math.floor(rand() * 110),
      };
    });
  }

  const bumpCount = 2 + Math.floor(rand() * 4);
  for (let n = 0; n < bumpCount; n++) {
    tryPlace(() => {
      const tall = rand() > 0.45;
      const wide = rand() > 0.4;
      const w = wide
        ? 55 + Math.floor(rand() * 130)
        : 22 + Math.floor(rand() * 36);
      const h = tall
        ? 48 + Math.floor(rand() * 90)
        : 18 + Math.floor(rand() * 34);
      const x = 250 + Math.floor(rand() * Math.max(40, worldW - w - 100));
      return {
        kind: "bump",
        x,
        w,
        h,
        anchor: "ground",
        floatAbove: 0,
      };
    });
  }

  const propKinds: ObstacleKind[] = ["stone", "tree", "flag"];
  const propCount = 1 + Math.floor(rand() * 3);
  for (let n = 0; n < propCount; n++) {
    let kind = propKinds[Math.floor(rand() * propKinds.length)];
    if (theme === "space" && kind === "tree") kind = "flag";
    if (theme !== "space" && kind === "flag" && rand() > 0.35) kind = "tree";
    tryPlace(() => {
      let w = 0;
      let h = 0;
      if (kind === "stone") {
        w = 38 + Math.floor(rand() * 34);
        h = w * (0.75 + rand() * 0.35);
      } else if (kind === "tree") {
        w = 24 + Math.floor(rand() * 16);
        h = 72 + Math.floor(rand() * 48);
      } else {
        w = 34 + Math.floor(rand() * 22);
        h = 78 + Math.floor(rand() * 44);
      }
      const x = 250 + Math.floor(rand() * Math.max(40, worldW - w - 100));
      return { kind, x, w, h, anchor: "ground", floatAbove: 0 };
    });
  }

  return obstacles;
}

function generateThemeDecor(
  rand: () => number,
  theme: StageTheme,
  worldW: number,
): { clouds: ThemeCloud[]; stars: ThemeStar[] } {
  const clouds: ThemeCloud[] =
    theme === "mountain"
      ? Array.from({ length: 7 }, () => ({
          x: rand() * worldW,
          y: 0.06 + rand() * 0.18,
          w: 44 + rand() * 50,
        }))
      : [];

  const stars: ThemeStar[] =
    theme === "space"
      ? Array.from({ length: 55 }, () => ({
          x: rand(),
          y: rand() * 0.82,
          size: rand() > 0.86 ? 2 : 1,
          alpha: 0.35 + rand() * 0.65,
        }))
      : [];
  return { clouds, stars };
}

function generateStage(seed: number): Stage {
  const rand = mulberry32(seed);
  const pitW = 58 + Math.floor(rand() * 22);
  /** Goal sits near the end — only a short runway after the cup. */
  const pitX = 720 + Math.floor(rand() * 1100);
  const afterGoal = 90 + Math.floor(rand() * 130);
  const worldW = pitX + afterGoal;
  const theme = STAGE_THEMES[Math.floor(rand() * STAGE_THEMES.length)];
  const pit = {
    x: pitX,
    width: pitW,
    depth: 48 + Math.floor(rand() * 18),
    scored: false,
  };
  const decor = generateThemeDecor(rand, theme, worldW);
  const obstacles = generateObstacles(rand, worldW, pitX, pitW, theme);
  return {
    worldW,
    pit,
    groundPhase: rand() * Math.PI * 2,
    groundAmp: 10 + rand() * 14,
    obstacles,
    elements: generateElements(rand, worldW, pitX, pitW, obstacles),
    theme,
    gravity: theme === "space" ? SPACE_GRAVITY : GRAVITY,
    clouds: decor.clouds,
    stars: decor.stars,
    backdrop: null,
  };
}

function generateStages(seed: number): Stage[] {
  return Array.from({ length: STAGE_COUNT }, (_, i) => generateStage(seed + i * 9973));
}

function groundHeight(worldY: number, viewH: number, stage: Stage): number {
  return (
    viewH * GROUND_Y +
    Math.sin(worldY * 0.004 + stage.groundPhase) * stage.groundAmp +
    Math.sin(worldY * 0.011 + stage.groundPhase * 0.6) * (stage.groundAmp * 0.45)
  );
}

function pitSurfaceY(pit: Pit, worldX: number, viewH: number, stage: Stage): number | null {
  const half = pit.width / 2;
  const left = pit.x - half;
  const right = pit.x + half;
  if (worldX < left - 40 || worldX > right + 40) return null;
  const cx = Math.max(left, Math.min(right, worldX));
  const t = (cx - left) / pit.width;
  const bowl = Math.sin(t * Math.PI);
  return groundHeight(cx, viewH, stage) + bowl * pit.depth;
}

function pitBottomY(pit: Pit, viewH: number, stage: Stage): number {
  return groundHeight(pit.x, viewH, stage) + pit.depth;
}

function formatTime(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.floor(s) + "s";
}

function resolveCircleAabb(
  px: number,
  py: number,
  r: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
): { px: number; py: number; hit: boolean; top: boolean } {
  const nearX = Math.max(ox, Math.min(px, ox + ow));
  const nearY = Math.max(oy, Math.min(py, oy + oh));
  const dx = px - nearX;
  const dy = py - nearY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return { px, py, hit: false, top: false };

  const dist = Math.sqrt(distSq) || 0.001;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = r - dist;
  const top = ny < -0.45 && Math.abs(nx) < 0.85;
  return { px: px + nx * overlap, py: py + ny * overlap, hit: true, top };
}

function buildStageBackdrop(
  stage: Stage,
  width: number,
  playH: number,
  forestPal: ThemePalette,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = playH;
  const bctx = c.getContext("2d");
  if (!bctx) return c;

  const pal = themePalette(stage.theme, forestPal);
  const sky = bctx.createLinearGradient(0, 0, 0, playH);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBot);
  bctx.fillStyle = sky;
  bctx.fillRect(0, 0, width, playH);

  if (stage.theme === "space") {
    for (const star of stage.stars) {
      bctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
      bctx.fillRect(star.x * width, star.y * playH, star.size, star.size);
    }
    const earthX = width * 0.7;
    const earthY = playH * 0.28;
    const earthR = playH * 0.14;
    bctx.fillStyle = "#3a9858";
    bctx.beginPath();
    bctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = "#2a78c8";
    bctx.beginPath();
    bctx.arc(earthX - earthR * 0.2, earthY - earthR * 0.1, earthR * 0.55, 0, Math.PI * 2);
    bctx.fill();
    const sunX = width * 0.16;
    const sunY = playH * 0.16;
    const sunR = playH * 0.08;
    bctx.fillStyle = "rgba(255,220,100,0.35)";
    bctx.beginPath();
    bctx.arc(sunX, sunY, sunR * 2, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = "#ffe060";
    bctx.beginPath();
    bctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    bctx.fill();
  }

  return c;
}

function drawThemeBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  playH: number,
  camX: number,
  stage: Stage,
) {
  if (stage.backdrop) {
    ctx.drawImage(stage.backdrop, 0, 0);
  }

  if (stage.theme === "beach") {
    const horizon = playH * 0.48;
    ctx.fillStyle = "#2a90c8";
    ctx.fillRect(0, horizon, width, playH - horizon);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let w = 0; w < 2; w++) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += 18) {
        const y = horizon + 12 + w * 11 + Math.sin((x + camX * 0.35) * 0.022 + w) * 4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (stage.theme === "mountain") {
    const layers = [
      { color: "#6a7a88", parallax: 0.12, scale: 0.36 },
      { color: "#4a5a68", parallax: 0.3, scale: 0.44 },
    ];
    for (const layer of layers) {
      const baseY = playH * GROUND_Y;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, playH);
      for (let x = 0; x <= width + 2; x += 48) {
        const wx = x + camX * layer.parallax;
        const peak =
          baseY -
          playH * layer.scale * 0.26 -
          Math.abs(Math.sin(wx * 0.004 + stage.groundPhase)) * playH * layer.scale * 0.2;
        ctx.lineTo(x, peak);
      }
      ctx.lineTo(width, playH);
      ctx.closePath();
      ctx.fill();
    }
    for (const cloud of stage.clouds) {
      const cx = cloud.x - camX * 0.15;
      if (cx < -100 || cx > width + 100) continue;
      const cy = cloud.y * playH;
      const cw = cloud.w;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.48, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - cw * 0.22, cy + 5, cw * 0.28, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.26, cy + 3, cw * 0.32, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawVisibleGround(
  ctx: CanvasRenderingContext2D,
  camX: number,
  width: number,
  playH: number,
  stage: Stage,
  pal: ThemePalette,
) {
  ctx.fillStyle = pal.fairway;
  ctx.beginPath();
  ctx.moveTo(0, playH);
  const startGx = Math.floor(camX / 12) * 12;
  const endGx = camX + width + 12;
  for (let gx = startGx; gx <= endGx; gx += 12) {
    ctx.lineTo(gx - camX, groundHeight(gx, playH, stage));
  }
  ctx.lineTo(width, playH);
  ctx.closePath();
  ctx.fill();
}

function drawTerrainBlock(
  ctx: CanvasRenderingContext2D,
  sx: number,
  y: number,
  w: number,
  h: number,
  pal: ThemePalette,
  kind: "ceiling" | "bump",
) {
  ctx.fillStyle = pal.fairway;
  ctx.fillRect(sx, y, w, h);

  ctx.fillStyle = pal.fairwayStripe;
  if (kind === "ceiling") {
    for (let i = 0; i < w; i += 14) {
      ctx.fillRect(sx + i, y + 3, 7, Math.max(4, h - 8));
    }
    ctx.fillStyle = pal.rough;
    ctx.fillRect(sx, y + h - 5, w, 5);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(sx, y, w, 4);
  } else {
    for (let i = 0; i < h; i += 12) {
      ctx.fillRect(sx + 3, y + i, Math.max(4, w - 6), 5);
    }
    ctx.fillStyle = pal.rough;
    ctx.fillRect(sx, y, w, 4);
    ctx.fillRect(sx, y + h - 3, w, 3);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx, y, w, h);
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  sx: number,
  y: number,
  isDark: boolean,
  pal: ThemePalette,
) {
  if (obs.kind === "ceiling" || obs.kind === "bump") {
    drawTerrainBlock(ctx, sx, y, obs.w, obs.h, pal, obs.kind);
  } else if (obs.kind === "platform") {
    ctx.fillStyle = obs.anchor === "float" ? "#8b7355" : "#6a5540";
    ctx.fillRect(sx, y, obs.w, obs.h);
    ctx.fillStyle = obs.anchor === "float" ? "#a08b65" : "#7d6548";
    ctx.fillRect(sx, y, obs.w, 5);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, y, obs.w, obs.h);
  } else if (obs.kind === "stone") {
    const cx = sx + obs.w / 2;
    const cy = y + obs.h / 2;
    ctx.fillStyle = "#6a6a72";
    ctx.beginPath();
    ctx.ellipse(cx, cy, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a8a94";
    ctx.beginPath();
    ctx.ellipse(cx - obs.w * 0.12, cy - obs.h * 0.15, obs.w * 0.22, obs.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a4a52";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obs.kind === "tree") {
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(sx + obs.w * 0.32, y + obs.h * 0.42, obs.w * 0.36, obs.h * 0.58);
    const cx = sx + obs.w / 2;
    const foliageY = y + obs.h * 0.38;
    ctx.fillStyle = isDark ? "#2d7a42" : "#3a8a50";
    ctx.beginPath();
    ctx.moveTo(cx - obs.w * 0.9, foliageY);
    ctx.lineTo(cx, y);
    ctx.lineTo(cx + obs.w * 0.9, foliageY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = isDark ? "#358050" : "#48a060";
    ctx.beginPath();
    ctx.moveTo(cx - obs.w * 0.65, foliageY - obs.h * 0.12);
    ctx.lineTo(cx, y - obs.h * 0.08);
    ctx.lineTo(cx + obs.w * 0.65, foliageY - obs.h * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (obs.kind === "flag") {
    const groundY = y + obs.h;
    const poleX = sx + obs.w * 0.2;
    const poleTop = y + obs.h * 0.06;
    const flagW = obs.w * 0.78;
    const flagH = obs.h * 0.24;

    ctx.fillStyle = "#7a7a84";
    ctx.fillRect(poleX - 5, groundY - 6, 10, 6);

    ctx.strokeStyle = "#b8b8c0";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(poleX, groundY - 2);
    ctx.lineTo(poleX, poleTop);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(poleX, poleTop);
    ctx.lineTo(poleX + flagW, poleTop + flagH * 0.32);
    ctx.lineTo(poleX + flagW * 0.9, poleTop + flagH);
    ctx.lineTo(poleX, poleTop + flagH * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.fillStyle = isDark ? "#4a4a58" : "#7a7a88";
    ctx.fillRect(sx, y, obs.w, obs.h);
    ctx.fillStyle = isDark ? "#5a5a68" : "#9a9aa8";
    for (let row = 0; row < obs.h / 14; row++) {
      for (let col = 0; col < obs.w / 14; col++) {
        if ((row + col) % 2 === 0) {
          ctx.fillRect(sx + col * 14, y + row * 14, 12, 12);
        }
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, y, obs.w, obs.h);
  }
}

function drawStickySplatter(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number; nx: number; ny: number },
  camX: number,
) {
  const sx = bounds.x - camX;
  const sy = bounds.y;
  if (sx + bounds.w < -40 || sx > 2000) return;

  const alongX = Math.abs(bounds.ny) >= Math.abs(bounds.nx);
  const len = alongX ? bounds.w : bounds.h;
  const thick = alongX ? bounds.h : bounds.w;
  const seed = bounds.x * 0.13 + bounds.y * 0.07;

  ctx.save();
  ctx.translate(
    sx + bounds.w / 2,
    sy + bounds.h / 2,
  );
  if (!alongX) ctx.rotate(Math.PI / 2);

  const halfL = len * 0.5;
  const halfT = thick * 0.5;
  const lobes = Math.max(5, Math.floor(len / 22));

  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const t = i / lobes;
    const x = -halfL + t * len;
    const bulge =
      halfT *
      (0.72 +
        0.28 * Math.sin(t * Math.PI * 2.2 + seed) +
        0.18 * Math.sin(t * Math.PI * 5.1 + seed * 1.7));
    const y = -bulge * (0.55 + 0.45 * Math.sin(t * Math.PI));
    if (i === 0) ctx.moveTo(x, y);
    else {
      const prevT = (i - 1) / lobes;
      const prevX = -halfL + prevT * len;
      const cpx = (prevX + x) / 2;
      ctx.quadraticCurveTo(cpx, y - halfT * 0.08, x, y);
    }
  }
  for (let i = lobes; i >= 0; i--) {
    const t = i / lobes;
    const x = -halfL + t * len;
    const bulge =
      halfT *
      (0.72 +
        0.28 * Math.sin(t * Math.PI * 2.2 + seed + 1.3) +
        0.18 * Math.sin(t * Math.PI * 4.6 + seed * 0.9));
    const y = bulge * (0.55 + 0.45 * Math.sin(t * Math.PI));
    const prevT = Math.min(1, (i + 1) / lobes);
    const prevX = -halfL + prevT * len;
    const cpx = (prevX + x) / 2;
    ctx.quadraticCurveTo(cpx, y + halfT * 0.08, x, y);
  }
  ctx.closePath();

  ctx.fillStyle = "#fc03db";
  ctx.fill();
  ctx.strokeStyle = "#910f80";
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Soft inner highlight so it reads as one gooey mass
  ctx.beginPath();
  ctx.ellipse(0, -halfT * 0.15, halfL * 0.55, halfT * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,180,240,0.22)";
  ctx.fill();

  ctx.restore();
}

function drawLaserBeam(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  camX: number,
  timeMs: number,
) {
  const sx0 = x0 - camX;
  const sx1 = x1 - camX;
  if (Math.max(sx0, sx1) < -30 || Math.min(sx0, sx1) > 2000) return;

  const drawEmitter = (ex: number, ey: number) => {
    ctx.fillStyle = "#d8d8e0";
    ctx.fillRect(ex - 8, ey - 8, 16, 9);
    ctx.fillStyle = "#2a2a32";
    ctx.fillRect(ex - 8, ey + 1, 16, 9);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ex - 8, ey - 8, 16, 18);
  };

  drawEmitter(sx0, y0);
  drawEmitter(sx1, y1);

  ctx.save();
  ctx.strokeStyle = "rgba(255,40,40,0.35)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx0, y0);
  ctx.lineTo(sx1, y1);
  ctx.stroke();

  ctx.strokeStyle = "#ff3030";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(sx0, y0);
  ctx.lineTo(sx1, y1);
  ctx.stroke();

  ctx.strokeStyle = "#ffe8a0";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx0, y0);
  ctx.lineTo(sx1, y1);
  ctx.stroke();

  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const sparkCount = Math.max(3, Math.floor(len / 55));
  for (let i = 0; i < sparkCount; i++) {
    const t = (i + 0.5) / sparkCount + ((timeMs * 0.0004) % 0.2);
    const u = ((t % 1) + 1) % 1;
    const px = sx0 + (sx1 - sx0) * u;
    const py = y0 + (y1 - y0) * u;
    ctx.fillStyle = "rgba(255,240,180,0.9)";
    ctx.beginPath();
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2 + timeMs * 0.004;
      const r = a % 2 === 0 ? 5 : 2.2;
      const lx = px + Math.cos(ang) * r;
      const ly = py + Math.sin(ang) * r;
      if (a === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPortalPad(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number; nx: number; ny: number },
  color: "blue" | "orange",
  camX: number,
  timeMs: number,
) {
  const sx = rect.x - camX;
  const sy = rect.y;
  if (sx + rect.w < -40 || sx > 2000) return;

  const rgb = color === "blue" ? "46,200,255" : "255,138,26";
  const pulse = 0.55 + 0.2 * Math.sin(timeMs * 0.008);
  const glowLen = 22 + 4 * Math.sin(timeMs * 0.01);

  ctx.save();

  // Feathered outward glow (into free space along the surface normal).
  const layers = 7;
  for (let i = layers; i >= 1; i--) {
    const t = i / layers;
    const reach = glowLen * t;
    const alpha = 0.22 * (1 - t) * (1 - t) * pulse;
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    if (Math.abs(rect.ny) > Math.abs(rect.nx)) {
      // Horizontal portal on floor/ceiling
      const gy = rect.ny < 0 ? sy - reach : sy + rect.h;
      const gh = reach + rect.h * 0.35;
      ctx.beginPath();
      if (rect.ny < 0) {
        ctx.moveTo(sx, sy + rect.h * 0.5);
        ctx.quadraticCurveTo(sx + rect.w * 0.5, gy - 2, sx + rect.w, sy + rect.h * 0.5);
        ctx.lineTo(sx + rect.w, sy + rect.h);
        ctx.lineTo(sx, sy + rect.h);
      } else {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + rect.w, sy);
        ctx.lineTo(sx + rect.w, sy + rect.h * 0.5);
        ctx.quadraticCurveTo(sx + rect.w * 0.5, gy + gh + 2, sx, sy + rect.h * 0.5);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Vertical portal on walls
      const gx = rect.nx < 0 ? sx - reach : sx + rect.w;
      ctx.beginPath();
      if (rect.nx < 0) {
        ctx.moveTo(sx + rect.w * 0.5, sy);
        ctx.quadraticCurveTo(gx - 2, sy + rect.h * 0.5, sx + rect.w * 0.5, sy + rect.h);
        ctx.lineTo(sx + rect.w, sy + rect.h);
        ctx.lineTo(sx + rect.w, sy);
      } else {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + rect.w * 0.5, sy);
        ctx.quadraticCurveTo(gx + reach + 2, sy + rect.h * 0.5, sx + rect.w * 0.5, sy + rect.h);
        ctx.lineTo(sx, sy + rect.h);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // Soft bloom strips along the outward edge
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const alpha = (0.28 - t * 0.22) * pulse;
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    if (Math.abs(rect.ny) > Math.abs(rect.nx)) {
      const yy = rect.ny < 0 ? sy - 2 - i * 3.2 : sy + rect.h - 1 + i * 3.2;
      ctx.beginPath();
      ctx.ellipse(sx + rect.w / 2, yy, rect.w * (0.48 - t * 0.08), 3.5 + i * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const xx = rect.nx < 0 ? sx - 2 - i * 3.2 : sx + rect.w - 1 + i * 3.2;
      ctx.beginPath();
      ctx.ellipse(xx, sy + rect.h / 2, 3.5 + i * 1.2, rect.h * (0.48 - t * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Solid flush band on the surface
  ctx.fillStyle = `rgba(${rgb},0.95)`;
  const rr = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx + rr, sy);
  ctx.lineTo(sx + rect.w - rr, sy);
  ctx.quadraticCurveTo(sx + rect.w, sy, sx + rect.w, sy + rr);
  ctx.lineTo(sx + rect.w, sy + rect.h - rr);
  ctx.quadraticCurveTo(sx + rect.w, sy + rect.h, sx + rect.w - rr, sy + rect.h);
  ctx.lineTo(sx + rr, sy + rect.h);
  ctx.quadraticCurveTo(sx, sy + rect.h, sx, sy + rect.h - rr);
  ctx.lineTo(sx, sy + rr);
  ctx.quadraticCurveTo(sx, sy, sx + rr, sy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * pulse})`;
  if (Math.abs(rect.ny) > Math.abs(rect.nx)) {
    ctx.fillRect(sx + 4, sy + rect.h * 0.25, rect.w - 8, Math.max(1.5, rect.h * 0.35));
  } else {
    ctx.fillRect(sx + rect.w * 0.25, sy + 4, Math.max(1.5, rect.w * 0.35), rect.h - 8);
  }

  ctx.restore();
}

function drawGravityZone(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  dir: GravityDir,
  camX: number,
  timeMs: number,
) {
  const sx = rect.x - camX;
  if (sx + rect.w < -20 || sx > 2000) return;

  const r = Math.min(8, Math.min(rect.w, rect.h) * 0.12);
  ctx.save();

  // Axis-aligned frame matches the physics hit box exactly.
  ctx.beginPath();
  ctx.moveTo(sx + r, rect.y);
  ctx.lineTo(sx + rect.w - r, rect.y);
  ctx.quadraticCurveTo(sx + rect.w, rect.y, sx + rect.w, rect.y + r);
  ctx.lineTo(sx + rect.w, rect.y + rect.h - r);
  ctx.quadraticCurveTo(sx + rect.w, rect.y + rect.h, sx + rect.w - r, rect.y + rect.h);
  ctx.lineTo(sx + r, rect.y + rect.h);
  ctx.quadraticCurveTo(sx, rect.y + rect.h, sx, rect.y + rect.h - r);
  ctx.lineTo(sx, rect.y + r);
  ctx.quadraticCurveTo(sx, rect.y, sx + r, rect.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(18,28,58,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();

  const scroll = (timeMs * 0.045) % 28;
  const cols = Math.max(2, Math.ceil(rect.w / 36));
  const rows = Math.max(2, Math.ceil(rect.h / 36));
  const cellW = rect.w / cols;
  const cellH = rect.h / rows;
  const arrowSize = Math.min(7, Math.min(cellW, cellH) * 0.28);

  ctx.fillStyle = "rgba(220,228,240,0.38)";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const stagger = (row % 2) * 0.5;
      let ax = sx + (col + 0.5 + stagger * 0.15) * cellW;
      let ay = rect.y + (row + 0.5) * cellH;

      if (dir === "up") ay -= scroll * 0.35;
      else if (dir === "down") ay += scroll * 0.35;
      else if (dir === "left") ax -= scroll * 0.35;
      else ax += scroll * 0.35;

      // Wrap within the zone so density stays even.
      while (ax < sx) ax += rect.w;
      while (ax > sx + rect.w) ax -= rect.w;
      while (ay < rect.y) ay += rect.h;
      while (ay > rect.y + rect.h) ay -= rect.h;

      ctx.beginPath();
      if (dir === "up") {
        ctx.moveTo(ax, ay - arrowSize);
        ctx.lineTo(ax + arrowSize * 0.75, ay + arrowSize * 0.65);
        ctx.lineTo(ax - arrowSize * 0.75, ay + arrowSize * 0.65);
      } else if (dir === "down") {
        ctx.moveTo(ax, ay + arrowSize);
        ctx.lineTo(ax + arrowSize * 0.75, ay - arrowSize * 0.65);
        ctx.lineTo(ax - arrowSize * 0.75, ay - arrowSize * 0.65);
      } else if (dir === "left") {
        ctx.moveTo(ax - arrowSize, ay);
        ctx.lineTo(ax + arrowSize * 0.65, ay + arrowSize * 0.75);
        ctx.lineTo(ax + arrowSize * 0.65, ay - arrowSize * 0.75);
      } else {
        ctx.moveTo(ax + arrowSize, ay);
        ctx.lineTo(ax - arrowSize * 0.65, ay + arrowSize * 0.75);
        ctx.lineTo(ax - arrowSize * 0.65, ay - arrowSize * 0.75);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawStageElements(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  playH: number,
  camX: number,
  timeMs: number,
) {
  for (const el of stage.elements) {
    if (el.kind === "sticky") {
      const bounds = stickyWorldBounds(el, playH, stage);
      if (bounds) drawStickySplatter(ctx, bounds, camX);
    } else if (el.kind === "laser") {
      const ends = laserEndpoints(el, playH, stage);
      if (ends) drawLaserBeam(ctx, ends.x0, ends.y0, ends.x1, ends.y1, camX, timeMs);
    } else if (el.kind === "portal") {
      const blue = portalWorldRect(el.blue, playH, stage);
      const orange = portalWorldRect(el.orange, playH, stage);
      if (blue) drawPortalPad(ctx, blue, "blue", camX, timeMs);
      if (orange) drawPortalPad(ctx, orange, "orange", camX, timeMs);
    } else if (el.kind === "gravity") {
      drawGravityZone(ctx, gravityZoneRect(el, playH, stage), el.dir, camX, timeMs);
    }
  }
}

/** Flappy Golf 2 style: flap left/right, 3 random stages with one hole each. */
export function TipTopGame({ width, height, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();
  const btnRef = useRef({ left: false, right: false });
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;

  useEffect(() => {
    const p = paletteRef.current.tiptop;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;

    const ballR = 11;
    const btnH = 56;

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
      return { width: w, height: h, playH: h - btnH - 8, btnH };
    };

    const { width: initW, playH: initPlayH } = (() => {
      const { width: w, height: h } = sizeRef.current;
      return { width: w, playH: h - btnH - 8 };
    })();

    resizeCanvas(sizeRef.current.width, sizeRef.current.height);

    const stages = generateStages((Date.now() ^ (initW * 7919)) >>> 0);
    const forestPal: ThemePalette = {
      skyTop: p.skyTop,
      skyBot: p.skyBot,
      rough: p.rough,
      fairway: p.fairway,
      fairwayStripe: p.fairwayStripe,
      cup: p.cup,
      cupInner: p.cupInner,
    };
    const rebuildBackdrops = (w: number, playH: number) => {
      for (const stage of stages) {
        stage.backdrop = buildStageBackdrop(stage, w, playH, forestPal);
      }
    };
    rebuildBackdrops(initW, initPlayH);
    const themePals = stages.map((s) => themePalette(s.theme, forestPal));
    let stageIndex = 0;
    let stageFlaps = 0;
    let totalFlaps = 0;
    let stageStartTime = performance.now();
    let gameStartTime = stageStartTime;
    let clearFrames = 0;

    let px = 120;
    let py = initPlayH * 0.35;
    let vx = 0;
    let vy = 0;
    let alive = true;
    let renderCamX = 0;
    let stuck: { nx: number; ny: number } | null = null;
    let stickyImmune = 0;
    let portalCooldown = 0;
    const flapImpacts: FlapImpact[] = [];
    const ballTrail: TrailPoint[] = [];
    const fadingTrails: FadingTrail[] = [];
    let lastFrameTime = performance.now();
    let physicsAccum = 0;
    let prevPx = px;
    let prevPy = py;

    const currentStage = () => stages[stageIndex];
    const currentPit = () => currentStage().pit;
    const worldW = () => currentStage().worldW;

    const resetBall = () => {
      const { playH } = getLayout();
      px = 120;
      py = playH * 0.35;
      vx = 0;
      vy = 0;
      renderCamX = 0;
      stuck = null;
      stickyImmune = 0;
      portalCooldown = 0;
      ballTrail.length = 0;
      fadingTrails.length = 0;
    };

    const finishRun = (cleared: boolean) => {
      alive = false;
      const flaps = totalFlaps + stageFlaps;
      const totalTimeMs = performance.now() - gameStartTime;
      const score = scoreTipTop(flaps, totalTimeMs, cleared);
      onGameOverRef.current({
        score,
        title: cleared ? "Course complete!" : "Game over",
        stats: [
          { label: "Flaps", value: String(flaps) },
          { label: "Time", value: formatRaceTime(totalTimeMs) },
        ],
      });
    };

    const advanceStage = () => {
      totalFlaps += stageFlaps;
      if (stageIndex >= STAGE_COUNT - 1) {
        finishRun(true);
        return;
      }
      stageIndex++;
      stageFlaps = 0;
      stageStartTime = performance.now();
      resetBall();
      clearFrames = 0;
    };

    const flap = (dir: -1 | 1) => {
      if (!alive || clearFrames > 0) return;
      unlockGameAudio();
      stageFlaps++;
      if (stuck) stickyImmune = STICKY_ESCAPE_FRAMES;
      stuck = null;
      const angle = dir < 0 ? Math.PI - FLAP_ANGLE : FLAP_ANGLE;
      const forceX = Math.cos(angle);
      const forceY = -Math.sin(angle);
      vx += forceX * FLAP_POWER;
      vy += forceY * FLAP_POWER;
      const maxSpd = 14;
      const sp = Math.hypot(vx, vy);
      if (sp > maxSpd) {
        vx = (vx / sp) * maxSpd;
        vy = (vy / sp) * maxSpd;
      }
      const impactDir = flapImpactDirection(
        forceX,
        forceY,
        Math.hypot(vx, vy),
        maxSpd,
        FLAP_IMPACT_TUNING.speedFlatness,
      );
      flapImpacts.push({ forceX: impactDir.x, forceY: impactDir.y, ageMs: 0 });
      playTipTopFlap();
    };

    const hitBtn = (
      x: number,
      y: number,
      b: { x: number; y: number; w: number; h: number },
    ) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    const getButtons = () => {
      const { width, playH, btnH: bh } = getLayout();
      return {
        left: { x: 12, y: playH + 10, w: width / 2 - 18, h: bh - 12 },
        right: { x: width / 2 + 6, y: playH + 10, w: width / 2 - 18, h: bh - 12 },
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const { width, playH } = getLayout();
      const { left: leftBtn, right: rightBtn } = getButtons();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (hitBtn(x, y, leftBtn)) {
        btnRef.current.left = true;
        flap(-1);
      } else if (hitBtn(x, y, rightBtn)) {
        btnRef.current.right = true;
        flap(1);
      } else if (y < playH) {
        flap(x < width / 2 ? -1 : 1);
      }
    };
    const onPointerUp = () => {
      btnRef.current.left = false;
      btnRef.current.right = false;
    };

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        e.preventDefault();
        flap(-1);
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        e.preventDefault();
        flap(1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let lastPlayH = initPlayH;
    let lastWidth = initW;

    const syncLayout = () => {
      const layout = getLayout();
      resizeCanvas(layout.width, layout.height);
      if (layout.playH !== lastPlayH || layout.width !== lastWidth) {
        rebuildBackdrops(layout.width, layout.playH);
        lastPlayH = layout.playH;
        lastWidth = layout.width;
      }
      return layout;
    };

    const stepPhysics = (stepDt: number): boolean => {
      const { playH } = getLayout();
      const stage = currentStage();
      const pit = currentPit();
      const ww = worldW();

      if (portalCooldown > 0) portalCooldown -= stepDt;
      if (stickyImmune > 0) stickyImmune -= stepDt;

      if (stuck) {
        vx = 0;
        vy = 0;
      } else {
        let gx = 0;
        let gy = stage.gravity;
        for (const el of stage.elements) {
          if (el.kind !== "gravity") continue;
          const rect = gravityZoneRect(el, playH, stage);
          if (!pointInRect(px, py, rect.x, rect.y, rect.w, rect.h)) continue;
          if (el.dir === "up") gy -= GRAVITY_ZONE_FORCE;
          else if (el.dir === "down") gy += GRAVITY_ZONE_FORCE;
          else if (el.dir === "left") gx -= GRAVITY_ZONE_FORCE;
          else gx += GRAVITY_ZONE_FORCE;
        }
        vy += gy * stepDt;
        vx += gx * stepDt;
        vx *= frameDecay(0.996, stepDt);
        vy *= frameDecay(0.9992, stepDt);
        px += vx * stepDt;
        py += vy * stepDt;
      }

      if (px < ballR) {
        px = ballR;
        if (vx < 0) vx = -vx * 0.3;
      }
      if (px > ww - ballR) {
        px = ww - ballR;
        if (vx > 0) vx = -vx * 0.3;
      }

      for (const el of stage.elements) {
        if (el.kind !== "laser") continue;
        const ends = laserEndpoints(el, playH, stage);
        if (!ends) continue;
        if (circleHitsSegment(px, py, ballR, ends.x0, ends.y0, ends.x1, ends.y1)) {
          resetBall();
          return false;
        }
      }

      if (!stuck && portalCooldown <= 0) {
        for (const el of stage.elements) {
          if (el.kind !== "portal") continue;
          const blue = portalWorldRect(el.blue, playH, stage);
          const orange = portalWorldRect(el.orange, playH, stage);
          if (!blue || !orange) continue;

          const hitBlue = circleHitsAabb(px, py, ballR + 4, blue.x, blue.y, blue.w, blue.h);
          const hitOrange = circleHitsAabb(px, py, ballR + 4, orange.x, orange.y, orange.w, orange.h);
          if (!hitBlue && !hitOrange) continue;

          const exit = hitBlue ? el.orange : el.blue;
          const exitRect = hitBlue ? orange : blue;
          const speed = Math.hypot(vx, vy);
          const exitSpeed = Math.max(4.5, speed);
          splitTrailOnPortal(ballTrail, fadingTrails);
          px = exitRect.x + exitRect.w / 2 + exit.nx * (ballR + 6);
          py = exitRect.y + exitRect.h / 2 + exit.ny * (ballR + 6);
          vx = exit.nx * exitSpeed;
          vy = exit.ny * exitSpeed;
          if (Math.abs(exit.nx) < 0.1) vx *= 0.35;
          if (Math.abs(exit.ny) < 0.1) vy *= 0.35;
          portalCooldown = PORTAL_COOLDOWN_FRAMES;
          stuck = null;
          break;
        }
      }

      let onGround = false;
      let overPit = false;

      if (!stuck) {
        for (const obs of stage.obstacles) {
          const oy = obstacleY(obs, playH, stage);
          if (obs.kind === "stone") {
            const cx = obs.x + obs.w / 2;
            const cy = oy + obs.h / 2;
            const cr = Math.min(obs.w, obs.h) / 2;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.hypot(dx, dy);
            if (dist < ballR + cr) {
              const nx = dx / (dist || 1);
              const ny = dy / (dist || 1);
              const overlap = ballR + cr - dist;
              px += nx * overlap;
              py += ny * overlap;
              const dot = vx * nx + vy * ny;
              if (dot < 0) {
                vx -= nx * dot * 1.4;
                vy -= ny * dot * 1.4;
              }
              vx *= 0.82;
              vy *= 0.82;
            }
          } else {
            const res = resolveCircleAabb(px, py, ballR, obs.x, oy, obs.w, obs.h);
            if (res.hit) {
              px = res.px;
              py = res.py;
              if (res.top && vy >= -1) {
                vy = Math.min(0, vy * -0.2);
                vx *= 0.9;
                onGround = true;
              } else {
                vx *= -0.5;
                vy *= -0.4;
              }
            }
          }
        }
      }

      if (stickyImmune <= 0) {
        for (const el of stage.elements) {
          if (el.kind !== "sticky") continue;
          const bounds = stickyWorldBounds(el, playH, stage);
          if (!bounds) continue;
          if (!circleHitsAabb(px, py, ballR, bounds.x, bounds.y, bounds.w, bounds.h)) continue;
          stuck = { nx: bounds.nx, ny: bounds.ny };
          px = Math.max(bounds.x + ballR * 0.2, Math.min(bounds.x + bounds.w - ballR * 0.2, px));
          py = Math.max(bounds.y + ballR * 0.2, Math.min(bounds.y + bounds.h - ballR * 0.2, py));
          if (bounds.nx !== 0) {
            px = bounds.nx < 0 ? bounds.x - ballR * 0.15 : bounds.x + bounds.w + ballR * 0.15;
          } else {
            py = bounds.ny < 0 ? bounds.y - ballR * 0.15 : bounds.y + bounds.h + ballR * 0.15;
          }
          vx = 0;
          vy = 0;
          onGround = true;
          break;
        }
      }

      const gY = groundHeight(px, playH, stage);
      const half = pit.width / 2;
      const rimY = groundHeight(pit.x, playH, stage);
      const overlapsPit = ballOverlapsPitX(px, ballR, pit);

      if (px > pit.x - half - ballR && px < pit.x + half + ballR) {
        overPit = true;
      }

      const surface = pitSurfaceY(pit, px, playH, stage);
      const bottomY = pitBottomY(pit, playH, stage);
      const nearLip =
        Math.abs(px - (pit.x - half)) < ballR + 4 || Math.abs(px - (pit.x + half)) < ballR + 4;

      if (!stuck) {
        if (pit.scored) {
          if (overlapsPit && surface !== null && py + ballR >= surface - 2) {
            py = surface - ballR;
            vy *= 0.15;
            vx *= 0.7;
            onGround = true;
          }
        } else if (overlapsPit && surface !== null) {
          if (py + ballR >= surface - 8) {
            const nearBottom = py + ballR >= bottomY - 28;
            const settled =
              nearBottom &&
              Math.abs(vy) < 22 &&
              Math.abs(vx) < 18;
            if (settled) {
              pit.scored = true;
              vy = 0;
              vx *= 0.15;
              py = surface - ballR;
              onGround = true;
              clearFrames = STAGE_CLEAR_FRAMES;
              playTipTopHoleIn();
            } else {
              py = surface - ballR;
              vy *= -0.15;
              vx *= 0.9;
              onGround = true;
            }
          }
        } else if (!overlapsPit && nearLip && py + ballR >= rimY - ballR * 0.5) {
          const lip = px < pit.x ? pit.x - half : pit.x + half;
          const nx = px < pit.x ? -1 : 1;
          if (Math.abs(px - lip) < ballR + 6) {
            px = lip + nx * (ballR + 2);
            vx = nx * Math.max(2.5, Math.abs(vx) * 0.7);
            vy = -Math.abs(vy) * 0.4 - 2;
          }
        }

        if (!onGround && !overPit && py + ballR >= gY) {
          py = gY - ballR;
          vy *= -0.35;
          vx *= 0.92;
          if (Math.abs(vy) < 0.8 && Math.abs(vx) < 0.5) vy = 0;
        }

        if (py < ballR) {
          py = ballR;
          vy = Math.abs(vy) * 0.4;
        }
      }

      if (py > playH + 80) {
        finishRun(false);
        return true;
      }
      return false;
    };

    let raf = 0;

    const loop = (now: number) => {
      if (!alive) return;

      const deltaMs = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;
      const dt = frameScale(deltaMs);
      const { width, height, playH } = syncLayout();
      const palette = paletteRef.current;
      const p = palette.tiptop;

      for (let i = flapImpacts.length - 1; i >= 0; i--) {
        flapImpacts[i].ageMs += deltaMs;
        if (flapImpacts[i].ageMs >= FLAP_IMPACT_TUNING.durationMs) flapImpacts.splice(i, 1);
      }

      const stage = currentStage();
      const pit = currentPit();
      const ww = worldW();

      let camX = renderCamX;
      let renderPx = px;
      let renderPy = py;

      if (clearFrames > 0) {
        clearFrames -= dt;
        if (clearFrames <= 0) advanceStage();
        const targetCamX = Math.max(0, Math.min(ww - width, px - width * 0.38));
        renderCamX += (targetCamX - renderCamX) * Math.min(1, 0.1 + dt * 0.12);
        camX = renderCamX;
      } else {
        physicsAccum += dt;
        let steps = 0;
        while (physicsAccum >= 1 && steps < MAX_PHYSICS_STEPS) {
          prevPx = px;
          prevPy = py;
          if (stepPhysics(1)) return;
          physicsAccum -= 1;
          steps++;
        }
        if (steps >= MAX_PHYSICS_STEPS) physicsAccum = 0;

        if (physicsAccum > 0 && steps === 0) {
          renderPx = px + vx * physicsAccum;
          renderPy = py + vy * physicsAccum;
        } else {
          renderPx = renderLerp(prevPx, px, physicsAccum);
          renderPy = renderLerp(prevPy, py, physicsAccum);
        }

        const targetCamX = Math.max(0, Math.min(ww - width, renderPx - width * 0.38));
        renderCamX += (targetCamX - renderCamX) * Math.min(1, 0.1 + dt * 0.12);
        camX = renderCamX;
      }

      updateBallTrail(ballTrail, renderPx, renderPy, Math.hypot(vx, vy), BALL_TRAIL_TUNING);
      ageFadingTrails(fadingTrails, deltaMs, BALL_TRAIL_TUNING);

      const pal = themePals[stageIndex];

      drawThemeBackdrop(ctx, width, playH, camX, stage);
      drawVisibleGround(ctx, camX, width, playH, stage, pal);

      for (const obs of stage.obstacles) {
        const osx = obs.x - camX;
        if (osx + obs.w < -60 || osx > width + 60) continue;
        drawObstacle(ctx, obs, osx, obstacleY(obs, playH, stage), palette.isDark, pal);
      }

      drawStageElements(ctx, stage, playH, camX, now);

      const sx = pit.x - camX;
      if (sx >= -80 && sx <= width + 80) {
        const rimY = groundHeight(pit.x, playH, stage);
        const halfW = pit.width / 2;

        ctx.fillStyle = pal.cupInner;
        ctx.beginPath();
        ctx.moveTo(sx - halfW, rimY);
        for (let i = 0; i <= pit.width; i += 8) {
          const gx = pit.x - halfW + i;
          const sy = pitSurfaceY(pit, gx, playH, stage) ?? rimY;
          ctx.lineTo(sx - halfW + i, sy);
        }
        ctx.lineTo(sx + halfW, rimY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = pal.cup;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx - halfW, rimY, 4, 0, Math.PI * 2);
        ctx.arc(sx + halfW, rimY, 4, 0, Math.PI * 2);
        ctx.stroke();

        if (!pit.scored) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, rimY - 8);
          ctx.lineTo(sx, rimY - 44);
          ctx.stroke();
          ctx.fillStyle = "#ff5a5a";
          ctx.fillRect(sx, rimY - 44, 16, 11);
        }
      }

      const bsx = renderPx - camX;
      const bsy = renderPy;
      drawBallTrail(ctx, ballTrail, camX, ballR, BALL_TRAIL_TUNING);
      for (const fading of fadingTrails) {
        drawBallTrail(ctx, fading.points, camX, ballR, BALL_TRAIL_TUNING, fading.fade);
      }
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(bsx + 2, groundHeight(renderPx, playH, stage) + 3, ballR, ballR * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.ball;
      ctx.beginPath();
      ctx.arc(bsx, bsy, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (const impact of flapImpacts) {
        const progress = impact.ageMs / FLAP_IMPACT_TUNING.durationMs;
        drawFlapImpact(
          ctx,
          bsx,
          bsy,
          ballR,
          impact.forceX,
          impact.forceY,
          progress,
          FLAP_IMPACT_TUNING,
        );
      }

      const stageElapsed = performance.now() - stageStartTime;
      ctx.fillStyle = p.hud;
      ctx.font = "bold 18px Nunito, sans-serif";
      ctx.fillText(`Stage ${stageIndex + 1}/${STAGE_COUNT} · ${THEME_LABELS[stage.theme]}`, 14, 26);
      ctx.font = "bold 15px Nunito, sans-serif";
      ctx.fillText(`Flaps: ${stageFlaps}`, 14, 48);
      ctx.fillText(`Time: ${formatTime(stageElapsed)}`, 14, 68);

      if (clearFrames > 0) {
        ctx.fillStyle = palette.isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)";
        ctx.fillRect(0, 0, width, playH);
        ctx.fillStyle = p.hud;
        ctx.font = "bold 26px Nunito, sans-serif";
        ctx.textAlign = "center";
        const msg =
          stageIndex >= STAGE_COUNT - 1 ? "Course complete!" : `Stage ${stageIndex + 1} cleared!`;
        ctx.fillText(msg, width / 2, playH * 0.42);
        ctx.font = "bold 15px Nunito, sans-serif";
        ctx.fillText(`${stageFlaps} flaps · ${formatTime(stageElapsed)}`, width / 2, playH * 0.48);
        ctx.textAlign = "left";
      }

      const { left: leftBtn, right: rightBtn } = getButtons();
      const drawBtn = (
        b: { x: number; y: number; w: number; h: number },
        label: string,
        active: boolean,
      ) => {
        ctx.fillStyle = active ? "rgba(92, 208, 168, 0.55)" : "rgba(255,255,255,0.18)";
        ctx.strokeStyle = active ? "#5cd0a8" : "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = palette.isDark ? "#fff" : p.hud;
        ctx.font = "bold 15px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 5);
        ctx.textAlign = "left";
      };

      ctx.fillStyle = palette.isDark ? "rgba(0,0,0,0.35)" : "rgba(238,240,243,0.9)";
      ctx.fillRect(0, playH, width, height - playH);
      drawBtn(leftBtn, "◀ Flap", btnRef.current.left || keys.has("ArrowLeft") || keys.has("KeyA"));
      drawBtn(rightBtn, "Flap ▶", btnRef.current.right || keys.has("ArrowRight") || keys.has("KeyD"));

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
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
