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

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
}

// ── Physics tuning (rows / seconds / beats) ─────────────────────────────────
/** Jump apex in rows. High enough to clear 2-row walls with snap forgiveness. */
const JUMP_APEX_ROWS = 2.25;
/** A full jump (take-off to landing at equal height) lasts exactly one beat. */
const JUMP_BEATS = 1;
/** Horizontal inset of the player hitbox, in columns. */
const PLAYER_INSET = 0.14;
/** Small elevation differences are auto-stepped instead of killing. */
const STEP_SNAP = 0.55;
/** Fixed physics timestep (240 Hz) keyed off the audio clock. */
const SIM_DT = 1 / 240;
/** Buffered-jump window in ms. */
const JUMP_BUFFER_MS = 120;
/** Falling below this row is a pitfall death. */
const PIT_DEATH_ROW = -ELEVATION_SPAN - 3.5;

interface Particle {
  x: number; // world columns
  y: number; // world rows
  vx: number; // columns/s
  vy: number; // rows/s
  life: number; // seconds remaining
  maxLife: number;
  size: number; // fraction of a row
  color: string;
}

interface PauseActions {
  resume: () => void;
  restart: () => void;
  endRun: () => void;
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

    // ── Session setup: one seed per mount, so death replays the same level ──
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const level = generateLevel(seed);
    const audio = createDaybreakAudio(level.key, level.bpm);
    setLevelInfo(level);

    const beatDur = 60 / level.bpm;
    const colsPerSec = COLUMNS_PER_BEAT / beatDur;
    const jumpDur = beatDur * JUMP_BEATS;
    const gravity = (8 * JUMP_APEX_ROWS) / (jumpDur * jumpDur); // rows/s²
    const jumpVel = (gravity * jumpDur) / 2; // rows/s

    // ── Assets ───────────────────────────────────────────────────────────────
    const bgImg = new Image();
    bgImg.src = "/bg1.png";
    const playerImg = new Image();
    playerImg.src = "/Upscale.png";

    // ── Run state ────────────────────────────────────────────────────────────
    let alive = true;
    let raf = 0;
    let phase: "playing" | "dead" | "won" = "playing";
    let phaseAt = 0; // performance.now() when the phase changed
    let runStart = 0; // audio.time() at which x = 0
    let simTime = 0; // seconds of simulated run time (fixed steps)
    let py = 0; // player feet, in rows
    let vy = 0; // rows/s
    let grounded = true;
    let angle = 0; // player sprite rotation (radians)
    let attempts = 1;
    let bestX = 0;
    let finished = false;
    let jumpBufferedAt = -1;
    let holdJump = false;
    let camRow = 0;
    let lastFrameAt = performance.now();
    let particles: Particle[] = [];
    let pauseRect = { x: 0, y: 0, w: 0, h: 0 };

    const floorAt = (c: number): number | null => {
      if (c < 0) return 0;
      if (c >= level.totalColumns) return 0;
      return level.columns[c].floor;
    };
    const spikeAt = (c: number): boolean => {
      if (c < 0 || c >= level.totalColumns) return false;
      return level.columns[c].spike;
    };
    const xOf = (t: number) => Math.max(0, t) * colsPerSec;
    const clampElev = (r: number) =>
      Math.min(ELEVATION_SPAN, Math.max(-ELEVATION_SPAN, Math.round(r)));

    // ── Particles ────────────────────────────────────────────────────────────
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

