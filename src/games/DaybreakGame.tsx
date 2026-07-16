/**
 * Daybreak — a rhythm platformer. One-button (tap / space / click) cube
 * jumping over procedurally generated terrain whose obstacles sit on the
 * beat grid of a randomly chosen musical key + BPM. All audio is synthesized
 * live; the AudioContext clock drives the scroll so music and level never
 * drift apart.
 */

import { useEffect, useRef, useState } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import { createDaybreakAudio } from "./daybreak/audio";
import {
  COLUMNS_PER_BEAT,
  generateLevel,
  scoreDaybreak,
  type DaybreakLevel,
} from "./daybreak/levelGen";
import { ELEVATION_SPAN } from "./daybreak/musicTheory";
import { SHOW_NEAR_BACKGROUND } from "./daybreak/config";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
}

// ── Physics tuning (rows / seconds / beats) ─────────────────────────────────
/** Jump apex in rows. High enough to clear 2–3 row walls with snap forgiveness. */
const JUMP_APEX_ROWS = 2.35;
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
/** How long afterimage rainbow lasts after a synced jump (seconds). */
const RAINBOW_FLASH_S = 0.56;

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

interface PauseActions {
  resume: () => void;
  restart: () => void;
  endRun: () => void;
}

/** Terrain / spike colors shift with elevation (cool lows → warm highs). */
function elevColors(elev: number, isDark: boolean) {
  const t = (elev + ELEVATION_SPAN) / (ELEVATION_SPAN * 2); // 0..1
  const hue = 255 - t * 195; // deep blue → orange
  const sat = isDark ? 48 : 42;
  const light = isDark ? 22 + t * 18 : 28 + t * 22;
  const topLight = light + (isDark ? 18 : 22);
  const spikeLight = isDark ? 12 + t * 10 : 16 + t * 12;
  return {
    fill: `hsl(${hue} ${sat}% ${light}%)`,
    top: `hsl(${hue} ${sat + 8}% ${topLight}%)`,
    spike: `hsl(${hue} ${sat + 12}% ${spikeLight}%)`,
    spikeEdge: `hsl(${hue} ${Math.min(70, sat + 25)}% ${topLight + 8}%)`,
  };
}

