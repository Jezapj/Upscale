/**
 * Daybreak — a rhythm platformer. One-button (tap / space / click) cube
 * jumping over procedurally generated terrain whose obstacles sit on the
 * beat grid of a randomly chosen musical key + BPM. All audio is synthesized
 * live; the AudioContext clock drives the scroll so music and level never
 * drift apart.
 */

import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import { createDaybreakAudio } from "./daybreak/audio";
import {
  COLUMNS_PER_BEAT,
  generateLevel,
  scoreDaybreak,
} from "./daybreak/levelGen";
import { ELEVATION_SPAN } from "./daybreak/musicTheory";
import { SHOW_NEAR_BACKGROUND } from "./daybreak/config";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
  /** Shell pause menu — freezes sim + suspends audio. */
  paused?: boolean;
}

// ── Physics tuning (rows / seconds / beats) ─────────────────────────────────
/** Jump apex in rows. High enough to clear 2–3 row walls with snap forgiveness. */
const JUMP_APEX_ROWS = 2.35;
/** Jump-pad launch apex — higher than a normal beat-timed jump. */
const PAD_APEX_ROWS = 4.2;
/** A full jump (take-off to landing at equal height) lasts exactly one beat. */
const JUMP_BEATS = 1;
/** Horizontal inset of the player hitbox, in columns. */
const PLAYER_INSET = 0.14;
/** Player body height in rows (used for ceiling / under-platform checks). */
const PLAYER_HEIGHT = 0.82;
/** Small elevation differences are auto-stepped instead of killing. */
const STEP_SNAP = 0.55;
/** Fixed physics timestep (240 Hz) keyed off the audio clock. */
const SIM_DT = 1 / 240;
/** Buffered-jump window in ms. */
const JUMP_BUFFER_MS = 120;
/** Falling below this row is a pitfall death. */
const PIT_DEATH_ROW = -ELEVATION_SPAN - 3.5;
/** Thin platform thickness in rows (visual + underside hit). */
const PLATFORM_THICK = 0.22;
/**
 * Sync window as a fraction of a semiquaver (1/4 beat). Hitting within this
 * of a crotchet, quaver, or semiquaver subdivision counts as on-beat.
 */
const SYNC_WINDOW_FRAC = 0.28;
/** How long the rainbow afterimage lasts after a jump-pad launch (seconds). */
const RAINBOW_FLASH_S = 0.85;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Afterimage {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
}

/** Smooth 0..1 ease for elevation color blends. */
function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Terrain / spike colors: deep blue (lows) → violet → soft pink (highs).
 * Hue stays in the blue/purple/pink family so adjacent elevations fade gently.
 */
function elevColors(elev: number, isDark: boolean) {
  const t = smooth01((elev + ELEVATION_SPAN) / (ELEVATION_SPAN * 2));
  // 218° blue → 275° purple → 328° pink
  const hue = t < 0.5 ? 218 + t * 2 * 57 : 275 + (t - 0.5) * 2 * 53;
  const sat = isDark ? 42 + t * 10 : 38 + t * 14;
  const light = isDark ? 20 + t * 16 : 30 + t * 20;
  const topLight = light + (isDark ? 16 : 20);
  const spikeLight = isDark ? 11 + t * 9 : 15 + t * 11;
  const deepLight = Math.max(8, light - (isDark ? 14 : 18));
  return {
    fill: `hsl(${hue} ${sat}% ${light}%)`,
    deep: `hsl(${hue} ${sat + 4}% ${deepLight}%)`,
    top: `hsl(${hue} ${Math.min(62, sat + 10)}% ${topLight}%)`,
    spike: `hsl(${hue} ${sat + 14}% ${spikeLight}%)`,
    spikeEdge: `hsl(${hue} ${Math.min(72, sat + 22)}% ${topLight + 6}%)`,
  };
}

/** Blend two elevation samples for softer column-to-column color steps. */
function blendElev(a: number, b: number, c: number): number {
  return a * 0.2 + b * 0.6 + c * 0.2;
}

