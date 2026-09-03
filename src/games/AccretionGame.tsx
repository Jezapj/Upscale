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
import { hapticImpact } from "@/lib/haptic";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
  paused?: boolean;
  /** Course layout seed (daily challenge). */
  seed?: number;
  playMode: PlayMode;
  /** Called once the park has actually painted. */
  onLive?: () => void;
}

/** Park rubbish that accretes onto the ball. */
const JUNK_GLYPHS = ["🍎", "🦴", "👢", "📄", "🍌", "🥫"];

const RUN_TIME_MS = 20_000;
/** Extra time granted per finished course loop in endless mode. */
const LOOP_BONUS_MS = 10_000;
/** Course length in world units (1 wu = 1px at 640px height). */
const COURSE_LEN = 3400;
/** Distance between zigzag control points. */
const SEG = 420;
/** Distance between junk spawn slots. */
const ITEM_GAP = 95;
const TREE_GAP = 170;
const JUNK_VALUE = 120;
/** Only this many glyphs ride the ball; further pickups grow those glyphs instead. */
const VISUAL_JUNK_CAP = 12;
const JUNK_SCALE_STEP = 0.05;
const JUNK_SCALE_MAX = 1.9;
const PICKUP_SFX = "/tapchime.mp3";
const LOOP_SFX = "/successchime.mp3";

/** Thrust decays per 60fps frame when no upward input (player stops swiping up). */
const THRUST_DECAY_PER_FRAME = 0.994;
/** How quickly thrust builds from upward swipes. */
const THRUST_BUILD_RATE = 0.0030;
/** Maximum thrust multiplier from player input. */
const THRUST_MAX = 108.2;

interface Attached {
  glyph: string;
  /** Phase offset around the rolling ball. */
  ang: number;
  /** Horizontal placement across the ball face (-1..1). */
  xOff: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  glyph?: string;
  color?: string;
  r: number;
}

function fmtSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/** Deterministic 0..1 hash of (seed, n, salt) for infinite course features. */
function hash01(seed: number, n: number, salt: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Oval via arc+scale so iOS Safari never throws on missing ctx.ellipse. */
function fillOval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  const radX = Math.max(0.5, rx);
  const radY = Math.max(0.5, ry);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radX, radY);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Accretion: a soccer ball rolls up a zigzagging park path on its own; swipe
 * to steer, roll over rubbish to grow it Katamari-style, and reach the finish
 * before the clock runs out. Clipping the hedges knocks junk back off.
 */
