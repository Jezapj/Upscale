import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import {
  playSampleOneShot,
  preloadSamples,
  SAMPLE_SRC,
  unlockGameAudio,
} from "./gameAudio";
import { canvasDpr, frameDecay, frameScale } from "./gameLoop";
import type { PlayMode } from "./GameShell";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
  paused?: boolean;
  /** Rocket spawn pattern seed (daily challenge). */
  seed?: number;
  playMode: PlayMode;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rocket {
  x: number;
  y: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Gravity currently pulls this rocket upward (portal flip active). */
  inverted: boolean;
  /**
   * Extra inverted-gravity strength right after a flip, decaying
   * exponentially back to 0 so rockets brake hard instead of sinking deep.
   */
  brake: number;
  /** Render rotation, smoothed towards the velocity direction. */
  rot: number;
  /** Flame flicker phase offset. */
  phase: number;
  warned: boolean;
  smokeAcc: number;
  /** Time since launch, in milliseconds. */
  ageMs: number;
}

interface Portal {
  cx: number;
  cy: number;
  /** Angle of the traced line in radians. */
  angle: number;
  halfLen: number;
  life: number;
  maxLife: number;
  /** Frames of rim pulse after a rocket flips through. */
  pulse: number;
  /** Particle orbit phase so portals don't sparkle in sync. */
  spin: number;
  /** Life drain multiplier (>1 when evicted by a newer portal). */
  decayRate: number;
  /** Flip strength multiplier; smaller portals redirect harder. */
  boost: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Star {
  x: number;
  y: number;
  r: number;
  speed: number;
  tw: number;
}

const DAILY_DURATION_MS = 30_000;
/** Gravity flips back to normal once a rising rocket clears this screen fraction. */
const INVERT_RELEASE_FRAC = 0.47;
const MAX_PORTALS = 3;
const MIN_TRACE_LEN = 34;
/** Launch bays across the top station. */
const BAY_COUNT = 5;
/** Max launch tilt from straight down (45 degrees). */
const LAUNCH_SPREAD = Math.PI / 4;
/** Post-flip gravity boost: inverted g is multiplied by (1 + BRAKE_MAX * brake). */
const BRAKE_MAX = 5;
/** Per-frame exponential decay of the post-flip brake. */
const BRAKE_DECAY = 0.94;
/** How long a bay stays destroyed after a rocket is flipped back into it. */
const BAY_DOWN_MS = 8000;
/** Half-width of a launch-bay hit box (world units). */
const BAY_HIT_HALF = 42;
/** Rockets self-destruct after this many milliseconds in play. */
const ROCKET_LIFETIME_MS = 8000;
/** No portals above this screen fraction (dotted limit line). */
const PORTAL_CEILING_FRAC = 0.32;
/** Max portal half-length as a fraction of screen width (full span = half screen). */
const PORTAL_MAX_HALF_FRAC = 0.25;
/** Evicted portals (4th drawn) rush through their remaining colors this much faster. */
const EVICT_DECAY_RATE = 9;
/** Rockets falling slower than this at flip time get the base upward kick. */
const SLOW_FLIP_THRESHOLD = 2.4;
/** Base upward velocity granted to slow rockets so they never keep sinking. */
const BASE_FLIP_RISE = 2.4;

/** Portal color over its lifetime: cyan → blue → orange → orange-red. */
const PORTAL_LIFE_STOPS: [number, number, number][] = [
  [110, 231, 255], // cyan (fresh)
  [74, 141, 255], // blue
  [255, 158, 66], // orange
  [255, 82, 48], // orange-red (about to close)
];

function portalLifeRgb(lifeFrac: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, 1 - lifeFrac)) * (PORTAL_LIFE_STOPS.length - 1);
  const i = Math.min(PORTAL_LIFE_STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = PORTAL_LIFE_STOPS[i];
  const b = PORTAL_LIFE_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function portalLifeColor(lifeFrac: number, alpha = 1): string {
  const [r, g, b] = portalLifeRgb(lifeFrac);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const FLIP_SFX = "/tapchime4high.mp3";
const PLACE_SFX = "/tapchime.mp3";

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when segment a1-a2 crosses segment b1-b2. */
function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const d1x = ax2 - ax1;
  const d1y = ay2 - ay1;
  const d2x = bx2 - bx1;
  const d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return false;
  const t = ((bx1 - ax1) * d2y - (by1 - ay1) * d2x) / denom;
  const u = ((bx1 - ax1) * d1y - (by1 - ay1) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Spacewalk: rockets are launched down from the station; trace a line to open
 * a gravity portal that flips falling rockets back upward. The deeper a rocket
 * falls before flipping, the higher it climbs. Survive the timer (daily) or
 * hold out as gravity ramps up (endless).
 */
export function SpacewalkGame({
  width,
  height,
  onGameOver,
  paused = false,
  seed,
  playMode,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);
  const pausedRef = useRef(paused);
  const seedRef = useRef(seed);
  const modeRef = useRef(playMode);

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;
  pausedRef.current = paused;
  seedRef.current = seed;
  modeRef.current = playMode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    unlockGameAudio();
    preloadSamples(
      FLIP_SFX,
      PLACE_SFX,
      SAMPLE_SRC.octaneWarning,
      SAMPLE_SRC.octaneHit,
      SAMPLE_SRC.tipTopComplete,
    );

    const logo = new Image();
    logo.src = "/Upscale.png";
    let logoReady = false;
    logo.onload = () => {
      logoReady = true;
    };

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

    const daily = modeRef.current === "daily";
    const rng =
      seedRef.current !== undefined
        ? mulberry32(seedRef.current)
        : mulberry32((Date.now() & 0xffffffff) >>> 0);
    // Decorations use their own stream so they never disturb spawn determinism.
    const decoRng = mulberry32(((seedRef.current ?? Date.now()) ^ 0x51ab7e2d) >>> 0);

    const stars: Star[] = Array.from({ length: 80 }, () => ({
      x: decoRng(),
      y: decoRng(),
      r: 0.6 + decoRng() * 1.5,
      speed: 2 + decoRng() * 7,
      tw: decoRng() * Math.PI * 2,
    }));

    const rockets: Rocket[] = [];
    const portals: Portal[] = [];
    const particles: Particle[] = [];

    let alive = true;
    let ended = false;
    let elapsedMs = 0;
    let flips = 0;
    let portalsDrawn = 0;
    let nextSpawnMs = 0;
    /** Set on loss: countdown frames of explosion before the result screen. */
    let dyingFrames = -1;
    let lossPos: { x: number; y: number } | null = null;

    // Active trace (one at a time).
    let drawPointer: number | null = null;
    let drawStart: { x: number; y: number } | null = null;
    let drawEnd: { x: number; y: number } | null = null;

    const unit = () => sizeRef.current.height / 640;
    const stationH = () => 34 * unit();

    /** elapsedMs at which each launch bay comes back online (0 = healthy). */
    const bayDownUntil: number[] = Array.from({ length: BAY_COUNT }, () => 0);
    const bayX = (i: number) => ((i + 0.5) / BAY_COUNT) * sizeRef.current.width;
    const bayEnabled = (i: number) => elapsedMs >= bayDownUntil[i];

    /** Seconds between launches at a given elapsed time. */
    const spawnIntervalSec = (tSec: number) => {
      if (daily) {
        const p = Math.min(1, tSec / (DAILY_DURATION_MS / 1000));
        return 5.0 - (5.0 - 1.8) * p;
      }
      return Math.max(1.5, 5.0 - tSec * 0.03);
    };

    const gravityMult = (tSec: number) => (daily ? 1 : 1 + tSec * 0.008);

    /** Portal lifetime shrinks as the run progresses. */
    const portalLifeFrames = (tSec: number) => {
      if (daily) {
        const remaining = Math.max(0, DAILY_DURATION_MS / 1000 - tSec);
        return (2.4 + 3.4 * (remaining / 30)) * 60;
      }
      return Math.max(2.0, 5.8 - tSec * 0.035) * 60;
    };

    const spawnRocket = (forceBay?: number) => {
      const u = unit();
      // Fixed rng call count keeps the daily launch pattern seed-stable even
      // though disabled bays can shift which bay actually fires.
      const wantBay = forceBay ?? Math.floor(rng() * BAY_COUNT);
      const tilt = (rng() * 2 - 1) * LAUNCH_SPREAD;
      const phase = rng() * Math.PI * 2;
      let bay = -1;
      for (let d = 0; d < BAY_COUNT; d++) {
        const left = (wantBay - d + BAY_COUNT) % BAY_COUNT;
        const right = (wantBay + d) % BAY_COUNT;
        if (bayEnabled(right)) { bay = right; break; }
        if (bayEnabled(left)) { bay = left; break; }
      }
      if (bay < 0) return; // whole station is down: no launch (your reward)
      const speed = 1.1 * u;
      rockets.push({
        x: bayX(bay),
        y: stationH() + 6 * u,
        prevY: stationH() + 6 * u,
        vx: Math.sin(tilt) * speed,
        vy: Math.cos(tilt) * speed,
        inverted: false,
        brake: 0,
        rot: Math.PI + tilt, // nose along launch direction
        phase,
        warned: false,
        smokeAcc: 0,
        ageMs: 0,
      });
    };

    const burst = (x: number, y: number, colors: string[], count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.9);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          r: 1.5 + Math.random() * 3,
          life: 26 + Math.random() * 22,
          maxLife: 48,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    const finish = (won: boolean) => {
      if (ended) return;
      ended = true;
      alive = false;
      const timeMs = daily ? Math.min(elapsedMs, DAILY_DURATION_MS) : elapsedMs;
      let score: number;
      if (won) {
        score = 8000 + Math.max(0, 2000 - portalsDrawn * 60);
        playSampleOneShot(SAMPLE_SRC.tipTopComplete, 0.8);
      } else {
        score = daily
          ? Math.floor(timeMs / 10)
          : Math.floor(timeMs / 10) + flips * 15;
      }
      onGameOverRef.current({
        score,
        title: won ? "Held the line!" : "Lost to the void",
        stats: [
          { label: "Flips", value: String(flips) },
          { label: "Time", value: fmtSeconds(timeMs) },
        ],
      });
    };

    const loseAt = (x: number, y: number) => {
      if (dyingFrames >= 0 || ended) return;
      dyingFrames = 42;
      lossPos = { x, y };
      playSampleOneShot(SAMPLE_SRC.octaneHit, 0.5);
      burst(x, y, ["#ff8a4a", "#ff5c5c", "#ffd76e", "#ffffff"], 26, 4 * unit());
    };

    const commitPortal = () => {
      if (!drawStart || !drawEnd) return;
      const dx = drawEnd.x - drawStart.x;
      const dy = drawEnd.y - drawStart.y;
      const len = Math.hypot(dx, dy);
      if (len < MIN_TRACE_LEN) return;
      const { width: w, height: h } = sizeRef.current;
      const halfLen = Math.min(len / 2, w * PORTAL_MAX_HALF_FRAC);
      const cx = (drawStart.x + drawEnd.x) / 2;
      // Portals can't be opened above the dotted ceiling line.
      const cy = Math.max(h * PORTAL_CEILING_FRAC, (drawStart.y + drawEnd.y) / 2);
      // Clamp tilt so every portal still reads as a horizontal gate.
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      angle = Math.max(-0.5, Math.min(0.5, angle));
      // A 4th trace evicts the oldest healthy portal: it rushes through its
      // remaining colors instead of vanishing outright.
      const healthy = portals.filter((po) => po.decayRate === 1);
      if (healthy.length >= MAX_PORTALS) {
        healthy[0].decayRate = EVICT_DECAY_RATE;
      }
      // Longer portals burn out faster: wide safety nets are short-lived.
      const minHalf = MIN_TRACE_LEN / 2;
      const lenNorm = Math.min(
        1,
        Math.max(0, (halfLen - minHalf) / (w * PORTAL_MAX_HALF_FRAC - minHalf)),
      );
      const life = portalLifeFrames(elapsedMs / 1000) * (1.2 - 0.65 * lenNorm);
      portals.push({
        cx,
        cy,
        angle,
        halfLen,
        life,
        maxLife: life,
        pulse: 0,
        spin: Math.random() * Math.PI * 2,
        decayRate: 1,
        boost: 1 + 0.45 * (1 - lenNorm),
      });
      portalsDrawn++;
      playSampleOneShot(PLACE_SFX, 0.35);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!alive || pausedRef.current || drawPointer !== null) return;
      unlockGameAudio();
      const rect = canvas.getBoundingClientRect();
      drawPointer = e.pointerId;
      drawStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawEnd = { ...drawStart };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drawPointer || !drawStart) return;
      const rect = canvas.getBoundingClientRect();
      drawEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drawPointer) return;
      if (alive && !pausedRef.current) commitPortal();
      drawPointer = null;
      drawStart = null;
      drawEnd = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    spawnRocket(Math.floor(BAY_COUNT / 2));
    nextSpawnMs = spawnIntervalSec(0) * 1000;

    let raf = 0;
    let lastFrame = performance.now();

    const drawRocket = (r: Rocket, now: number) => {
      const u = unit();
      const L = 38 * u;
      const W = 15 * u;
      const p = paletteRef.current.spacewalk;

      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);

      if (r.inverted) {
        ctx.shadowColor = p.portalRim;
        ctx.shadowBlur = 14 * u;
      }

      // Flame (rear = local +y).
      const flick = 0.75 + 0.35 * Math.sin(now * 0.045 + r.phase) + 0.15 * Math.sin(now * 0.11 + r.phase * 2);
      const fl = L * 0.55 * flick;
      ctx.fillStyle = p.flameOuter;
      ctx.beginPath();
      ctx.moveTo(-W * 0.32, L * 0.42);
      ctx.lineTo(0, L * 0.42 + fl);
      ctx.lineTo(W * 0.32, L * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.flameInner;
      ctx.beginPath();
      ctx.moveTo(-W * 0.16, L * 0.42);
      ctx.lineTo(0, L * 0.42 + fl * 0.55);
      ctx.lineTo(W * 0.16, L * 0.42);
      ctx.closePath();
      ctx.fill();

      // Fins.
      ctx.fillStyle = p.fin;
      ctx.beginPath();
      ctx.moveTo(-W / 2, L * 0.12);
      ctx.lineTo(-W * 0.95, L * 0.46);
      ctx.lineTo(-W / 2, L * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W / 2, L * 0.12);
      ctx.lineTo(W * 0.95, L * 0.46);
      ctx.lineTo(W / 2, L * 0.42);
      ctx.closePath();
      ctx.fill();

      // Body.
      ctx.fillStyle = p.rocket;
      ctx.beginPath();
      ctx.moveTo(-W / 2, -L * 0.18);
      ctx.lineTo(-W / 2, L * 0.42);
      ctx.lineTo(W / 2, L * 0.42);
      ctx.lineTo(W / 2, -L * 0.18);
      ctx.closePath();
      ctx.fill();

      // Nose cone.
      ctx.fillStyle = p.rocketNose;
      ctx.beginPath();
      ctx.moveTo(-W / 2, -L * 0.18);
      ctx.quadraticCurveTo(0, -L * 0.72, W / 2, -L * 0.18);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;

      // Porthole with the Upscale logo.
      const pr = W * 0.42;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.arc(0, L * 0.1, pr + 1.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, L * 0.1, pr, 0, Math.PI * 2);
      ctx.clip();
      if (logoReady) {
        // Keep the logo upright on screen regardless of rocket rotation.
        ctx.translate(0, L * 0.1);
        ctx.rotate(-r.rot);
        ctx.drawImage(logo, -pr, -pr, pr * 2, pr * 2);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-pr, L * 0.1 - pr, pr * 2, pr * 2);
      }
      ctx.restore();

      ctx.restore();
    };

    const drawPortal = (po: Portal, now: number) => {
      const u = unit();
      const lifeFrac = po.life / po.maxLife;
      // Lifetime warning ramp: cyan → blue → orange → orange-red.
      const rimColor = portalLifeColor(lifeFrac);
      const fade = Math.min(1, po.life / (po.maxLife * 0.22));
      const ry = Math.max(7 * u, po.halfLen * 0.24);
      const pulse = po.pulse > 0 ? po.pulse / 14 : 0;

      ctx.save();
      ctx.translate(po.cx, po.cy);
      ctx.rotate(po.angle);
      ctx.globalAlpha = 0.35 + 0.65 * fade;

      // Core swirl (two nested ellipses reads as depth), tinted by lifetime.
      ctx.fillStyle = portalLifeColor(lifeFrac, 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, po.halfLen, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = portalLifeColor(lifeFrac, 0.32);
      ctx.beginPath();
      ctx.ellipse(0, 0, po.halfLen * 0.62, ry * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rim.
      ctx.strokeStyle = rimColor;
      ctx.lineWidth = (2.5 + pulse * 3) * u;
      ctx.shadowColor = rimColor;
      ctx.shadowBlur = (10 + pulse * 14) * u;
      ctx.beginPath();
      ctx.ellipse(0, 0, po.halfLen, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Orbiting sparkles along the rim.
      ctx.fillStyle = rimColor;
      for (let i = 0; i < 7; i++) {
        const a = po.spin + now * 0.0018 + (i * Math.PI * 2) / 7;
        const px = Math.cos(a) * po.halfLen;
        const py = Math.sin(a) * ry;
        const tw = 0.5 + 0.5 * Math.sin(now * 0.01 + i * 1.7);
        ctx.globalAlpha = (0.3 + 0.7 * tw) * fade;
        ctx.beginPath();
        ctx.arc(px, py, (1.2 + tw * 1.6) * u, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      if (!alive) return;

      const dt = frameScale(now - lastFrame);
      lastFrame = now;
      const { width: w, height: h } = sizeRef.current;
      resizeCanvas(w, h);
      const u = unit();
      const p = paletteRef.current.spacewalk;
      const tSec = elapsedMs / 1000;
      const dying = dyingFrames >= 0;

      if (!pausedRef.current) {
        if (dying) {
          dyingFrames -= dt;
          if (dyingFrames <= 0) {
            finish(false);
            return;
          }
        } else {
          elapsedMs += dt * (1000 / 60);

          if (daily && elapsedMs >= DAILY_DURATION_MS) {
            finish(true);
            return;
          }

          // Launches.
          if (elapsedMs >= nextSpawnMs) {
            spawnRocket();
            const jitter = 0.85 + rng() * 0.3;
            nextSpawnMs += spawnIntervalSec(elapsedMs / 1000) * 1000 * jitter;
          }

          // Rocket physics.
          const g = 0.085 * u * gravityMult(tSec);
          const maxFall = 10.5 * u;
          const maxRise = 12.5 * u;
          for (let ri = rockets.length - 1; ri >= 0; ri--) {
            const r = rockets[ri];
            r.prevY = r.y;
            if (r.inverted) {
              // Post-flip brake: much stronger upward pull that decays back
              // to normal so rockets stop sinking quickly after a flip.
              r.vy -= g * (1 + BRAKE_MAX * r.brake) * dt;
              r.brake *= frameDecay(BRAKE_DECAY, dt);
            } else {
              r.vy += g * dt;
            }
            r.vy = Math.max(-maxRise, Math.min(maxFall, r.vy));
            r.y += r.vy * dt;
            r.x += r.vx * dt;
            r.ageMs += dt * (1000 / 60);
            // Ricochet off the side walls.
            const m = 12 * u;
            if (r.x < m) {
              r.x = m;
              r.vx = Math.abs(r.vx);
            } else if (r.x > w - m) {
              r.x = w - m;
              r.vx = -Math.abs(r.vx);
            }
            // Release the flip once the rocket climbs just past halfway.
            if (r.inverted && r.vy < 0 && r.y <= h * INVERT_RELEASE_FRAC) {
              r.inverted = false;
              r.brake = 0;
            }

            // Reaching the station while climbing: smash into a launch bay
            // (temporarily disabling it) or clank off the hull.
            if (r.vy < 0 && r.y <= stationH() + 12 * u) {
              let hitBay = -1;
              for (let b = 0; b < BAY_COUNT; b++) {
                if (bayEnabled(b) && Math.abs(r.x - bayX(b)) < BAY_HIT_HALF * u) {
                  hitBay = b;
                  break;
                }
              }
              if (hitBay >= 0) {
                bayDownUntil[hitBay] = elapsedMs + BAY_DOWN_MS;
                burst(bayX(hitBay), stationH(), ["#ff8a4a", "#ffd76e", p.stationLight, "#ffffff"], 22, 3.4 * u);
                playSampleOneShot(SAMPLE_SRC.octaneHit, 0.45, 1.25);
                rockets.splice(ri, 1);
                continue;
              }
              r.y = stationH() + 12 * u;
              r.vy = Math.abs(r.vy) * 0.45;
              r.inverted = false;
              r.brake = 0;
            }

            // Portal crossings (downward only).
            if (!r.inverted && r.vy > 0) {
              for (const po of portals) {
                const dx = Math.cos(po.angle) * po.halfLen;
                const dy = Math.sin(po.angle) * po.halfLen;
                if (
                  segmentsIntersect(
                    r.x, r.prevY, r.x, r.y,
                    po.cx - dx, po.cy - dy, po.cx + dx, po.cy + dy,
                  )
                ) {
                  r.inverted = true;
                  // Smaller portals redirect harder.
                  r.brake = po.boost;
                  // Slow rockets get a base upward kick instead of sinking on.
                  if (r.vy < SLOW_FLIP_THRESHOLD * u) {
                    r.vy = -BASE_FLIP_RISE * u * po.boost;
                  }
                  // Tilted portals deflect sideways like a mirror bounce.
                  r.vx = r.vx * 0.25 + Math.sin(2 * po.angle) * 3.2 * u * po.boost;
                  flips++;
                  po.pulse = 14;
                  burst(
                    r.x, r.y,
                    [portalLifeColor(po.life / po.maxLife), p.portalParticle],
                    10, 2.5 * u,
                  );
                  playSampleOneShot(FLIP_SFX, 0.45, 1.1 + Math.random() * 0.15);
                  break;
                }
              }
            }

            // Bottom danger warning, then loss.
            if (!r.warned && r.vy > 0 && r.y > h * 0.84) {
              r.warned = true;
              playSampleOneShot(SAMPLE_SRC.octaneWarning, 0.22);
            }
            if (r.warned && r.y < h * 0.7) r.warned = false;
            if (r.y >= h - 4 * u) {
              loseAt(r.x, h - 10 * u);
              break;
            }
            if (r.ageMs >= ROCKET_LIFETIME_MS) {
              burst(r.x, r.y, ["#ff8a4a", "#ffd76e", p.stationLight, "#ffffff"], 16, 3 * u);
              playSampleOneShot(SAMPLE_SRC.octaneHit, 0.28, 0.85);
              rockets.splice(ri, 1);
              continue;
            }

            // Smoke trail from the engine.
            r.smokeAcc += dt;
            if (r.smokeAcc >= 2.2) {
              r.smokeAcc = 0;
              const back = 22 * u;
              particles.push({
                x: r.x - Math.sin(r.rot) * back + (Math.random() - 0.5) * 3 * u,
                y: r.y + Math.cos(r.rot) * back,
                vx: (Math.random() - 0.5) * 0.4 * u,
                vy: -r.vy * 0.12,
                r: (2 + Math.random() * 2.5) * u,
                life: 34 + Math.random() * 18,
                maxLife: 52,
                color: p.smoke,
              });
            }

            // Ease the sprite towards its velocity direction.
            const target = Math.atan2(r.vy, r.vx * 0.35) + Math.PI / 2;
            r.rot += shortestAngle(r.rot, target) * Math.min(1, 0.12 * dt);
          }

          // Portal lifetimes.
          for (let i = portals.length - 1; i >= 0; i--) {
            const po = portals[i];
            po.life -= dt * po.decayRate;
            if (po.pulse > 0) po.pulse = Math.max(0, po.pulse - dt);
            if (po.life <= 0) {
              burst(po.cx, po.cy, [portalLifeColor(0), p.portalParticle], 8, 1.8 * u);
              portals.splice(i, 1);
            }
          }
        }

        // Particles tick even while dying (explosion animates out).
        for (let i = particles.length - 1; i >= 0; i--) {
          const pa = particles[i];
          pa.life -= dt;
          pa.x += pa.vx * dt;
          pa.y += pa.vy * dt;
          pa.r += 0.06 * u * dt;
          if (pa.life <= 0) particles.splice(i, 1);
        }
        if (particles.length > 320) particles.splice(0, particles.length - 320);
      }

      // ---------- Render ----------
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, p.bgTop);
      grad.addColorStop(1, p.bgBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Nebula blobs.
      for (let i = 0; i < 3; i++) {
        const nx = w * (0.2 + i * 0.3);
        const ny = h * (0.25 + ((i * 0.27) % 0.5));
        const nr = w * (0.35 + i * 0.08);
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, p.nebula);
        ng.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ng;
        ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      }

      // Sun blazing in the top-right corner.
      const sunX = w * 1.02;
      const sunY = h * 0.09;
      const sunR = w * 0.15;
      const corona = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.2);
      corona.addColorStop(0, "rgba(255, 226, 122, 0.5)");
      corona.addColorStop(0.35, "rgba(255, 190, 90, 0.16)");
      corona.addColorStop(1, "rgba(255, 190, 90, 0)");
      ctx.fillStyle = corona;
      ctx.fillRect(sunX - sunR * 3.2, sunY - sunR * 3.2, sunR * 6.4, sunR * 6.4);
      const sunCore = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
      sunCore.addColorStop(0, "#fff7dc");
      sunCore.addColorStop(0.7, "#ffe27a");
      sunCore.addColorStop(1, "#ffb84a");
      ctx.fillStyle = sunCore;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // Earth peeking from the lower-left, lit from the sun's side.
      const eR = w * 0.3;
      const eX = -eR * 0.25;
      const eY = h * 0.62;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(eX, eY, eR, 0, Math.PI * 2);
      ctx.clip();
      const ocean = ctx.createRadialGradient(eX + eR * 0.45, eY - eR * 0.4, eR * 0.1, eX, eY, eR * 1.15);
      ocean.addColorStop(0, "#7fc4ff");
      ocean.addColorStop(0.55, "#2f7fd4");
      ocean.addColorStop(1, "#123a78");
      ctx.fillStyle = ocean;
      ctx.fillRect(eX - eR, eY - eR, eR * 2, eR * 2);
      // Continents.
      ctx.fillStyle = "rgba(90, 190, 120, 0.85)";
      ctx.beginPath();
      ctx.ellipse(eX + eR * 0.35, eY - eR * 0.3, eR * 0.34, eR * 0.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(eX + eR * 0.1, eY + eR * 0.35, eR * 0.28, eR * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(eX + eR * 0.62, eY + eR * 0.12, eR * 0.16, eR * 0.1, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Cloud wisps.
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.beginPath();
      ctx.ellipse(eX + eR * 0.3, eY - eR * 0.05, eR * 0.5, eR * 0.09, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(eX + eR * 0.15, eY + eR * 0.55, eR * 0.4, eR * 0.07, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Night-side shading away from the sun.
      const shade = ctx.createLinearGradient(eX + eR, eY - eR, eX - eR, eY + eR);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(4, 8, 26, 0.8)");
      ctx.fillStyle = shade;
      ctx.fillRect(eX - eR, eY - eR, eR * 2, eR * 2);
      ctx.restore();
      // Atmosphere rim.
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#9fd4ff";
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.arc(eX, eY, eR + 1.5 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // The moon drifting between Earth and the station.
      const mR = w * 0.055;
      const mX = w * 0.24;
      const mY = h * 0.42;
      const moon = ctx.createRadialGradient(mX + mR * 0.4, mY - mR * 0.35, mR * 0.15, mX, mY, mR * 1.1);
      moon.addColorStop(0, "#e8e8ec");
      moon.addColorStop(0.7, "#b8b9c4");
      moon.addColorStop(1, "#7e808f");
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mX, mY, mR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(90, 92, 108, 0.5)";
      for (const [cx, cy, cr] of [
        [-0.35, -0.15, 0.2],
        [0.2, 0.3, 0.16],
        [0.35, -0.4, 0.12],
        [-0.1, 0.5, 0.1],
      ] as const) {
        ctx.beginPath();
        ctx.arc(mX + cx * mR, mY + cy * mR, cr * mR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Drifting stars.
      const driftT = now * 0.001;
      for (const s of stars) {
        const sy = (s.y * h + driftT * s.speed) % h;
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(driftT * 1.4 + s.tw));
        ctx.globalAlpha = tw;
        ctx.fillStyle = p.star;
        ctx.beginPath();
        ctx.arc(s.x * w, sy, s.r * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Launch station across the top.
      const sh = stationH();
      ctx.fillStyle = p.station;
      ctx.fillRect(0, 0, w, sh);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, sh - 4 * u, w, 4 * u);
      for (let i = 0; i < BAY_COUNT; i++) {
        const bx = bayX(i);
        const enabled = bayEnabled(i);
        ctx.fillStyle = enabled ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.6)";
        ctx.fillRect(bx - 18 * u, sh - 10 * u, 36 * u, 10 * u);
        if (enabled) {
          const blink = 0.35 + 0.65 * Math.abs(Math.sin(now * 0.003 + i * 1.3));
          ctx.globalAlpha = blink;
          ctx.fillStyle = p.stationLight;
          ctx.beginPath();
          ctx.arc(bx, sh - 16 * u, 2.4 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // Damaged: ember glow plus a thin repair-progress bar.
          const ember = 0.3 + 0.4 * Math.abs(Math.sin(now * 0.01 + i));
          ctx.globalAlpha = ember;
          ctx.fillStyle = p.danger;
          ctx.beginPath();
          ctx.arc(bx, sh - 16 * u, 2.4 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          const repair = 1 - Math.min(1, (bayDownUntil[i] - elapsedMs) / BAY_DOWN_MS);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(bx - 10 * u, sh - 4 * u, 20 * u, 2 * u);
          ctx.fillStyle = p.stationLight;
          ctx.fillRect(bx - 10 * u, sh - 4 * u, 20 * u * repair, 2 * u);
          // Occasional drifting smoke from the wreck.
          if (Math.random() < 0.06) {
            particles.push({
              x: bx + (Math.random() - 0.5) * 12 * u,
              y: sh,
              vx: (Math.random() - 0.5) * 0.3 * u,
              vy: 0.5 * u,
              r: (1.6 + Math.random() * 2) * u,
              life: 26 + Math.random() * 14,
              maxLife: 40,
              color: p.smoke,
            });
          }
        }
      }

      // Bottom void.
      const anyDanger = rockets.some((r) => r.y > h * 0.78 && r.vy > 0);
      const voidH = 22 * u;
      const dangerPulse = anyDanger ? 0.35 + 0.3 * Math.abs(Math.sin(now * 0.012)) : 0.18;
      const vg = ctx.createLinearGradient(0, h - voidH * 3, 0, h);
      vg.addColorStop(0, "rgba(255, 92, 92, 0)");
      vg.addColorStop(1, `rgba(255, 92, 92, ${dangerPulse})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, h - voidH * 3, w, voidH * 3);
      ctx.fillStyle = p.danger;
      ctx.globalAlpha = anyDanger ? 0.9 : 0.5;
      ctx.fillRect(0, h - 3 * u, w, 3 * u);
      ctx.globalAlpha = 1;

      // Dotted portal ceiling: no redirectors above this line.
      const ceilY = h * PORTAL_CEILING_FRAC;
      ctx.strokeStyle = p.drawPreview;
      ctx.globalAlpha = drawStart ? 0.45 : 0.18;
      ctx.lineWidth = 1.5 * u;
      ctx.setLineDash([3 * u, 7 * u]);
      ctx.beginPath();
      ctx.moveTo(0, ceilY);
      ctx.lineTo(w, ceilY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      for (const po of portals) drawPortal(po, now);

      for (const pa of particles) {
        ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
        ctx.fillStyle = pa.color;
        ctx.beginPath();
        ctx.arc(pa.x, pa.y, pa.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!dying) {
        for (const r of rockets) drawRocket(r, now);
      }

      // Trace preview (warns when above the portal ceiling).
      if (drawStart && drawEnd) {
        const len = Math.hypot(drawEnd.x - drawStart.x, drawEnd.y - drawStart.y);
        const aboveCeil = (drawStart.y + drawEnd.y) / 2 < ceilY;
        ctx.strokeStyle = aboveCeil ? p.danger : p.drawPreview;
        ctx.lineWidth = 3 * u;
        ctx.setLineDash([8, 6]);
        ctx.globalAlpha = len >= MIN_TRACE_LEN && !aboveCeil ? 1 : 0.4;
        ctx.beginPath();
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(drawEnd.x, drawEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // HUD.
      ctx.textAlign = "center";
      ctx.fillStyle = p.hudText;
      ctx.font = "bold 26px Nunito, sans-serif";
      if (daily) {
        const remain = Math.max(0, DAILY_DURATION_MS - elapsedMs);
        ctx.fillText(fmtSeconds(remain), w / 2, sh + 34 * u);
      } else {
        ctx.fillText(fmtSeconds(elapsedMs), w / 2, sh + 34 * u);
      }
      ctx.font = "bold 13px Nunito, sans-serif";
      ctx.globalAlpha = 0.75;
      const sub = daily
        ? `${flips} flips`
        : `${flips} flips · ${gravityMult(tSec).toFixed(2)}x g`;
      ctx.fillText(sub, w / 2, sh + 52 * u);
      ctx.globalAlpha = 1;

      // Portal slot pips (top-right); evicted portals free their slot at once.
      const healthyCount = portals.filter((po) => po.decayRate === 1).length;
      for (let i = 0; i < MAX_PORTALS; i++) {
        const px = w - 16 * u - i * 16 * u;
        const py = sh + 18 * u;
        const used = i < healthyCount;
        ctx.globalAlpha = used ? 0.95 : 0.3;
        ctx.strokeStyle = p.portalRim;
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.ellipse(px, py, 6 * u, 2.6 * u, -0.25, 0, Math.PI * 2);
        ctx.stroke();
        if (used) {
          ctx.fillStyle = p.portalCore;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";

      // Loss flash marker.
      if (dying && lossPos) {
        const fl = dyingFrames / 42;
        ctx.fillStyle = `rgba(255, 92, 92, ${0.28 * fl})`;
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
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