export function DaybreakGame({
  width,
  height,
  onGameOver,
  paused = false,
}: Props) {
  const palette = useGamePalette();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const pausedRef = useRef(paused);
  const audioRef = useRef<ReturnType<typeof createDaybreakAudio> | null>(null);
  const wasPausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
    const audio = audioRef.current;
    if (!audio) return;
    if (paused && !wasPausedRef.current) {
      audio.pause();
    } else if (!paused && wasPausedRef.current) {
      audio.resume();
    }
    wasPausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const seed = Math.floor(Math.random() * 0x7fffffff);
    const level = generateLevel(seed);
    const audio = createDaybreakAudio(level.key, level.bpm);
    audioRef.current = audio;

    const beatDur = 60 / level.bpm;
    const colsPerSec = COLUMNS_PER_BEAT / beatDur;
    const jumpDur = beatDur * JUMP_BEATS;
    const gravity = (8 * JUMP_APEX_ROWS) / (jumpDur * jumpDur);
    const jumpVel = (gravity * jumpDur) / 2;
    // Same gravity, taller apex → stronger upward velocity from pads.
    const padJumpVel = Math.sqrt(2 * gravity * PAD_APEX_ROWS);

    const bgImg = new Image();
    bgImg.src = "/bg1.png";
    const playerImg = new Image();
    playerImg.src = "/Upscale.png";
    const sakura1 = new Image();
    sakura1.src = "/sakuratop1.png";
    const sakura2 = new Image();
    sakura2.src = "/sakuratop2.png";

    let alive = true;
    let raf = 0;
    let phase: "playing" | "dead" | "won" = "playing";
    let phaseAt = 0;
    let runStart = 0;
    let simTime = 0;
    let py = 0;
    let vy = 0;
    let grounded = true;
    let angle = 0;
    let attempts = 1;
    let bestX = 0;
    let syncJumps = 0;
    let rainbowUntil = 0;
    let rainbowStartedAt = 0;
    let finished = false;
    let jumpBufferedAt = -1;
    let holdJump = false;
    let camRow = 0;
    let lastFrameAt = performance.now();
    let particles: Particle[] = [];
    let afterimages: Afterimage[] = [];
    let afterimageAcc = 0;
    let clearedObstacles = new Set<number>();

    // Columns that count as "obstacles" for clear chords (built once per level).
    const obstacleCols = new Set<number>();
    {
      let prevFloor: number | null = 0;
      let prevPlat: number | null = null;
      for (let c = 0; c < level.totalColumns; c++) {
        const col = level.columns[c];
        if (col.spike || col.platformSpike) obstacleCols.add(c);
        if (col.floor === null && prevFloor !== null) obstacleCols.add(c);
        if (
          col.floor !== null &&
          prevFloor !== null &&
          col.floor > prevFloor
        ) {
          obstacleCols.add(c);
        }
        if (col.platform !== null && prevPlat === null) obstacleCols.add(c);
        prevFloor = col.floor;
        prevPlat = col.platform;
      }
    }

    const floorAt = (c: number): number | null => {
      if (c < 0) return 0;
      if (c >= level.totalColumns) return 0;
      return level.columns[c].floor;
    };
    const platformAt = (c: number): number | null => {
      if (c < 0 || c >= level.totalColumns) return null;
      return level.columns[c].platform;
    };
    const spikeAt = (c: number): boolean => {
      if (c < 0 || c >= level.totalColumns) return false;
      return level.columns[c].spike;
    };
    const platformSpikeAt = (c: number): boolean => {
      if (c < 0 || c >= level.totalColumns) return false;
      return level.columns[c].platformSpike;
    };
    const padAt = (c: number): boolean => {
      if (c < 0 || c >= level.totalColumns) return false;
      return level.columns[c].pad;
    };
    const xOf = (t: number) => Math.max(0, t) * colsPerSec;
    const clampElev = (r: number) =>
      Math.min(ELEVATION_SPAN, Math.max(-ELEVATION_SPAN, Math.round(r)));

    const spawnBurst = (
      x: number,
      y: number,
      count: number,
      colors: string[],
      speed: number,
      upward: boolean,
    ) => {
      for (let i = 0; i < count; i++) {
        const ang = upward
          ? Math.PI * (0.15 + Math.random() * 0.7)
          : Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.8);
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd - colsPerSec * 0.1,
          vy: Math.sin(ang) * spd,
          life: 0.35 + Math.random() * 0.4,
          maxLife: 0.75,
          size: 0.12 + Math.random() * 0.14,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    const explode = (x: number, y: number) => {
      const pal = paletteRef.current.daybreak;
      for (let i = 0; i < 42; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 14;
        particles.push({
          x,
          y: y + 0.5,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.5 + Math.random() * 0.6,
          maxLife: 1.1,
          size: 0.14 + Math.random() * 0.22,
          color:
            pal.particleDeath[
              Math.floor(Math.random() * pal.particleDeath.length)
            ],
        });
      }
    };

    const updateParticles = (dt: number) => {
      const next: Particle[] = [];
      for (const p of particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 22 * dt;
        next.push(p);
      }
      particles = next;
    };

    const updateAfterimages = (dt: number) => {
      const next: Afterimage[] = [];
      for (const a of afterimages) {
        a.life -= dt;
        if (a.life > 0) next.push(a);
      }
      afterimages = next;
    };

    const beginRun = () => {
      simTime = 0;
      py = 0;
      vy = 0;
      grounded = true;
      angle = 0;
      phase = "playing";
      particles = [];
      afterimages = [];
      afterimageAcc = 0;
      syncJumps = 0;
      rainbowUntil = 0;
      rainbowStartedAt = 0;
      clearedObstacles = new Set();
      jumpBufferedAt = -1;
      runStart = audio.startTrack();
    };

    const die = () => {
      if (phase !== "playing") return;
      phase = "dead";
      phaseAt = performance.now();
      bestX = Math.max(bestX, xOf(simTime));
      audio.stopTrack();
      audio.death();
      explode(xOf(simTime) + 0.5, py);
      afterimages = [];
    };

    const win = () => {
      if (phase !== "playing") return;
      phase = "won";
      phaseAt = performance.now();
      bestX = level.totalColumns;
      audio.stopTrack();
      audio.winFanfare();
    };

    const finish = (completed: boolean) => {
      if (finished) return;
      finished = true;
      const progress = Math.min(1, bestX / level.totalColumns);
      onGameOverRef.current({
        score: scoreDaybreak(level, progress, completed, syncJumps),
        title: completed ? "Level complete!" : "Run over",
        stats: [
          { label: "Key", value: level.key.name },
          { label: "BPM", value: `${level.bpm}` },
          { label: "Progress", value: `${Math.round(progress * 100)}%` },
          { label: "On-beat jumps", value: `${syncJumps}` },
          { label: "Attempts", value: `${attempts}` },
        ],
      });
    };

    /**
     * True when the jump lands near a crotchet, quaver, or semiquaver of the
     * track clock (16th-note grid covers all three subdivisions).
     */
    const isJumpOnBeat = (): boolean => {
      if (runStart <= 0) return false;
      const elapsed = Math.max(0, audio.time() - runStart);
      const sixteenth = beatDur / 4;
      const phase = elapsed % sixteenth;
      const dist = Math.min(phase, sixteenth - phase);
      const window = sixteenth * SYNC_WINDOW_FRAC;
      return dist <= window;
    };

    const doJump = () => {
      const fromElev = clampElev(py);
      vy = jumpVel;
      grounded = false;
      jumpBufferedAt = -1;
      if (isJumpOnBeat()) {
        syncJumps += 1;
      }
      audio.jumpNote(fromElev);
      spawnBurst(
        xOf(simTime) + 0.5,
        py,
        7,
        [paletteRef.current.daybreak.particleJump],
        3.5,
        false,
      );
    };

    const onLand = (row: number) => {
      audio.landNote(clampElev(row));
      angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      spawnBurst(
        xOf(simTime) + 0.5,
        row,
        5,
        [paletteRef.current.daybreak.particleLand],
        2.5,
        true,
      );
    };

    const triggerPad = (row: number) => {
      vy = padJumpVel;
      grounded = false;
      jumpBufferedAt = -1;
      rainbowStartedAt = performance.now();
      rainbowUntil = rainbowStartedAt + RAINBOW_FLASH_S * 1000;
      audio.padBoost(clampElev(row));
      spawnBurst(
        xOf(simTime) + 0.5,
        row,
        12,
        [paletteRef.current.daybreak.accent, paletteRef.current.daybreak.particleJump],
        6,
        true,
      );
    };

    /**
     * True if overlapping a jump pad on the current support, and the player's
     * center has reached the middle of that pad column (not just the leading edge).
     */
    const touchingPad = (
      c0: number,
      c1: number,
      support: number,
      playerX: number,
    ): boolean => {
      const center = playerX + 0.5;
      for (let c = c0; c <= c1; c++) {
        if (!padAt(c)) continue;
        const f = floorAt(c);
        if (f === null || Math.abs(f - support) >= 0.01) continue;
        if (center >= c + 0.5) return true;
      }
      return false;
    };

    /**
     * Highest landable surface under the player. Floors always count.
     * Thin platforms only count when approaching from above (or already on them).
     */
    const findSupport = (
      c0: number,
      c1: number,
      prevY: number,
      feet: number,
    ): number => {
      let support = -Infinity;
      for (let c = c0; c <= c1; c++) {
        const f = floorAt(c);
        if (f !== null && f > support) support = f;

        const p = platformAt(c);
        if (p === null) continue;
        // Already standing on / very near the platform, or falling onto it.
        const onOrAbove = prevY >= p - 0.08 || feet >= p - 0.08;
        if (onOrAbove && p > support) support = p;
      }
      return support;
    };

    const hitSpike = (
      c0: number,
      c1: number,
      left: number,
      right: number,
      bodyBottom: number,
      bodyTop: number,
      baseElev: number,
      isSpike: (c: number) => boolean,
    ): boolean => {
      for (let c = c0; c <= c1; c++) {
        if (!isSpike(c)) continue;
        const sx0 = c + 0.32;
        const sx1 = c + 0.68;
        if (
          right > sx0 &&
          left < sx1 &&
          bodyBottom < baseElev + 0.5 &&
          bodyTop > baseElev
        ) {
          return true;
        }
      }
      return false;
    };

    const step = (dt: number) => {
      const xNew = xOf(simTime + dt);
      const left = xNew + PLAYER_INSET;
      const right = xNew + 1 - PLAYER_INSET;
      const c0 = Math.floor(left);
      const c1 = Math.floor(right);
      const prevY = py;

      // Underside of thin platforms: rising into them kills.
      if (vy > 0) {
        for (let c = c0; c <= c1; c++) {
          const p = platformAt(c);
          if (p === null) continue;
          const prevTop = prevY + PLAYER_HEIGHT;
          const top = py + PLAYER_HEIGHT;
          if (prevTop <= p + 0.02 && top > p) {
            die();
            return;
          }
        }
      }

      const support = findSupport(c0, c1, prevY, py);

      if (grounded) {
        if (support === -Infinity || support < py - 0.001) {
          grounded = false;
          vy = 0;
        } else if (support > py + STEP_SNAP) {
          die();
          return;
        } else if (support > py) {
          py = support;
        }
      }

      if (!grounded) {
        vy -= gravity * dt;
        py += vy * dt;
        const supportNow = findSupport(c0, c1, prevY, py);
        if (supportNow !== -Infinity && py <= supportNow) {
          if (vy <= 0 && prevY >= supportNow - 0.0001) {
            py = supportNow;
            vy = 0;
            grounded = true;
            if (touchingPad(c0, c1, supportNow, xNew)) {
              triggerPad(supportNow);
            } else {
              onLand(supportNow);
            }
          } else if (supportNow - py <= STEP_SNAP) {
            py = supportNow;
            vy = 0;
            grounded = true;
            if (touchingPad(c0, c1, supportNow, xNew)) {
              triggerPad(supportNow);
            } else {
              onLand(supportNow);
            }
          } else {
            // Side-hit into a solid floor wall (not a thin platform).
            let solidWall = false;
            for (let c = c0; c <= c1; c++) {
              const f = floorAt(c);
              if (f !== null && f === supportNow) solidWall = true;
            }
            if (solidWall) {
              die();
              return;
            }
            // Glancing a thin platform edge while rising — treat as miss-under.
            py = prevY;
            vy = Math.min(vy, 0);
          }
        }
      }

      const bodyBottom = py + 0.04;
      const bodyTop = py + PLAYER_HEIGHT;

      // Floor spikes.
      for (let c = c0; c <= c1; c++) {
        if (!spikeAt(c)) continue;
        const f = floorAt(c);
        if (f === null) continue;
        if (
          hitSpike(c, c, left, right, bodyBottom, bodyTop, f, () => true)
        ) {
          die();
          return;
        }
      }

      // Platform spikes.
      for (let c = c0; c <= c1; c++) {
        if (!platformSpikeAt(c)) continue;
        const p = platformAt(c);
        if (p === null) continue;
        if (
          hitSpike(c, c, left, right, bodyBottom, bodyTop, p, () => true)
        ) {
          die();
          return;
        }
      }

      if (py < PIT_DEATH_ROW) {
        die();
        return;
      }

      if (!grounded) {
        angle += (Math.PI / jumpDur) * dt;
      }

      // Jump pads auto-launch once the player reaches the middle of the pad.
      if (grounded && phase === "playing") {
        const feetSupport = support !== -Infinity ? py : -Infinity;
        if (
          feetSupport !== -Infinity &&
          touchingPad(c0, c1, feetSupport, xNew)
        ) {
          triggerPad(feetSupport);
        }
      }

      if (grounded && phase === "playing") {
        const buffered =
          jumpBufferedAt >= 0 &&
          performance.now() - jumpBufferedAt < JUMP_BUFFER_MS;
        if (buffered || holdJump) doJump();
      }

      // Chord when the player clears past an obstacle column.
      if (phase === "playing") {
        const passX = xNew + 0.55;
        const col = Math.floor(passX);
        if (obstacleCols.has(col) && !clearedObstacles.has(col)) {
          clearedObstacles.add(col);
          audio.clearChord(clampElev(py));
        }
      }

      if (xNew >= level.totalColumns) win();
    };

    const queueJump = () => {
      jumpBufferedAt = performance.now();
      holdJump = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (!e.repeat && !pausedRef.current) queueJump();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        holdJump = false;
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      if (!pausedRef.current) queueJump();
    };
    const releaseHold = () => {
      holdJump = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", releaseHold);
    window.addEventListener("pointercancel", releaseHold);

    const syncCanvas = () => {
      const { width: w, height: h } = sizeRef.current;
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawSpike = (
      gx: number,
      gy: number,
      colW: number,
      rowH: number,
      fill: string,
      edge: string,
    ) => {
      const steps = 5;
      const bandH = rowH / steps;
      for (let i = 0; i < steps; i++) {
        const frac = 1 - i / steps;
        const bw = colW * frac;
        const bx = gx + (colW - bw) / 2;
        const by = gy - (i + 1) * bandH;
        g.fillStyle = edge;
        g.fillRect(bx, by, bw, bandH + 0.5);
        const inset = Math.min(2, bw * 0.2);
        g.fillStyle = fill;
        g.fillRect(bx + inset, by + inset * 0.5, bw - inset * 2, bandH);
      }
    };

    // Offscreen buffer so rainbow tint stays tight to the PNG alpha.
    const spriteBuf = document.createElement("canvas");
    const spriteBufCtx = spriteBuf.getContext("2d");

    const drawPlayerSprite = (
      cx: number,
      cy: number,
      size: number,
      rot: number,
      alpha: number,
      accent: string,
      rainbowIntensity = 0,
    ) => {
      const pad = 2;
      const dim = Math.ceil(size) + pad * 2;
      if (!spriteBufCtx) {
        g.save();
        g.translate(cx, cy);
        g.rotate(rot);
        g.globalAlpha = alpha;
        if (playerImg.complete && playerImg.naturalWidth > 0) {
          g.drawImage(playerImg, -size / 2, -size / 2, size, size);
        } else {
          g.fillStyle = accent;
          g.fillRect(-size / 2, -size / 2, size, size);
        }
        g.restore();
        g.globalAlpha = 1;
        return;
      }

      if (spriteBuf.width !== dim || spriteBuf.height !== dim) {
        spriteBuf.width = dim;
        spriteBuf.height = dim;
      }
      const gc = spriteBufCtx;
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.clearRect(0, 0, dim, dim);
      gc.imageSmoothingEnabled = false;

      if (playerImg.complete && playerImg.naturalWidth > 0) {
        gc.drawImage(playerImg, pad, pad, size, size);
      } else {
        gc.fillStyle = accent;
        gc.fillRect(pad, pad, size, size);
      }

      if (rainbowIntensity > 0.01) {
        // PNG-tight rainbow wash on afterimages; intensity fades via the caller.
        gc.globalCompositeOperation = "source-atop";
        const t = performance.now() / 45;
        const bands = 9;
        const peak = 0.7 * rainbowIntensity;
        for (let i = 0; i < bands; i++) {
          const hue = (t * 24 + i * (360 / bands)) % 360;
          gc.globalAlpha = peak;
          gc.fillStyle = `hsl(${hue} 100% 56%)`;
          const bandH = size / bands;
          gc.fillRect(pad, pad + i * bandH, size, bandH + 0.5);
        }
        gc.globalAlpha = 1;
        gc.globalCompositeOperation = "source-over";
      }

      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.globalAlpha = alpha;
      g.drawImage(spriteBuf, -size / 2 - pad, -size / 2 - pad);
      g.restore();
      g.globalAlpha = 1;
    };

    const draw = (xView: number) => {
      const { width: W, height: H } = sizeRef.current;
      const pal = paletteRef.current.daybreak;
      const isDark = paletteRef.current.isDark;
      g.imageSmoothingEnabled = false;

      // Tight zoom: large tiles, player low-left so almost nothing trails behind.
      const rowH = Math.min(78, Math.max(48, Math.floor(H / 8.5)));
      const colW = rowH;
      const playerScreenX = W * 0.15;
      const baseY = H * 0.58;
      const rowToY = (r: number) => baseY - (r - camRow) * rowH;
      const screenX = (c: number) => playerScreenX + (c - xView) * colW;

      g.fillStyle = isDark ? "#131022" : "#f6e3ea";
      g.fillRect(0, 0, W, H);

      // Beat pulse: strong background blur that snaps back into focus.
      let beatBlur = 0;
      if (phase === "playing" && runStart > 0 && !pausedRef.current) {
        const elapsed = Math.max(0, audio.time() - runStart);
        const phaseInBeat = (elapsed % beatDur) / beatDur;
        const nearBeat = Math.min(phaseInBeat, 1 - phaseInBeat);
        const beatW = 0.06;
        if (nearBeat < beatW) {
          beatBlur = 14 * (1 - nearBeat / beatW);
        }
      }

      if (bgImg.complete && bgImg.naturalWidth > 0) {
        const scroll = xView * colW;
        const bgY = -H * 0.3;
        const farH = H * 1.32;
        const farW = (bgImg.naturalWidth * farH) / bgImg.naturalHeight;
        let off = -((scroll * 0.12) % farW);
        g.save();
        if (beatBlur > 0.05) g.filter = `blur(${beatBlur}px)`;
        for (let dx = off - farW; dx < W + farW; dx += farW) {
          g.drawImage(bgImg, dx, bgY, farW, farH);
        }
        if (SHOW_NEAR_BACKGROUND) {
          const nearH = H * 1.4;
          const nearW = (bgImg.naturalWidth * nearH) / bgImg.naturalHeight;
          g.globalAlpha = 0.52;
          off = -((scroll * 0.3) % nearW);
          for (let dx = off - nearW; dx < W + nearW; dx += nearW) {
            g.drawImage(bgImg, dx, H - nearH * 0.7 - H * 0.25, nearW, nearH);
          }
          g.globalAlpha = 1;
        }
        g.restore();
        g.filter = "none";
      }
      g.fillStyle = pal.bgOverlay;
      g.fillRect(0, 0, W, H);

      const scrollPx = xView * colW;

      // Draw far enough left that terrain fills behind the player and despawns
      // only once fully off-screen (player sits at ~15% from the left edge).
      const behindCols = Math.ceil(playerScreenX / colW) + 4;
      const c0 = Math.floor(xView) - behindCols;
      const c1 = c0 + Math.ceil(W / colW) + behindCols + 4;
      for (let c = c0; c <= c1; c++) {
        const f = floorAt(c);
        if (f !== null) {
          const gx = screenX(c);
          const gy = rowToY(f);
          const fL = floorAt(c - 1);
          const fR = floorAt(c + 1);
          const colorElev = blendElev(
            fL !== null ? fL : f,
            f,
            fR !== null ? fR : f,
          );
          const cols = elevColors(colorElev, isDark);
          const fillH = Math.max(0, H - gy);
          if (fillH > 0) {
            const grad = g.createLinearGradient(gx, gy, gx, gy + fillH);
            grad.addColorStop(0, cols.fill);
            grad.addColorStop(0.55, cols.fill);
            grad.addColorStop(1, cols.deep);
            g.fillStyle = grad;
            g.fillRect(gx, gy, colW + 1, fillH);
          }
          // Soft top lip: blend toward neighbor elevations for a gentler step edge.
          const topGrad = g.createLinearGradient(gx, gy, gx + colW, gy);
          const leftCols = elevColors(fL !== null ? (fL + f) * 0.5 : colorElev, isDark);
          const rightCols = elevColors(fR !== null ? (fR + f) * 0.5 : colorElev, isDark);
          topGrad.addColorStop(0, leftCols.top);
          topGrad.addColorStop(0.5, cols.top);
          topGrad.addColorStop(1, rightCols.top);
          g.fillStyle = topGrad;
          g.fillRect(gx, gy, colW + 1, Math.max(3, Math.round(rowH * 0.1)));
          if (c % COLUMNS_PER_BEAT === 0) {
            g.fillStyle = pal.beatMarker;
            g.fillRect(gx, gy + 3, 2, Math.max(0, H - gy - 3));
          }
          if (spikeAt(c)) {
            drawSpike(gx, gy, colW, rowH, cols.spike, cols.spikeEdge);
          }
          if (padAt(c)) {
            // Flattened semicircle jump pad (GD yellow-pad vibe).
            const padH = Math.max(4, rowH * 0.28);
            const padW = colW * 0.92;
            const px0 = gx + (colW - padW) / 2;
            g.fillStyle = "#f0c14a";
            g.beginPath();
            g.moveTo(px0, gy);
            g.quadraticCurveTo(gx + colW / 2, gy - padH, px0 + padW, gy);
            g.closePath();
            g.fill();
            g.fillStyle = "#ffe08a";
            g.beginPath();
            g.moveTo(px0 + padW * 0.15, gy);
            g.quadraticCurveTo(
              gx + colW / 2,
              gy - padH * 0.65,
              px0 + padW * 0.85,
              gy,
            );
            g.closePath();
            g.fill();
          }
        }

        const p = platformAt(c);
        if (p !== null) {
          const gx = screenX(c);
          const gy = rowToY(p);
          const pL = platformAt(c - 1);
          const pR = platformAt(c + 1);
          const colorElev = blendElev(
            pL !== null ? pL : p,
            p,
            pR !== null ? pR : p,
          );
          const cols = elevColors(colorElev, isDark);
          const thick = Math.max(4, rowH * PLATFORM_THICK);
          const platGrad = g.createLinearGradient(gx, gy - thick, gx, gy);
          platGrad.addColorStop(0, cols.top);
          platGrad.addColorStop(1, cols.fill);
          g.fillStyle = platGrad;
          g.fillRect(gx, gy - thick, colW + 1, thick);
          if (platformSpikeAt(c)) {
            drawSpike(gx, gy - thick, colW, rowH, cols.spike, cols.spikeEdge);
          }
        }
      }

      if (level.totalColumns - xView < W / colW) {
        const fx = screenX(level.totalColumns);
        g.fillStyle = pal.accent;
        g.fillRect(fx, 0, 4, H);
        g.globalAlpha = 0.35;
        g.fillRect(fx + 4, 0, 12, H);
        g.globalAlpha = 1;
      }

      const size = rowH * 0.94;

      // Faint afterimage trail; jump pads tint the trail rainbow (PNG-tight).
      if (phase !== "dead") {
        const now = performance.now();
        let rainbowIntensity = 0;
        if (now < rainbowUntil && rainbowUntil > rainbowStartedAt) {
          const u =
            (now - rainbowStartedAt) / (rainbowUntil - rainbowStartedAt);
          // Smooth fade in and out (sine hump).
          rainbowIntensity = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
        }
        for (const a of afterimages) {
          const alpha = Math.max(0, (a.life / a.maxLife) * 0.28);
          const cx = screenX(a.x) + colW / 2;
          const cy = rowToY(a.y) - rowH / 2;
          drawPlayerSprite(
            cx,
            cy,
            size * 0.96,
            a.angle,
            Math.max(alpha, rainbowIntensity > 0 ? 0.62 * rainbowIntensity : alpha),
            pal.accent,
            rainbowIntensity,
          );
        }

        const cx = playerScreenX + colW / 2;
        const cy = rowToY(py) - rowH / 2;
        drawPlayerSprite(cx, cy, size, angle, 1, pal.accent, 0);
      }

      for (const p of particles) {
        g.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.6)));
        g.fillStyle = p.color;
        const ps = Math.max(2, p.size * rowH);
        g.fillRect(screenX(p.x) - ps / 2, rowToY(p.y) - ps / 2, ps, ps);
      }
      g.globalAlpha = 1;

      // Sakura canopy in front of the player (near parallax).
      if (
        sakura1.complete &&
        sakura1.naturalWidth > 0 &&
        sakura2.complete &&
        sakura2.naturalWidth > 0
      ) {
        // Wide tiles + a hard gap after each bloom so another takes longer to appear.
        const tile = Math.max(900, rowH * 16);
        const minGap = tile * 0.85;
        const rate = 1.05;
        const scroll = scrollPx * rate;
        const frac = ((scroll % tile) + tile) % tile;
        const baseTile = Math.floor(scroll / tile);
        const hangH = H * 0.7;
        let lastRight = -Infinity;
        for (let i = -2; i <= Math.ceil(W / tile) + 2; i++) {
          const tileIndex = baseTile + i;
          const h = Math.imul(tileIndex ^ 0x27d4eb2d, 0xc2b2ae35) >>> 0;
          // Rarer spawn chance within each tile.
          if (h % 13 !== 0) continue;
          const img = (h >>> 4) % 2 === 0 ? sakura1 : sakura2;
          const localX = ((h >>> 10) % 45) / 100;
          // Bigger overall, with noticeable size variety between blooms.
          const sizeRoll = ((h >>> 20) % 100) / 100;
          const scale = 0.88 + sizeRoll * 0.45; // ~0.88–1.33×
          const drawH = hangH * scale;
          const drawW = (img.naturalWidth / img.naturalHeight) * drawH;
          const sx = i * tile - frac + localX * (tile * 0.25);
          if (sx + drawW < -80 || sx > W + 80) continue;
          if (sx < lastRight + minGap) continue;
          lastRight = sx + drawW;
          g.globalAlpha = 0.78;
          g.drawImage(img, sx, -drawH * 0.1, drawW, drawH);
        }
        g.globalAlpha = 1;
      }

      if (phase === "dead") {
        const k = Math.max(0, 1 - (performance.now() - phaseAt) / 400);
        g.fillStyle = `rgba(255, 70, 70, ${0.22 * k})`;
        g.fillRect(0, 0, W, H);
      }

      const progress = Math.min(1, xView / level.totalColumns);
      const barW = Math.min(W * 0.42, 260);
      const barX = (W - barW) / 2;
      g.fillStyle = pal.progressTrack;
      g.fillRect(barX, 14, barW, 8);
      g.fillStyle = pal.accent;
      g.fillRect(barX, 14, barW * progress, 8);

      g.font = "800 12px Nunito, sans-serif";
      g.textBaseline = "top";
      const chip = (text: string, x: number, y: number) => {
        const tw = g.measureText(text).width;
        g.fillStyle = pal.hudChip;
        g.fillRect(x - 6, y - 4, tw + 12, 21);
        g.fillStyle = pal.hudText;
        g.fillText(text, x, y);
      };
      g.textAlign = "left";
      chip(`${level.key.name} · ${level.bpm} BPM`, 14, 12);
      chip(`Attempt ${attempts} · ${syncJumps} on-beat`, 14, 38);
      g.textAlign = "center";
      g.fillStyle = pal.hudText;
      g.fillText(`${Math.round(progress * 100)}%`, barX + barW / 2, 26);
      g.textAlign = "left";

      if (attempts === 1 && xView < 12 && phase === "playing") {
        g.font = "800 15px Nunito, sans-serif";
        g.textAlign = "center";
        chipCentered(
          `Jump on the beat for bonus points`,
          W / 2,
          H * 0.28,
        );
        g.textAlign = "left";
      }

      if (phase === "won") {
        g.font = "800 26px 'Baloo 2', Nunito, sans-serif";
        g.textAlign = "center";
        g.fillStyle = pal.accent;
        g.fillText("Level complete!", W / 2, H * 0.32);
        g.textAlign = "left";
      }
    };

    const chipCentered = (text: string, cx: number, y: number) => {
      const pal = paletteRef.current.daybreak;
      const tw = g.measureText(text).width;
      g.fillStyle = pal.hudChip;
      g.fillRect(cx - tw / 2 - 8, y - 5, tw + 16, 26);
      g.fillStyle = pal.hudText;
      g.fillText(text, cx, y);
    };

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      syncCanvas();

      const now = performance.now();
      const frameDt = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      if (!pausedRef.current) {
        if (phase === "playing") {
          const target = Math.max(0, audio.time() - runStart);
          let guard = 0;
          while (simTime + SIM_DT <= target && guard++ < 4000) {
            step(SIM_DT);
            simTime += SIM_DT;
            if (phase !== "playing") break;
          }

          afterimageAcc += frameDt;
          if (afterimageAcc >= 0.035) {
            afterimageAcc = 0;
            afterimages.push({
              x: xOf(simTime),
              y: py,
              angle,
              life: 0.32,
              maxLife: 0.32,
            });
            if (afterimages.length > 10) afterimages.shift();
          }
        } else if (phase === "dead") {
          if (now - phaseAt > 950) {
            attempts++;
            beginRun();
          }
        } else if (phase === "won") {
          if (now - phaseAt > 900) finish(true);
        }
        updateParticles(frameDt);
        updateAfterimages(frameDt);

        const targetCam = Math.min(5, Math.max(-5, py * 0.85));
        camRow += (targetCam - camRow) * Math.min(1, frameDt * 5);
      }

      draw(xOf(simTime));
    };

    lastFrameAt = performance.now();
    beginRun();
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", releaseHold);
      window.removeEventListener("pointercancel", releaseHold);
      audioRef.current = null;
      audio.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none select-none"
    />
  );
}
