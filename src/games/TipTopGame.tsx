import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import { formatRaceTime, scoreTipTop, type GameResult } from "./gameResult";
import { playTipTopFlap, playTipTopHoleIn, unlockGameAudio } from "./gameAudio";

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

type ObstacleKind = "platform" | "stone" | "tree" | "wall" | "flag";

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  w: number;
  h: number;
  /** Ground-anchored, or floating above terrain. */
  anchor: "ground" | "float";
  floatAbove: number;
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

interface Stage {
  worldW: number;
  pit: Pit;
  groundPhase: number;
  groundAmp: number;
  obstacles: Obstacle[];
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

/** White tangential hit flash after a flap — tune `size` and `alpha`. */
const FLAP_IMPACT_TUNING = {
  size: 4.0,
  alpha: 0.52,
  durationMs: 200,
  /** 1 = fully horizontal at max speed; lower = less speed influence on angle. */
  speedFlatness: 1.0,
};

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

function generateObstacles(
  rand: () => number,
  worldW: number,
  pitX: number,
  pitW: number,
  theme: StageTheme,
): Obstacle[] {
  const kinds: ObstacleKind[] = ["platform", "stone", "tree", "wall"];
  const count = 3 + Math.floor(rand() * 4);
  const obstacles: Obstacle[] = [];

  for (let n = 0; n < count; n++) {
    let kind = kinds[Math.floor(rand() * kinds.length)];
    if (theme === "space" && kind === "tree") kind = "flag";
    let placed = false;

    for (let attempt = 0; attempt < 24; attempt++) {
      let x = 280 + Math.floor(rand() * (worldW - 380));
      let w = 0;
      let h = 0;
      let anchor: "ground" | "float" = "ground";
      let floatAbove = 0;

      if (kind === "platform") {
        w = 90 + Math.floor(rand() * 70);
        h = 16 + Math.floor(rand() * 10);
        anchor = rand() > 0.35 ? "float" : "ground";
        floatAbove = anchor === "float" ? 55 + Math.floor(rand() * 90) : 0;
        if (anchor === "ground") h = 22 + Math.floor(rand() * 18);
      } else if (kind === "stone") {
        w = 38 + Math.floor(rand() * 34);
        h = w * (0.75 + rand() * 0.35);
      } else if (kind === "tree") {
        w = 24 + Math.floor(rand() * 16);
        h = 72 + Math.floor(rand() * 48);
      } else if (kind === "flag") {
        w = 34 + Math.floor(rand() * 22);
        h = 78 + Math.floor(rand() * 44);
      } else {
        w = 18 + Math.floor(rand() * 14);
        h = 58 + Math.floor(rand() * 52);
      }

      if (x + w > worldW - 40) x = worldW - w - 40;
      if (x < 240) continue;
      if (overlapsPit(x, w, pitX, pitW)) continue;

      const overlaps = obstacles.some(
        (o) => x < o.x + o.w + 50 && x + w + 50 > o.x,
      );
      if (overlaps) continue;

      obstacles.push({ kind, x, w, h, anchor, floatAbove });
      placed = true;
      break;
    }

    if (!placed && n < count - 1) n--;
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
  const worldW = 1800 + Math.floor(rand() * 1400);
  const pitX = 520 + Math.floor(rand() * (worldW - 720));
  const pitW = 58 + Math.floor(rand() * 22);
  const theme = STAGE_THEMES[Math.floor(rand() * STAGE_THEMES.length)];
  const pit = {
    x: pitX,
    width: pitW,
    depth: 48 + Math.floor(rand() * 18),
    scored: false,
  };
  const decor = generateThemeDecor(rand, theme, worldW);
  return {
    worldW,
    pit,
    groundPhase: rand() * Math.PI * 2,
    groundAmp: 10 + rand() * 14,
    obstacles: generateObstacles(rand, worldW, pitX, pitW, theme),
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
  const startGx = Math.floor(camX / 20) * 20;
  const endGx = camX + width + 20;
  for (let gx = startGx; gx <= endGx; gx += 20) {
    ctx.lineTo(gx - camX, groundHeight(gx, playH, stage));
  }
  ctx.lineTo(width, playH);
  ctx.closePath();
  ctx.fill();
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  sx: number,
  y: number,
  isDark: boolean,
) {
  if (obs.kind === "platform") {
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

/** Flappy Golf 2 style: flap left/right, 3 random stages with one hole each. */
export function TipTopGame({ width, height, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();
  const btnRef = useRef({ left: false, right: false });

  useEffect(() => {
    const p = palette.tiptop;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const ballR = 11;
    const btnH = 56;
    const playH = height - btnH - 8;

    const stages = generateStages((Date.now() ^ (width * 7919)) >>> 0);
    const forestPal: ThemePalette = {
      skyTop: p.skyTop,
      skyBot: p.skyBot,
      rough: p.rough,
      fairway: p.fairway,
      fairwayStripe: p.fairwayStripe,
      cup: p.cup,
      cupInner: p.cupInner,
    };
    for (const stage of stages) {
      stage.backdrop = buildStageBackdrop(stage, width, playH, forestPal);
    }
    const themePals = stages.map((s) => themePalette(s.theme, forestPal));
    let stageIndex = 0;
    let stageFlaps = 0;
    let totalFlaps = 0;
    let stageStartTime = performance.now();
    let gameStartTime = stageStartTime;
    let clearFrames = 0;

    let px = 120;
    let py = playH * 0.35;
    let vx = 0;
    let vy = 0;
    let alive = true;
    let camX = 0;
    const flapImpacts: FlapImpact[] = [];
    let lastFrameTime = performance.now();

    const currentStage = () => stages[stageIndex];
    const currentPit = () => currentStage().pit;
    const worldW = () => currentStage().worldW;

    const resetBall = () => {
      px = 120;
      py = playH * 0.35;
      vx = 0;
      vy = 0;
      camX = 0;
    };

    const finishRun = (cleared: boolean) => {
      alive = false;
      const flaps = totalFlaps + stageFlaps;
      const totalTimeMs = performance.now() - gameStartTime;
      const score = scoreTipTop(flaps, totalTimeMs, cleared);
      onGameOver({
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

    const leftBtn = { x: 12, y: playH + 10, w: width / 2 - 18, h: btnH - 12 };
    const rightBtn = { x: width / 2 + 6, y: playH + 10, w: width / 2 - 18, h: btnH - 12 };

    const hitBtn = (x: number, y: number, b: typeof leftBtn) =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    const onPointerDown = (e: PointerEvent) => {
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

    let raf = 0;

    const loop = () => {
      if (!alive) return;

      const now = performance.now();
      const dt = Math.min(32, now - lastFrameTime);
      lastFrameTime = now;

      for (let i = flapImpacts.length - 1; i >= 0; i--) {
        flapImpacts[i].ageMs += dt;
        if (flapImpacts[i].ageMs >= FLAP_IMPACT_TUNING.durationMs) flapImpacts.splice(i, 1);
      }

      const stage = currentStage();
      const pit = currentPit();
      const ww = worldW();

      if (clearFrames > 0) {
        clearFrames--;
        if (clearFrames === 0) advanceStage();
      } else {
        vy += stage.gravity;
        vx *= 0.996;
        vy *= 0.9992;
        px += vx;
        py += vy;

        if (px < ballR) {
          px = ballR;
          vx = Math.abs(vx) * 0.3;
        }
        if (px > ww - ballR) px = ww - ballR;

        let onGround = false;
        let overPit = false;

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

        if (py > playH + 80) {
          finishRun(false);
          return;
        }
      }

      camX = Math.max(0, Math.min(ww - width, px - width * 0.38));

      const pal = themePals[stageIndex];

      drawThemeBackdrop(ctx, width, playH, camX, stage);
      drawVisibleGround(ctx, camX, width, playH, stage, pal);

      for (const obs of stage.obstacles) {
        const osx = obs.x - camX;
        if (osx + obs.w < -60 || osx > width + 60) continue;
        drawObstacle(ctx, obs, osx, obstacleY(obs, playH, stage), palette.isDark);
      }

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

      const bsx = px - camX;
      const bsy = py;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(bsx + 2, groundHeight(px, playH, stage) + 3, ballR, ballR * 0.35, 0, 0, Math.PI * 2);
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

      const drawBtn = (b: typeof leftBtn, label: string, active: boolean) => {
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
  }, [width, height, onGameOver, palette]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none select-none"
      style={{ width, height }}
    />
  );
}