export function DaybreakGame({ width, height, onGameOver }: Props) {
  const palette = useGamePalette();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [levelInfo, setLevelInfo] = useState<DaybreakLevel | null>(null);
  const pauseActionsRef = useRef<PauseActions>({
    resume: () => {},
    restart: () => {},
    endRun: () => {},
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const seed = Math.floor(Math.random() * 0x7fffffff);
    const level = generateLevel(seed);
    const audio = createDaybreakAudio(level.key, level.bpm);
    setLevelInfo(level);

    const beatDur = 60 / level.bpm;
    const colsPerSec = COLUMNS_PER_BEAT / beatDur;
    const jumpDur = beatDur * JUMP_BEATS;
    const gravity = (8 * JUMP_APEX_ROWS) / (jumpDur * jumpDur);
    const jumpVel = (gravity * jumpDur) / 2;

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
    let pauseRect = { x: 0, y: 0, w: 0, h: 0 };
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
        rainbowStartedAt = performance.now();
        rainbowUntil = rainbowStartedAt + RAINBOW_FLASH_S * 1000;
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
            onLand(supportNow);
          } else if (supportNow - py <= STEP_SNAP) {
            py = supportNow;
            vy = 0;
            grounded = true;
            onLand(supportNow);
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

    const pauseGame = () => {
      if (pausedRef.current || phase !== "playing" || finished) return;
      pausedRef.current = true;
      setPaused(true);
      audio.pause();
    };

    const resumeGame = () => {
      if (!pausedRef.current) return;
      pausedRef.current = false;
      setPaused(false);
      audio.resume();
      lastFrameAt = performance.now();
    };

    const restartLevel = () => {
      attempts = 1;
      bestX = 0;
      pausedRef.current = false;
      setPaused(false);
      audio.resume();
      beginRun();
      lastFrameAt = performance.now();
    };

    const endRun = () => {
      bestX = Math.max(bestX, xOf(simTime));
      pausedRef.current = false;
      setPaused(false);
      audio.resume();
      finish(false);
    };

    pauseActionsRef.current = {
      resume: resumeGame,
      restart: restartLevel,
      endRun,
    };

    const queueJump = () => {
      jumpBufferedAt = performance.now();
      holdJump = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (!e.repeat && !pausedRef.current) queueJump();
      } else if (e.key === "Escape") {
        if (pausedRef.current) resumeGame();
        else pauseGame();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        holdJump = false;
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const { x, y, w, h } = pauseRect;
      const pad = 6;
      if (
        e.offsetX >= x - pad &&
        e.offsetX <= x + w + pad &&
        e.offsetY >= y - pad &&
        e.offsetY <= y + h + pad
      ) {
        pauseGame();
        return;
      }
      queueJump();
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
        // Subtle PNG-tight wash; intensity fades in/out via the caller.
        gc.globalCompositeOperation = "source-atop";
        const t = performance.now() / 55;
        const bands = 8;
        const peak = 0.4 * rainbowIntensity;
        for (let i = 0; i < bands; i++) {
          const hue = (t * 18 + i * (360 / bands)) % 360;
          gc.globalAlpha = peak;
          gc.fillStyle = `hsl(${hue} 95% 58%)`;
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

      if (bgImg.complete && bgImg.naturalWidth > 0) {
        const scroll = xView * colW;
        // Shift the art upward so the lake/mountains (main midground) sit
        // higher in frame — crop a bit of empty sky, keep the scenic band.
        const bgY = -H * 0.3;
        const farH = H * 1.32;
        const farW = (bgImg.naturalWidth * farH) / bgImg.naturalHeight;
        let off = -((scroll * 0.12) % farW);
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
          const cols = elevColors(f, isDark);
          g.fillStyle = cols.fill;
          g.fillRect(gx, gy, colW + 1, Math.max(0, H - gy));
          g.fillStyle = cols.top;
          g.fillRect(gx, gy, colW + 1, Math.max(3, Math.round(rowH * 0.08)));
          if (c % COLUMNS_PER_BEAT === 0) {
            g.fillStyle = pal.beatMarker;
            g.fillRect(gx, gy + 3, 2, Math.max(0, H - gy - 3));
          }
          if (spikeAt(c)) {
            drawSpike(gx, gy, colW, rowH, cols.spike, cols.spikeEdge);
          }
        }

        const p = platformAt(c);
        if (p !== null) {
          const gx = screenX(c);
          const gy = rowToY(p);
          const cols = elevColors(p, isDark);
          const thick = Math.max(4, rowH * PLATFORM_THICK);
          g.fillStyle = cols.fill;
          g.fillRect(gx, gy - thick, colW + 1, thick);
          g.fillStyle = cols.top;
          g.fillRect(gx, gy - thick, colW + 1, Math.max(2, thick * 0.35));
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

      // Faint afterimage trail; on-beat jumps tint the trail rainbow (PNG-tight).
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
            Math.max(alpha, rainbowIntensity > 0 ? 0.4 * rainbowIntensity : alpha),
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

      const pb = { x: W - 48, y: 12, w: 34, h: 34 };
      pauseRect = pb;
      g.fillStyle = pal.hudChip;
      g.fillRect(pb.x, pb.y, pb.w, pb.h);
      g.fillStyle = pal.hudText;
      g.fillRect(pb.x + 10, pb.y + 9, 5, 16);
      g.fillRect(pb.x + 19, pb.y + 9, 5, 16);

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
      audio.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none"
      />
      {paused && (
        <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="game-shell-title font-display text-2xl font-800">
            Paused
          </p>
          {levelInfo && (
            <p className="text-sm font-700 text-ink-soft">
              {levelInfo.key.name} · {levelInfo.bpm} BPM
            </p>
          )}
          <button
            type="button"
            className="btn px-8"
            onClick={() => pauseActionsRef.current.resume()}
          >
            Resume
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => pauseActionsRef.current.restart()}
          >
            Restart level
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => pauseActionsRef.current.endRun()}
          >
            End run
          </button>
        </div>
      )}
    </div>
  );
}
