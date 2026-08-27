import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import {
  playDissiadaNote,
  startDissiadaHold,
  stopAllDissiadaHolds,
  stopDissiadaHold,
  unlockGameAudio,
} from "./gameAudio";
import { DISSIADA_COMBO_VISUALS } from "./gameSoundConfigs";
import { frameScale } from "./gameLoop";

interface Props {
  width: number;
  height: number;
  onGameOver: (result: GameResult) => void;
  paused?: boolean;
  /** When set, tile spawns use this seed (daily challenge). */
  seed?: number;
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

type TileKind = "tap" | "hold";

interface Tile {
  lane: number;
  y: number;
  hit: boolean;
  missed: boolean;
  kind: TileKind;
  holdLen: number;
  holding: boolean;
  holdTicks: number;
  holdDone: boolean;
  holdAcc: number;
  pairId: number | null;
}

type HitQuality = "perfect" | "good" | "ok" | "miss" | "released";
type JudgedQuality = "perfect" | "good" | "ok";

interface TapFx {
  lane: number;
  t: number;
  maxT: number;
  quality: HitQuality;
  edgeHighlight: boolean;
  fullFlash: boolean;
  ty: number;
  tvy: number;
  label?: string;
}

const LANES = 4;
const TILE_H = 52;
const MISS_PADDING = 14;
const LANE_KEYS = ["D", "F", "J", "K"];
const TEXT_GRAVITY = 0.55;
const HOLD_TICK_FRAMES = 12;

/** Score at which a tile type starts appearing, and how fast it ramps up. */
interface SpawnRamp {
  start: number;
  full: number;
  maxChance: number;
}
const DOUBLE_RAMP: SpawnRamp = { start: 8, full: 60, maxChance: 0.26 };
const HOLD_RAMP: SpawnRamp = { start: 20, full: 90, maxChance: 0.28 };

function ramp(score: number, r: SpawnRamp): number {
  if (score < r.start) return 0;
  const t = Math.min(1, (score - r.start) / (r.full - r.start));
  // Ease in so the first few appearances stay rare.
  return r.maxChance * t * t;
}

function makeTile(
  lane: number,
  y: number,
  kind: TileKind = "tap",
  holdLen = 0,
  pairId: number | null = null,
): Tile {
  return {
    lane,
    y,
    hit: false,
    missed: false,
    kind,
    holdLen,
    holding: false,
    holdTicks: 0,
    holdDone: false,
    holdAcc: 0,
    pairId,
  };
}

/** Piano tiles with hit zone guide, lane highlights, and tight timing. */
export function DissiadaGame({ width, height, onGameOver, paused = false, seed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();
  const sizeRef = useRef({ width, height });
  const onGameOverRef = useRef(onGameOver);
  const paletteRef = useRef(palette);
  const pausedRef = useRef(paused);
  const seedRef = useRef(seed);
  seedRef.current = seed;

  sizeRef.current = { width, height };
  onGameOverRef.current = onGameOver;
  paletteRef.current = palette;
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let canvasW = 0;
    let canvasH = 0;
    let lastLayoutHitY = 0;

    // D/F/J/K hints only make sense with a physical keyboard (desktop).
    const showKeyLabels =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

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
      const timingScale = Math.min(1.2, Math.max(1, 520 / h));
      return {
        width: w,
        height: h,
        laneW: w / LANES,
        hitY: h - Math.max(72, h * 0.14),
        perfectH: 32 * timingScale,
        goodH: 58 * timingScale,
        okH: 82 * timingScale,
        isPortrait: h > w,
      };
    };

    const syncLayout = () => {
      const layout = getLayout();
      resizeCanvas(layout.width, layout.height);
      if (lastLayoutHitY > 0 && layout.hitY !== lastLayoutHitY) {
        const scale = layout.hitY / lastLayoutHitY;
        for (const t of tiles) {
          if (!t.hit && !t.holdDone) t.y *= scale;
          if (t.kind === "hold") t.holdLen *= scale;
        }
      }
      lastLayoutHitY = layout.hitY;
      return layout;
    };

    let tiles: Tile[] = [];
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let notesHit = 0;
    let alive = true;
    let spawnTimer = 0;
    let speed = 6.5;
    let laneFlash = [0, 0, 0, 0];
    let heldLanes = [false, false, false, false];
    let nextPairId = 1;
    const tapFx: TapFx[] = [];
    const pointerLane = new Map<number, number>();
    const rng = seedRef.current !== undefined ? mulberry32(seedRef.current) : Math.random;

    const pushFx = (
      lane: number,
      quality: HitQuality,
      edgeHighlight: boolean,
      fullFlash: boolean,
      label?: string,
    ) => {
      const fxDuration = quality === "miss" ? 24 : fullFlash ? 32 : edgeHighlight ? 30 : 30;
      tapFx.push({
        lane,
        t: fxDuration,
        maxT: fxDuration,
        quality,
        edgeHighlight,
        fullFlash,
        ty: 0,
        tvy: -4.2,
        label,
      });
    };

    const laneHasActiveHold = (lane: number) =>
      tiles.some(
        (t) =>
          t.lane === lane &&
          t.kind === "hold" &&
          !t.missed &&
          !t.holdDone &&
          (!t.hit || t.holding),
      );

    const judgeTile = (
      lane: number,
      hitY: number,
      perfectH: number,
      goodH: number,
      okH: number,
    ): JudgedQuality | null => {
      let best: { tile: Tile; dist: number } | null = null;
      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed || t.holding || t.holdDone) continue;
        const tileCenter = t.y + TILE_H / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (!best || dist < best.dist) best = { tile: t, dist };
      }
      if (!best || best.dist > okH) return null;
      if (best.dist <= perfectH) return "perfect";
      if (best.dist <= goodH) return "good";
      return "ok";
    };

    const awardHit = (quality: JudgedQuality) => {
      if (quality === "perfect") {
        score += 2;
        combo++;
      } else if (quality === "good" || quality === "ok") {
        score += 1;
        combo = Math.max(1, combo);
      }
      maxCombo = Math.max(maxCombo, combo);
      notesHit += 1;
      speed = Math.min(12, 6.5 + score * 0.035);
    };

    const endRun = () => {
      alive = false;
      stopAllDissiadaHolds();
      onGameOverRef.current({
        score,
        title: "Run over",
        stats: [
          { label: "Max combo", value: `${maxCombo}x` },
          { label: "Notes", value: `${notesHit}` },
        ],
      });
    };

    const tapLane = (lane: number) => {
      if (!alive || pausedRef.current) return;
      if (heldLanes[lane]) return;
      const { hitY, perfectH, goodH, okH } = getLayout();
      unlockGameAudio();
      laneFlash[lane] = 14;
      heldLanes[lane] = true;

      const quality = judgeTile(lane, hitY, perfectH, goodH, okH);
      if (!quality) {
        playDissiadaNote(lane, "miss");
        pushFx(lane, "miss", false, false);
        combo = 0;
        endRun();
        return;
      }

      let target: Tile | null = null;
      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed || t.holding || t.holdDone) continue;
        const tileCenter = t.y + TILE_H / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (dist <= okH) {
          target = t;
          break;
        }
      }
      if (!target) return;

      const noteCombo =
        quality === "perfect" ? combo + 1 : quality === "ok" ? 0 : Math.max(1, combo);
      const edgeHighlight = noteCombo >= DISSIADA_COMBO_VISUALS.edgeHighlight;
      const fullFlash = noteCombo >= DISSIADA_COMBO_VISUALS.fullFlash;

      if (target.kind === "hold") {
        target.holding = true;
        // Tail length ÷ scroll speed is how long the note will ring for.
        const holdMs = (target.holdLen / Math.max(0.5, speed)) * (1000 / 60);
        startDissiadaHold(lane, holdMs);
        pushFx(lane, quality, edgeHighlight, fullFlash);
        playDissiadaNote(lane, quality, noteCombo);
        awardHit(quality);
        return;
      }

      target.hit = true;
      pushFx(lane, quality, edgeHighlight, fullFlash);
      playDissiadaNote(lane, quality, noteCombo);
      awardHit(quality);
    };

    const releaseLane = (lane: number) => {
      if (!heldLanes[lane]) return;
      heldLanes[lane] = false;
      for (const t of tiles) {
        if (t.lane !== lane || !t.holding || t.holdDone) continue;
        t.holding = false;
        t.hit = true;
        t.holdDone = true;
        stopDissiadaHold(lane);
        pushFx(lane, "released", false, false, "RELEASED");
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const { laneW } = getLayout();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lane = Math.min(LANES - 1, Math.max(0, Math.floor(x / laneW)));
      pointerLane.set(e.pointerId, lane);
      tapLane(lane);
    };
    const onPointerUp = (e: PointerEvent) => {
      const lane = pointerLane.get(e.pointerId);
      pointerLane.delete(e.pointerId);
      if (lane !== undefined) releaseLane(lane);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const map: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
      if (map[e.code] !== undefined) {
        e.preventDefault();
        if (!e.repeat) tapLane(map[e.code]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const map: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
      if (map[e.code] !== undefined) {
        e.preventDefault();
        releaseLane(map[e.code]);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let lastFrame = performance.now();

    const loop = (now: number) => {
      if (!alive) return;

      const dt = frameScale(now - lastFrame);
      lastFrame = now;
      const { width, height, laneW, hitY, perfectH, goodH, okH, isPortrait } = syncLayout();
      const p = paletteRef.current.dissiada;
      const laneColors = p.laneColors;
      const pal = paletteRef.current;

      if (!pausedRef.current) {
        spawnTimer += dt;
        const spawnRate = Math.max(14, 32 - Math.floor(score / 8));
        if (spawnTimer >= spawnRate) {
          spawnTimer -= spawnRate;
          const y = -TILE_H - 10;
          // Doubles ease in first, then holds; both keep getting more common.
          const doubleChance = ramp(score, DOUBLE_RAMP);
          const holdChance = ramp(score, HOLD_RAMP);
          const roll = rng();
          if (roll < doubleChance) {
            const a = Math.floor(rng() * LANES);
            let b = Math.floor(rng() * LANES);
            if (b === a) b = (a + 1 + Math.floor(rng() * (LANES - 1))) % LANES;
            const pid = nextPairId++;
            tiles.push(makeTile(a, y, "tap", 0, pid));
            tiles.push(makeTile(b, y, "tap", 0, pid));
          } else if (roll < doubleChance + holdChance) {
            let lane = Math.floor(rng() * LANES);
            let guard = 0;
            while (laneHasActiveHold(lane) && guard++ < 8) {
              lane = Math.floor(rng() * LANES);
            }
            if (!laneHasActiveHold(lane)) {
              // Tails lengthen as the run goes on.
              const grow = Math.min(1, Math.max(0, (score - HOLD_RAMP.start) / 60));
              const len = TILE_H * (1.2 + grow * 0.9 + rng() * (1 + grow));
              tiles.push(makeTile(lane, y, "hold", len));
            } else {
              tiles.push(makeTile(Math.floor(rng() * LANES), y));
            }
          } else {
            tiles.push(makeTile(Math.floor(rng() * LANES), y));
          }
        }

        for (const t of tiles) {
          if (!t.hit && !t.missed && !t.holding) t.y += speed * dt;
          if (t.holding && !t.holdDone) {
            t.y += speed * dt;
            t.holdAcc += dt;
            while (t.holdAcc >= HOLD_TICK_FRAMES) {
              t.holdAcc -= HOLD_TICK_FRAMES;
              t.holdTicks += 1;
              score += 1;
              laneFlash[t.lane] = 10;
            }
            // Tail trails above the head; the hold ends once its top reaches the line.
            const tailTop = t.y - t.holdLen;
            if (tailTop >= hitY) {
              t.holding = false;
              t.hit = true;
              t.holdDone = true;
              stopDissiadaHold(t.lane);
              heldLanes[t.lane] = false;
              score += 2;
              combo += 1;
              maxCombo = Math.max(maxCombo, combo);
              pushFx(t.lane, "perfect", true, false, "HOLD!");
            }
          }
        }

        for (const t of tiles) {
          if (t.hit || t.missed || t.holding || t.holdDone) continue;
          if (t.y > hitY + okH + MISS_PADDING) {
            t.missed = true;
            combo = 0;
            endRun();
            return;
          }
        }
        tiles = tiles.filter(
          (t) =>
            (t.y < height + 40 || t.holding) &&
            !t.missed &&
            !(t.hit && t.holdDone && t.y > height + 20),
        );

        for (let i = 0; i < LANES; i++) {
          if (laneFlash[i] > 0) laneFlash[i] = Math.max(0, laneFlash[i] - dt);
        }
        for (let i = tapFx.length - 1; i >= 0; i--) {
          const fx = tapFx[i];
          fx.t -= dt;
          fx.tvy += TEXT_GRAVITY * dt;
          fx.ty += fx.tvy * dt;
          if (fx.t <= 0) tapFx.splice(i, 1);
        }
      }

      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < LANES; i++) {
        const x = i * laneW;
        const flash = laneFlash[i] / 14;
        ctx.fillStyle =
          flash > 0
            ? `rgba(255,255,255,${0.06 * flash})`
            : i % 2 === 0
              ? "rgba(255,255,255,0.03)"
              : "rgba(0,0,0,0.04)";
        ctx.fillRect(x, 0, laneW, height);

        if (flash > 0) {
          ctx.fillStyle = laneColors[i] + "44";
          ctx.fillRect(x + 4, hitY - okH - 20, laneW - 8, okH * 2 + 40);
        }
      }

      ctx.strokeStyle = p.divider;
      ctx.lineWidth = 1;
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneW, 0);
        ctx.lineTo(i * laneW, height);
        ctx.stroke();
      }

      const guideTop = hitY - okH;
      const guideBot = hitY + okH;
      ctx.fillStyle = p.guideZone;
      ctx.fillRect(0, guideTop, width, guideBot - guideTop);

      const goodTop = hitY - goodH;
      const goodBot = hitY + goodH;
      ctx.fillStyle = p.perfectZone + "55";
      ctx.fillRect(0, goodTop, width, goodBot - goodTop);

      ctx.fillStyle = p.perfectZone;
      ctx.fillRect(0, hitY - perfectH, width, perfectH * 2);
      ctx.strokeStyle = p.hitLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, hitY);
      ctx.lineTo(width, hitY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (showKeyLabels) {
        ctx.font = "bold 11px Nunito, sans-serif";
        ctx.textAlign = "center";
        for (let i = 0; i < LANES; i++) {
          ctx.fillStyle = p.label;
          ctx.fillText(LANE_KEYS[i], i * laneW + laneW / 2, hitY + okH + 22);
        }
      }

      // Double-note connectors
      const pairCenters = new Map<number, { x: number; y: number }[]>();
      for (const t of tiles) {
        if (t.pairId === null || t.hit || t.missed) continue;
        const list = pairCenters.get(t.pairId) ?? [];
        list.push({
          x: t.lane * laneW + laneW / 2,
          y: t.y + TILE_H / 2,
        });
        pairCenters.set(t.pairId, list);
      }
      for (const pts of pairCenters.values()) {
        if (pts.length < 2) continue;
        ctx.strokeStyle = "rgba(192,132,252,0.65)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        ctx.lineTo(pts[1]!.x, pts[1]!.y);
        ctx.stroke();
      }

      for (const t of tiles) {
        if (t.missed || (t.hit && !t.holding && t.kind === "tap")) continue;
        if (t.holdDone && !t.holding) continue;
        const x = t.lane * laneW + 8;
        const w = laneW - 16;
        const color = laneColors[t.lane] ?? "#c084fc";
        // A held head stays pinned on the line while its tail drains into it.
        const headY = t.holding ? Math.min(t.y, hitY - TILE_H / 2) : t.y;

        if (t.kind === "hold") {
          const tailTop = t.y - t.holdLen;
          const tailBottom = headY + 4;
          const tailLen = tailBottom - tailTop;
          if (tailLen > 2) {
            const pulse = t.holding ? 0.55 + 0.25 * Math.sin(now / 90) : 0.4;
            ctx.fillStyle = color;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            const r = Math.min(10, w / 2);
            ctx.moveTo(x + r, tailTop);
            ctx.lineTo(x + w - r, tailTop);
            ctx.quadraticCurveTo(x + w, tailTop, x + w, tailTop + r);
            ctx.lineTo(x + w, tailTop + tailLen - r);
            ctx.quadraticCurveTo(x + w, tailTop + tailLen, x + w - r, tailTop + tailLen);
            ctx.lineTo(x + r, tailTop + tailLen);
            ctx.quadraticCurveTo(x, tailTop + tailLen, x, tailTop + tailLen - r);
            ctx.lineTo(x, tailTop + r);
            ctx.quadraticCurveTo(x, tailTop, x + r, tailTop);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        if (!t.hit || t.holding) {
          const dist = Math.abs(headY + TILE_H / 2 - hitY);
          const glow = dist < okH ? 1 - dist / okH : 0;
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(x + 2, headY + 3, w, TILE_H - 4);
          const grad = ctx.createLinearGradient(x, headY, x, headY + TILE_H);
          grad.addColorStop(0, color);
          grad.addColorStop(1, color + "cc");
          ctx.fillStyle = grad;
          ctx.globalAlpha = 0.85 + glow * 0.15;
          ctx.fillRect(x, headY, w, TILE_H - 4);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(x + 4, headY + 4, w - 8, 6);
          ctx.globalAlpha = 1;
        }
      }

      for (const fx of tapFx) {
        const cx = fx.lane * laneW + laneW / 2;
        const idealTileY = hitY - TILE_H / 2;
        const progress = 1 - fx.t / fx.maxT;
        const alpha = fx.t / fx.maxT;

        if (fx.fullFlash) {
          ctx.fillStyle = `rgba(255,255,255,${Math.pow(1 - progress, 1.4) * 0.55})`;
          ctx.fillRect(fx.lane * laneW + 4, idealTileY, laneW - 8, TILE_H);
        }
        if (fx.edgeHighlight) {
          const expand = progress * 10;
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(
            fx.lane * laneW + 6 - expand,
            idealTileY - expand,
            laneW - 12 + expand * 2,
            TILE_H + expand * 2,
          );
        }

        ctx.beginPath();
        ctx.arc(cx, hitY, 28 + (fx.maxT - fx.t), 0, Math.PI * 2);
        ctx.strokeStyle =
          fx.quality === "miss"
            ? `rgba(255,80,80,${alpha})`
            : `rgba(255,255,255,${alpha * 0.7})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (fx.quality !== "miss") {
          const label =
            fx.label ??
            (fx.quality === "perfect"
              ? "PERFECT"
              : fx.quality === "good"
                ? "GOOD"
                : fx.quality === "released"
                  ? "RELEASED"
                  : "OK");
          const labelY = hitY - 36 + fx.ty;
          const color =
            fx.quality === "perfect"
              ? "#c084fc"
              : fx.quality === "good"
                ? "#74c0ff"
                : fx.quality === "released"
                  ? "#ffb43d"
                  : "#a3e635";
          ctx.font = "800 20px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.strokeText(label, cx, labelY);
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fillText(label, cx, labelY);
          ctx.globalAlpha = 1;
        }
      }

      const hudX = isPortrait ? width / 2 : 16;
      const scoreY = isPortrait ? 30 : 36;
      const comboY = isPortrait ? 54 : 58;
      ctx.textAlign = isPortrait ? "center" : "left";
      ctx.fillStyle = pal.isDark ? "#fff" : pal.tiptop.hud;
      ctx.font = "bold 22px Nunito, sans-serif";
      ctx.fillText(String(score), hudX, scoreY);
      if (combo >= 1) {
        ctx.fillStyle = "#c084fc";
        ctx.font = "bold 14px Nunito, sans-serif";
        ctx.fillText(`${combo}x combo`, hudX, comboY);
      }
      ctx.textAlign = "left";

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopAllDissiadaHolds();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none"
      style={{ width, height }}
    />
  );
}