    // ── Run control ──────────────────────────────────────────────────────────
    const beginRun = () => {
      simTime = 0;
      py = 0;
      vy = 0;
      grounded = true;
      angle = 0;
      phase = "playing";
      particles = [];
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
        score: scoreDaybreak(level, progress, completed),
        title: completed ? "Level complete!" : "Run over",
        stats: [
          { label: "Key", value: level.key.name },
          { label: "BPM", value: `${level.bpm}` },
          { label: "Progress", value: `${Math.round(progress * 100)}%` },
          { label: "Attempts", value: `${attempts}` },
        ],
      });
    };

    // ── Physics step (fixed timestep on the audio clock) ────────────────────
    const doJump = () => {
      const fromElev = clampElev(py);
      vy = jumpVel;
      grounded = false;
      jumpBufferedAt = -1;
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
      // Snap the sprite to the nearest quarter-turn, GD style.
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

    const step = (dt: number) => {
      const xNew = xOf(simTime + dt);
      const left = xNew + PLAYER_INSET;
      const right = xNew + 1 - PLAYER_INSET;
      const c0 = Math.floor(left);
      const c1 = Math.floor(right);

      // Highest solid floor under any column the player overlaps.
      let support = -Infinity;
      for (let c = c0; c <= c1; c++) {
        const f = floorAt(c);
        if (f !== null && f > support) support = f;
      }

      const prevY = py;

      if (grounded) {
        if (support === -Infinity || support < py - 0.001) {
          // Walked off an edge or the floor dropped: start falling.
          grounded = false;
          vy = 0;
        } else if (support > py + STEP_SNAP) {
          die(); // ran face-first into a wall
          return;
        } else if (support > py) {
          py = support; // forgiving auto-step for sub-snap rises
        }
      }

      if (!grounded) {
        vy -= gravity * dt;
        py += vy * dt;
        if (support !== -Infinity && py <= support) {
          if (vy <= 0 && prevY >= support - 0.0001) {
            // Clean landing from above.
            py = support;
            vy = 0;
            grounded = true;
            onLand(support);
          } else if (support - py <= STEP_SNAP) {
            // Barely clipped a ledge: snap up onto it.
            py = support;
            vy = 0;
            grounded = true;
            onLand(support);
          } else {
            die(); // slammed into the side of a wall mid-air
            return;
          }
        }
      }

      // Spikes: forgiving hitbox smaller than the visual triangle.
      const bodyBottom = py + 0.04;
      const bodyTop = py + 0.8;
      for (let c = c0; c <= c1; c++) {
        if (!spikeAt(c)) continue;
        const f = floorAt(c);
        if (f === null) continue;
        const sx0 = c + 0.32;
        const sx1 = c + 0.68;
        if (right > sx0 && left < sx1 && bodyBottom < f + 0.5 && bodyTop > f) {
          die();
          return;
        }
      }

      // Pitfall death.
      if (py < PIT_DEATH_ROW) {
        die();
        return;
      }

      // Rotate in the air: a half-turn per full jump.
      if (!grounded) {
        angle += (Math.PI / jumpDur) * dt;
      }

      // Buffered / held jumps fire the moment we're grounded.
      if (grounded && phase === "playing") {
        const buffered =
          jumpBufferedAt >= 0 &&
          performance.now() - jumpBufferedAt < JUMP_BUFFER_MS;
        if (buffered || holdJump) doJump();
      }

      if (xNew >= level.totalColumns) win();
    };

    // ── Pause / menu actions ─────────────────────────────────────────────────
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

    // ── Input ────────────────────────────────────────────────────────────────
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

    // ── Rendering ────────────────────────────────────────────────────────────
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
      // Chunky pixel triangle built from stacked rects, 1 row tall.
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

    const draw = (xView: number) => {
      const { width: W, height: H } = sizeRef.current;
      const pal = paletteRef.current.daybreak;
      const isDark = paletteRef.current.isDark;
      g.imageSmoothingEnabled = false;

      const rowH = Math.min(36, Math.max(12, Math.floor(H / 24)));
      const colW = rowH;
      const playerScreenX = W * 0.28;
      const baseY = H * 0.62;
      const rowToY = (r: number) => baseY - (r - camRow) * rowH;
      const screenX = (c: number) => playerScreenX + (c - xView) * colW;

      // Sky fallback under the image (also shows before bg loads).
      g.fillStyle = isDark ? "#131022" : "#f6e3ea";
      g.fillRect(0, 0, W, H);

      // Parallax background: far layer + closer, faster, dimmer layer.
      if (bgImg.complete && bgImg.naturalWidth > 0) {
        const scroll = xView * colW;
        const farW = (bgImg.naturalWidth * H) / bgImg.naturalHeight;
        let off = -((scroll * 0.12) % farW);
        for (let dx = off - farW; dx < W + farW; dx += farW) {
          g.drawImage(bgImg, dx, 0, farW, H);
        }
        const nearH = H * 1.3;
        const nearW = (bgImg.naturalWidth * nearH) / bgImg.naturalHeight;
        g.globalAlpha = 0.4;
        off = -((scroll * 0.3) % nearW);
        for (let dx = off - nearW; dx < W + nearW; dx += nearW) {
          g.drawImage(bgImg, dx, H - nearH * 0.72, nearW, nearH);
        }
        g.globalAlpha = 1;
      }
      g.fillStyle = pal.bgOverlay;
      g.fillRect(0, 0, W, H);

      // Terrain and spikes.
      const c0 = Math.floor(xView) - 2;
      const c1 = c0 + Math.ceil(W / colW) + 4;
      for (let c = c0; c <= c1; c++) {
        const f = floorAt(c);
        if (f === null) continue;
        const gx = screenX(c);
        const gy = rowToY(f);
        g.fillStyle = pal.terrain;
        g.fillRect(gx, gy, colW + 1, Math.max(0, H - gy));
        g.fillStyle = pal.terrainTop;
        g.fillRect(gx, gy, colW + 1, 3);
        if (c % COLUMNS_PER_BEAT === 0) {
          // Subtle beat marker so the rhythmic grid is visible.
          g.fillStyle = pal.beatMarker;
          g.fillRect(gx, gy + 3, 2, Math.max(0, H - gy - 3));
        }
        if (spikeAt(c)) {
          drawSpike(gx, gy, colW, rowH, pal.spike, pal.spikeEdge);
        }
      }

      // Finish line.
      if (level.totalColumns - xView < W / colW) {
        const fx = screenX(level.totalColumns);
        g.fillStyle = pal.accent;
        g.fillRect(fx, 0, 4, H);
        g.globalAlpha = 0.35;
        g.fillRect(fx + 4, 0, 12, H);
        g.globalAlpha = 1;
      }

      // Player cube (hidden while exploded).
      if (phase !== "dead") {
        const size = rowH * 0.94;
        const cx = playerScreenX + colW / 2;
        const cy = rowToY(py) - rowH / 2;
        g.save();
        g.translate(cx, cy);
        g.rotate(angle);
        if (playerImg.complete && playerImg.naturalWidth > 0) {
          g.drawImage(playerImg, -size / 2, -size / 2, size, size);
        } else {
          g.fillStyle = pal.accent;
          g.fillRect(-size / 2, -size / 2, size, size);
        }
        g.restore();
      }

      // Particles (pixel squares).
      for (const p of particles) {
        g.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.6)));
        g.fillStyle = p.color;
        const ps = Math.max(2, p.size * rowH);
        g.fillRect(screenX(p.x) - ps / 2, rowToY(p.y) - ps / 2, ps, ps);
      }
      g.globalAlpha = 1;

      // Death flash.
      if (phase === "dead") {
        const k = Math.max(0, 1 - (performance.now() - phaseAt) / 400);
        g.fillStyle = `rgba(255, 70, 70, ${0.22 * k})`;
        g.fillRect(0, 0, W, H);
      }

      // ── HUD ────────────────────────────────────────────────────────────────
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
      chip(`Attempt ${attempts}`, 14, 38);
      g.textAlign = "center";
      g.fillStyle = pal.hudText;
      g.fillText(`${Math.round(progress * 100)}%`, barX + barW / 2, 26);
      g.textAlign = "left";

      // Pause button (top-right tap target).
      const pb = { x: W - 48, y: 12, w: 34, h: 34 };
      pauseRect = pb;
      g.fillStyle = pal.hudChip;
      g.fillRect(pb.x, pb.y, pb.w, pb.h);
      g.fillStyle = pal.hudText;
      g.fillRect(pb.x + 10, pb.y + 9, 5, 16);
      g.fillRect(pb.x + 19, pb.y + 9, 5, 16);

      // Start hint on the lead-in of a first attempt.
      if (attempts === 1 && xView < 20 && phase === "playing") {
        g.font = "800 15px Nunito, sans-serif";
        g.textAlign = "center";
        chipCentered(`Tap, click or press Space to jump on the beat`, W / 2, H * 0.3);
        g.textAlign = "left";
      }

      // Win banner while the fanfare plays out.
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

    // ── Main loop ────────────────────────────────────────────────────────────
    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      syncCanvas();

      const now = performance.now();
      const frameDt = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      if (!pausedRef.current) {
        if (phase === "playing") {
          // Advance the fixed-step simulation up to the audio clock. The
          // audio clock is the single source of truth, so the level scroll
          // can never drift from the scheduled music.
          const target = Math.max(0, audio.time() - runStart);
          let guard = 0;
          while (simTime + SIM_DT <= target && guard++ < 4000) {
            step(SIM_DT);
            simTime += SIM_DT;
            if (phase !== "playing") break;
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

        // Gentle vertical camera follow, clamped inside the 2-octave band.
        const targetCam = Math.min(4.5, Math.max(-4.5, py * 0.8));
        camRow += (targetCam - camRow) * Math.min(1, frameDt * 4);
      }

      draw(xOf(simTime));
    };

    lastFrameAt = performance.now();
    beginRun();
    raf = requestAnimationFrame(frame);

    // ── Cleanup ──────────────────────────────────────────────────────────────
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