export function AccretionGame({
  width,
  height,
  onGameOver,
  paused = false,
  seed,
  playMode,
  onLive,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);
  const pausedRef = useRef(paused);
  const seedRef = useRef(seed);
  const modeRef = useRef(playMode);
  const onLiveRef = useRef(onLive);

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;
  pausedRef.current = paused;
  seedRef.current = seed;
  modeRef.current = playMode;
  onLiveRef.current = onLive;

  const layoutReady = width >= 32 && height >= 32;

  useEffect(() => {
    if (!layoutReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    unlockGameAudio();
    preloadSamples(
      PICKUP_SFX,
      LOOP_SFX,
      SAMPLE_SRC.octaneWarning,
      SAMPLE_SRC.octaneHit,
      SAMPLE_SRC.tipTopComplete,
    );

    let canvasW = 0;
    let canvasH = 0;
    const resizeCanvas = (w: number, h: number) => {
      if (w < 32 || h < 32) return;
      if (w === canvasW && h === canvasH) return;
      canvasW = w;
      canvasH = h;
      const dpr = canvasDpr();
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const daily = modeRef.current === "daily";
    const courseSeed =
      seedRef.current !== undefined
        ? seedRef.current >>> 0
        : (Date.now() & 0xffffffff) >>> 0;

    const unit = () => {
      const h = sizeRef.current.height;
      return Math.max(0.5, (h >= 32 ? h : canvas.clientHeight) / 640);
    };

    // ----- Course geometry (world units along the course, seed-derived) -----

    /** Zigzag control point offset (fraction of width) at index i. */
    const cpOffset = (i: number): number => {
      if (!Number.isFinite(i) || i < 2) return 0; // straight start
      const side = i % 2 === 0 ? -1 : 1;
      return side * (0.08 + hash01(courseSeed, i, 1) * 0.2);
    };

    /** Path centerline x (fraction of width) at course distance d. */
    const centerFrac = (d: number): number => {
      if (!Number.isFinite(d)) return 0.5;
      const i = Math.max(0, Math.floor(d / SEG));
      const t = smoothstep(Math.min(1, Math.max(0, (d - i * SEG) / SEG)));
      const a = cpOffset(i);
      const b = cpOffset(i + 1);
      return 0.5 + a + (b - a) * t;
    };

    /** Path half-width (fraction of width): narrows within and across loops. */
    const halfWidthFrac = (dRaw: number): number => {
      const d = Number.isFinite(dRaw) ? Math.max(0, dRaw) : 0;
      const loop = Math.floor(d / COURSE_LEN);
      const t = (d % COURSE_LEN) / COURSE_LEN;
      const start = Math.max(0.24, 0.34 - loop * 0.012);
      const end = Math.max(0.2, start - 0.08);
      return start + (end - start) * t;
    };

    interface JunkItem {
      slot: number;
      d: number;
      /** x as fraction of screen width. */
      fx: number;
      glyph: string;
    }

    const junkAt = (slot: number): JunkItem | null => {
      const d = slot * ITEM_GAP + hash01(courseSeed, slot, 2) * ITEM_GAP * 0.5;
      if (d < 260) return null; // clear runway at the start
      // No junk right on a finish banner.
      const inCourse = d % COURSE_LEN;
      if (inCourse > COURSE_LEN - 90) return null;
      if (hash01(courseSeed, slot, 3) > 0.8) return null;
      const spread = halfWidthFrac(d) - 0.055;
      const fx = centerFrac(d) + (hash01(courseSeed, slot, 4) * 2 - 1) * spread;
      const glyph = JUNK_GLYPHS[Math.floor(hash01(courseSeed, slot, 5) * JUNK_GLYPHS.length)];
      return { slot, d, fx, glyph };
    };

    // ----- Run state -----

    let alive = true;
    let ended = false;
    let elapsedMs = 0;
    let timeLeftMs = RUN_TIME_MS;
    let ballD = 0;
    let ballX = sizeRef.current.width / 2;
    let vx = 0;
    let ballRot = 0;
    let collected = 0;
    let loops = 0;
    let iframes = 0;
    let shake = 0;
    let warned = false;
    let junkScale = 1;
    const attached: Attached[] = [];
    const takenSlots = new Set<number>();
    const particles: Particle[] = [];
    const heldKeys = new Set<string>();
    let lastPointerX: number | null = null;
    let lastPointerY: number | null = null;
    let activePointer: number | null = null;
    let laidOut = false;
    let thrust = 0;
    let wentLive = false;

    const ballRadius = () => {
      const u = unit();
      // Daily is a 20s sprint: grow fast and cap high. Endless is slower.
      const perJunk = daily ? 3.5 : 2.8;
      const cap = (daily ? 128 : 150) * u;
      return Math.min(cap, (16 + attached.length * perJunk) * u);
    };
    const forwardSpeed = () => {
      const loopBoost = 1 + loops * 0.05; // Reduced loop boost so player skill matters more
      const t = Math.min(1, (daily ? ballD : ballD % COURSE_LEN) / COURSE_LEN);
      const ramp = daily ? 1 + 0.25 * Math.sqrt(t) : 1 + 0.10 * Math.sqrt(t); // Reduced auto-ramp
      return 1.05 * loopBoost * ramp * (1 + thrust);
    };

    const finish = (won: boolean) => {
      if (ended) return;
      ended = true;
      alive = false;
      let score: number;
      let timeLabel: string;
      if (daily) {
        if (won) {
          score = 3000 + collected * JUNK_VALUE + Math.floor(timeLeftMs / 5);
          timeLabel = fmtSeconds(RUN_TIME_MS - timeLeftMs);
          playSampleOneShot(SAMPLE_SRC.tipTopComplete, 0.8);
        } else {
          const progress = Math.min(1, ballD / COURSE_LEN);
          score = collected * JUNK_VALUE + Math.floor(progress * 800);
          timeLabel = fmtSeconds(RUN_TIME_MS);
        }
      } else {
        score = collected * JUNK_VALUE + loops * 800;
        timeLabel = fmtSeconds(elapsedMs);
        if (loops > 0) playSampleOneShot(SAMPLE_SRC.tipTopComplete, 0.7);
      }
      onGameOverRef.current({
        score,
        title: won ? "Park spotless!" : "Time's up!",
        stats: [
          { label: "Junk", value: String(collected) },
          { label: "Time", value: timeLabel },
        ],
      });
    };

    const steer = (impulse: number) => {
      const u = unit();
      // Heavier ball, weaker swipes: influence falls off with accreted mass.
      const mass = Math.pow((16 * u) / ballRadius(), 0.7);
      vx = Math.max(-6 * u, Math.min(6 * u, vx + impulse * mass));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (activePointer !== null) return;
      unlockGameAudio();
      activePointer = e.pointerId;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointer || lastPointerX === null || lastPointerY === null)
        return;
      if (pausedRef.current || !alive) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      const u = unit();
      
      let upInput = false;
      const up = Math.max(0, -dy);
      if (up > 0) upInput = true;
      const mass = Math.pow((16 * u) / ballRadius(), 0.7);

      // Horizontal component steers; upward component (negative dy) adds speed.
      steer(dx * Math.abs((0.025 - mass /80)) * u);

      if (upInput) {
        thrust = Math.min(THRUST_MAX, thrust + up * THRUST_BUILD_RATE * (mass + 0.5));
      }
      // Natural thrust decay when no upward input
      if (!upInput) {
        thrust = Math.max(0, thrust * frameDecay(THRUST_DECAY_PER_FRAME, 1));
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      lastPointerX = null;
      lastPointerY = null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyA" || e.code === "ArrowLeft") {
        e.preventDefault();
        heldKeys.add("left");
      } else if (e.code === "KeyD" || e.code === "ArrowRight") {
        e.preventDefault();
        heldKeys.add("right");
      } else if (e.code === "KeyW" || e.code === "ArrowUp") {
        e.preventDefault();
        heldKeys.add("up");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "KeyA" || e.code === "ArrowLeft") heldKeys.delete("left");
      else if (e.code === "KeyD" || e.code === "ArrowRight") heldKeys.delete("right");
      else if (e.code === "KeyW" || e.code === "ArrowUp") heldKeys.delete("up");
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let lastFrame = performance.now();

    const loop = (now: number) => {
      if (!alive) return;

      try {
      const dt = frameScale(now - lastFrame);
      lastFrame = now;
      // Shell size is authoritative; clientWidth/Height only as a fallback.
      // Comparisons are written so NaN fails (NaN < 32 would pass).
      const shellW = sizeRef.current.width;
      const shellH = sizeRef.current.height;
      const w = shellW >= 32 ? shellW : canvas.clientWidth;
      const h = shellH >= 32 ? shellH : canvas.clientHeight;
      if (!(w >= 32) || !(h >= 32)) return;
      resizeCanvas(w, h);
      if (!laidOut) {
        ballX = w / 2;
        laidOut = true;
        lastFrame = now;
      }
      const u = Math.max(0.5, h / 640);
      const p = paletteRef.current.accretion;
      const ballScreenY = h * 0.72;
      const r = ballRadius();

      if (!pausedRef.current) {
        elapsedMs += dt * (1000 / 60);
        timeLeftMs -= dt * (1000 / 60);

        if (!warned && timeLeftMs < 4000) {
          warned = true;
          playSampleOneShot(SAMPLE_SRC.octaneWarning, 0.22);
        }
        if (timeLeftMs <= 0) {
          finish(false);
          return;
        }

        // Keyboard steering.
        if (heldKeys.has("left")) steer(-0.55 * u * dt);
        if (heldKeys.has("right")) steer(0.55 * u * dt);
        let upInput = false;
        if (heldKeys.has("up")) {
          upInput = true;
          const mass = Math.pow((16 * u) / r, 0.7);
          thrust = Math.min(THRUST_MAX, thrust + THRUST_BUILD_RATE * dt * mass);
        }
        
        // Natural thrust decay when no upward input - ball slows down without upward swipes
        if (!upInput) {
          thrust = Math.max(0, thrust * frameDecay(THRUST_DECAY_PER_FRAME, dt));
        }

        // Forward roll + lateral drift.
        const spd = forwardSpeed();
        ballD += spd * dt;
        ballRot += (spd * u * dt) / Math.max(1, r);
        ballX += vx * dt;
        // Low friction: swipes leave lasting momentum you must counter-swipe.
        vx *= frameDecay(0.975, dt);
        // One bad number used to blank the whole course; never let it persist.
        if (!Number.isFinite(ballD)) ballD = 0;
        if (!Number.isFinite(ballX)) ballX = w / 2;
        if (!Number.isFinite(vx)) vx = 0;
        if (!Number.isFinite(thrust)) thrust = 0;
        if (!Number.isFinite(ballRot)) ballRot = 0;
        if (iframes > 0) iframes -= dt;
        if (shake > 0) shake = Math.max(0, shake - dt);

        // Finish line / loop boundaries.
        if (daily && ballD >= COURSE_LEN) {
          finish(true);
          return;
        }
        if (!daily && ballD >= (loops + 1) * COURSE_LEN) {
          loops++;
          timeLeftMs += LOOP_BONUS_MS - loops * 200; // Slightly reduced bonus per loop to keep pressure on player
          warned = false;
          playSampleOneShot(LOOP_SFX, 0.5);
        }

        // Hedge collision.
        const c = centerFrac(ballD) * w;
        const halfW = halfWidthFrac(ballD) * w;
        const limit = halfW - r;
        if (limit < 8) {
          ballX += (c - ballX) * Math.min(1, 0.15 * dt);
        } else if (Math.abs(ballX - c) > limit) {
          ballX = c + Math.sign(ballX - c) * limit;
          vx = -vx * 0.55;
          if (iframes <= 0) {
            iframes = 45;
            shake = 12;
            // Reduce thrust less severely - player can recover by swiping up
            thrust = Math.max(0, thrust * 0.7);
            playSampleOneShot(SAMPLE_SRC.octaneHit, 0.4);
            hapticImpact();
            // Knock up to 3 pieces of junk back off the ball.
            const dropped = attached.splice(Math.max(0, attached.length - 3), 3);
            junkScale = Math.max(1, junkScale - dropped.length * JUNK_SCALE_STEP);
            for (const item of dropped) {
              particles.push({
                x: ballX,
                y: ballScreenY,
                vx: (Math.random() - 0.5) * 5 * u,
                vy: -(2 + Math.random() * 3) * u,
                life: 40,
                maxLife: 40,
                glyph: item.glyph,
                r: 12 * u,
              });
            }
          }
        }

        // Junk pickups around the ball's course position.
        const slotLo = Math.max(
          0,
          Math.floor((ballD - r / u - ITEM_GAP) / ITEM_GAP),
        );
        const slotHi = Math.min(
          slotLo + 16,
          Math.ceil((ballD + r / u + ITEM_GAP) / ITEM_GAP),
        );
        for (let s = slotLo; s <= slotHi; s++) {
          if (takenSlots.has(s)) continue;
          const item = junkAt(s);
          if (!item) continue;
          const ix = item.fx * w;
          const iy = ballScreenY - (item.d - ballD) * u;
          const rr = r + 11 * u;
          const ddx = ix - ballX;
          const ddy = iy - ballScreenY;
          if (ddx * ddx + ddy * ddy <= rr * rr) {
            takenSlots.add(s);
            collected++;
            if (attached.length < VISUAL_JUNK_CAP) {
              attached.push({
                glyph: item.glyph,
                ang: Math.random() * Math.PI * 2,
                xOff: Math.random() * 1.4 - 0.7,
              });
            } else {
              junkScale = Math.min(JUNK_SCALE_MAX, junkScale + JUNK_SCALE_STEP);
            }
            playSampleOneShot(
              PICKUP_SFX,
              0.4,
              0.9 + Math.min(0.6, collected * 0.03),
            );
            for (let i = 0; i < 3; i++) {
              particles.push({
                x: ix,
                y: iy,
                vx: (Math.random() - 0.5) * 3 * u,
                vy: -(1 + Math.random() * 2) * u,
                life: 22,
                maxLife: 22,
                color: p.sparkle,
                r: (1.5 + Math.random() * 2) * u,
              });
            }
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const pa = particles[i];
          pa.life -= dt;
          pa.x += pa.vx * dt;
          pa.y += pa.vy * dt;
          pa.vy += 0.15 * u * dt;
          if (pa.life <= 0) particles.splice(i, 1);
        }
      }

      // ---------- Render ----------
      ctx.save();
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake * 0.6, (Math.random() - 0.5) * shake * 0.6);
      }

      // Grass.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, p.grassTop);
      grad.addColorStop(1, p.grassBot);
      ctx.fillStyle = grad;
      ctx.fillRect(-8, -8, w + 16, h + 16);

      // Mowing stripes scroll with the course.
      const stripeH = Math.max(8, 90 * u);
      const stripeSpan = stripeH * 2;
      const scroll = ((ballD * u) % stripeSpan + stripeSpan) % stripeSpan;
      ctx.fillStyle = p.grassStripe;
      for (let y = -stripeH * 2 + scroll; y < h + stripeH; y += stripeH * 2) {
        ctx.fillRect(-8, y, w + 16, stripeH);
      }

      // Path polygon sampled down the screen.
      const step = 22;
      const leftPts: [number, number][] = [];
      const rightPts: [number, number][] = [];
      for (let sy = -step; sy <= h + step; sy += step) {
        const dRaw = ballD + (ballScreenY - sy) / u;
        const d = Number.isFinite(dRaw) ? Math.max(0, dRaw) : 0;
        const cRaw = centerFrac(d) * w;
        const c = Number.isFinite(cRaw) ? cRaw : w / 2;
        const hwRaw = halfWidthFrac(d) * w;
        const hw = Number.isFinite(hwRaw) ? Math.max(48, hwRaw) : w * 0.3;
        leftPts.push([c - hw, sy]);
        rightPts.push([c + hw, sy]);
      }
      if (leftPts.length > 0) {
        ctx.fillStyle = p.path;
        ctx.beginPath();
        ctx.moveTo(leftPts[0][0], leftPts[0][1]);
        for (const [x, y] of leftPts) ctx.lineTo(x, y);
        for (let i = rightPts.length - 1; i >= 0; i--) {
          ctx.lineTo(rightPts[i][0], rightPts[i][1]);
        }
        ctx.closePath();
        ctx.fill();
      }
      if (!wentLive) {
        wentLive = true;
        onLiveRef.current?.();
      }

      // Packed-dirt edge lines.
      ctx.strokeStyle = p.pathEdge;
      ctx.lineWidth = 5 * u;
      for (const pts of [leftPts, rightPts]) {
        if (pts.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Hedge bushes chained along both edges.
      const hedgeGap = 70;
      const dLo = Math.max(0, Math.floor((ballD - (h - ballScreenY) / u) / hedgeGap) - 1);
      const dHi = Math.min(dLo + 80, Math.ceil((ballD + ballScreenY / u) / hedgeGap) + 1);
      for (let k = dLo; k <= dHi; k++) {
        const d = k * hedgeGap;
        if (d < 0) continue;
        const sy = ballScreenY - (d - ballD) * u;
        const c = centerFrac(d) * w;
        const hw = halfWidthFrac(d) * w;
        const wobble = hash01(courseSeed, k, 6);
        const br = (10 + wobble * 5) * u;
        for (const side of [-1, 1]) {
          const bx = c + side * (hw + br * 0.3);
          ctx.fillStyle = (k + side) % 2 === 0 ? p.hedge : p.hedgeDark;
          ctx.beginPath();
          ctx.arc(bx, sy, br, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Park trees scattered outside the path.
      const tLo = Math.max(0, Math.floor((ballD - (h - ballScreenY) / u) / TREE_GAP) - 1);
      const tHi = Math.min(tLo + 40, Math.ceil((ballD + ballScreenY / u) / TREE_GAP) + 1);
      for (let k = tLo; k <= tHi; k++) {
        const d = k * TREE_GAP + hash01(courseSeed, k, 7) * TREE_GAP * 0.5;
        if (d < 0) continue;
        const sy = ballScreenY - (d - ballD) * u;
        const c = centerFrac(d) * w;
        const hw = halfWidthFrac(d) * w;
        const side = k % 2 === 0 ? -1 : 1;
        const tx = c + side * (hw + (46 + hash01(courseSeed, k, 8) * 50) * u);
        if (tx < -30 * u || tx > w + 30 * u) continue;
        const tr = (16 + hash01(courseSeed, k, 9) * 10) * u;
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        fillOval(ctx, tx, sy + tr * 1.15, tr * 0.9, tr * 0.28);
        ctx.fillStyle = "#7a5230";
        ctx.fillRect(tx - 2.5 * u, sy + tr * 0.4, 5 * u, tr * 0.7);
        ctx.fillStyle = p.hedgeDark;
        ctx.beginPath();
        ctx.arc(tx, sy, tr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.hedge;
        ctx.beginPath();
        ctx.arc(tx - tr * 0.3, sy - tr * 0.25, tr * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Finish banner(s).
      const finishAt = (fd: number) => {
        const sy = ballScreenY - (fd - ballD) * u;
        if (sy < -40 * u || sy > h + 40 * u) return;
        const c = centerFrac(fd) * w;
        const hw = halfWidthFrac(fd) * w;
        const cell = Math.max(4, 12 * u);
        if (hw <= 0) return;
        for (let row = 0; row < 2; row++) {
          for (let x = c - hw; x < c + hw; x += cell) {
            const odd = (Math.floor(x / cell) + row) % 2 === 0;
            ctx.fillStyle = odd ? "#ffffff" : p.finish;
            ctx.fillRect(x, sy - cell + row * cell, Math.min(cell, c + hw - x), cell);
          }
        }
      };
      if (daily) {
        finishAt(COURSE_LEN);
      } else {
        finishAt((loops + 1) * COURSE_LEN);
      }

      // Junk on the path.
      const jLo = Math.max(0, Math.floor((ballD - (h - ballScreenY) / u) / ITEM_GAP) - 1);
      const jHi = Math.min(jLo + 60, Math.ceil((ballD + ballScreenY / u) / ITEM_GAP) + 1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let s = jLo; s <= jHi; s++) {
        if (takenSlots.has(s)) continue;
        const item = junkAt(s);
        if (!item) continue;
        const ix = item.fx * w;
        const iy = ballScreenY - (item.d - ballD) * u;
        if (iy < -30 * u || iy > h + 30 * u) continue;
        ctx.fillStyle = "rgba(0,0,0,0.14)";
        fillOval(ctx, ix, iy + 9 * u, 10 * u, 4 * u);
        // Bright halo so trash pops against the path.
        const bob = Math.sin(now * 0.004 + item.slot) * 1.5 * u;
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.beginPath();
        ctx.arc(ix, iy + bob, 12.5 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${Math.round(19 * u)}px sans-serif`;
        ctx.fillText(item.glyph, ix, iy + bob);
      }

      // The ball: white with rolling panel spots, junk orbiting Katamari-style.
      const flicker = iframes > 0 && Math.floor(now / 80) % 2 === 0;
      ctx.globalAlpha = flicker ? 0.45 : 1;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      fillOval(ctx, ballX, ballScreenY + r * 0.92, r * 0.85, r * 0.3);
      ctx.fillStyle = p.ball;
      ctx.beginPath();
      ctx.arc(ballX, ballScreenY, r, 0, Math.PI * 2);
      ctx.fill();
      // Rolling pentagon panels (vertical travel fakes forward roll).
      const spotXs = [-0.4, 0.32, -0.05];
      for (let i = 0; i < 3; i++) {
        const ph = ((ballRot * 0.16 + i / 3) % 1 + 1) % 1;
        const py = (ph * 2 - 1) * r * 0.8;
        const fore = Math.sqrt(Math.max(0, 1 - (py / r) ** 2));
        if (fore < 0.15) continue;
        const cx = ballX + spotXs[i] * r * fore;
        const cy = ballScreenY + py;
        const pr = r * 0.17;
        const spin = ballRot * 0.5 + i * 1.7;
        ctx.fillStyle = p.ballPanel;
        ctx.beginPath();
        for (let v = 0; v < 5; v++) {
          const a = spin + (v * Math.PI * 2) / 5 - Math.PI / 2;
          const vxp = cx + Math.cos(a) * pr * fore;
          const vyp = cy + Math.sin(a) * pr;
          if (v === 0) ctx.moveTo(vxp, vyp);
          else ctx.lineTo(vxp, vyp);
        }
        ctx.closePath();
        ctx.fill();
      }
      // Accreted junk rides around the ball.
      for (const item of attached) {
        const ph = ballRot * 0.9 + item.ang;
        const sph = Math.sin(ph);
        const cph = Math.cos(ph);
        if (cph < -0.35) continue; // hidden behind the ball
        const scale = (0.7 + 0.45 * Math.max(0, cph)) * junkScale;
        ctx.font = `${Math.round(Math.max(22 * u, r * 0.48) * scale)}px sans-serif`;
        ctx.globalAlpha = (flicker ? 0.45 : 1) * (0.7 + 0.3 * Math.max(0, cph));
        ctx.fillText(
          item.glyph,
          ballX + item.xOff * r * 0.8,
          ballScreenY + sph * r * 0.85,
        );
      }
      ctx.globalAlpha = 1;
      // Ball outline.
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(ballX, ballScreenY, r, 0, Math.PI * 2);
      ctx.stroke();

      // Particles (sparkles + dropped junk).
      for (const pa of particles) {
        const a = Math.max(0, pa.life / pa.maxLife);
        ctx.globalAlpha = a;
        if (pa.glyph) {
          ctx.font = `${Math.round(pa.r)}px sans-serif`;
          ctx.fillText(pa.glyph, pa.x, pa.y);
        } else {
          ctx.fillStyle = pa.color ?? "#fff";
          ctx.beginPath();
          ctx.arc(pa.x, pa.y, pa.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // HUD.
      const lowTime = timeLeftMs < 4000;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = lowTime && Math.floor(now / 250) % 2 === 0 ? p.danger : p.hudText;
      ctx.font = "bold 26px Nunito, sans-serif";
      ctx.fillText(fmtSeconds(timeLeftMs), w / 2, 34 * u);
      ctx.font = "bold 13px Nunito, sans-serif";
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = p.hudText;
      const sizeLabel = `x${(ballRadius() / (16 * unit())).toFixed(1)}`;
      const loopLabel = !daily && loops > 0 ? ` · lap ${loops + 1}` : "";
      ctx.fillText(`${collected} junk · ${sizeLabel}${loopLabel}`, w / 2, 52 * u);
      ctx.globalAlpha = 1;

      // Course progress bar.
      const progress = daily
        ? Math.min(1, ballD / COURSE_LEN)
        : (ballD % COURSE_LEN) / COURSE_LEN;
      const barW = w * 0.4;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(w / 2 - barW / 2, 60 * u, barW, 4 * u);
      ctx.fillStyle = p.finish;
      ctx.fillRect(w / 2 - barW / 2, 60 * u, barW * progress, 4 * u);
      ctx.textAlign = "left";
      } catch {
        /* Keep the loop alive: a single canvas exception used to freeze the park. */
        try {
          ctx.restore();
        } catch {
          /* ignore */
        }
      } finally {
        if (alive) raf = requestAnimationFrame(loop);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [layoutReady]);

  return (
    <canvas
      ref={canvasRef}
      className="block touch-none select-none"
      style={{ width, height }}
    />
  );
}
