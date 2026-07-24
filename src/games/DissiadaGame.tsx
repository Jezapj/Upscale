import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import { playDissiadaNote, unlockGameAudio } from "./gameAudio";
import { DISSIADA_COMBO_VISUALS } from "./gameSoundConfigs";
import { frameScale } from "./gameLoop";

interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
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

interface Tile {
  lane: number;
  y: number;
  hit: boolean;
  missed: boolean;
}

type HitQuality = "perfect" | "good" | "ok" | "miss";

interface TapFx {
  lane: number;
  t: number;
  maxT: number;
  quality: HitQuality;
  edgeHighlight: boolean;
  fullFlash: boolean;
}

const LANES = 4;
const TILE_H = 52;
const MISS_PADDING = 14;
const LANE_KEYS = ["D", "F", "J", "K"];

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
          if (!t.hit) t.y *= scale;
        }
      }
      lastLayoutHitY = layout.hitY;
      return layout;
    };

    let tiles: Tile[] = [];
    let score = 0;
    let combo = 0;
    let alive = true;
    let spawnTimer = 0;
    let speed = 6.5;
    let laneFlash = [0, 0, 0, 0];
    const tapFx: TapFx[] = [];
    const rng = seedRef.current !== undefined ? mulberry32(seedRef.current) : Math.random;

    const judgeTile = (
      lane: number,
      hitY: number,
      perfectH: number,
      goodH: number,
      okH: number,
    ): HitQuality | null => {
      let best: { tile: Tile; dist: number } | null = null;
      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed) continue;
        const tileCenter = t.y + TILE_H / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (!best || dist < best.dist) best = { tile: t, dist: dist };
      }
      if (!best || best.dist > okH) return null;
      if (best.dist <= perfectH) return "perfect";
      if (best.dist <= goodH) return "good";
      return "ok";
    };

    const tapLane = (lane: number) => {
      if (!alive || pausedRef.current) return;
      const { hitY, perfectH, goodH, okH } = getLayout();
      unlockGameAudio();
      laneFlash[lane] = 14;

      const quality = judgeTile(lane, hitY, perfectH, goodH, okH);
      if (!quality) {
        playDissiadaNote(lane, "miss");
        tapFx.push({
          lane,
          t: 24,
          maxT: 24,
          quality: "miss",
          edgeHighlight: false,
          fullFlash: false,
        });
        combo = 0;
        alive = false;
        onGameOverRef.current(score);
        return;
      }

      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed) continue;
        const tileCenter = t.y + TILE_H / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (dist <= okH) {
          t.hit = true;
          break;
        }
      }

      const noteCombo =
        quality === "perfect" ? combo + 1 : quality === "ok" ? 0 : Math.max(1, combo);
      const edgeHighlight = noteCombo >= DISSIADA_COMBO_VISUALS.edgeHighlight;
      const fullFlash = noteCombo >= DISSIADA_COMBO_VISUALS.fullFlash;
      const fxDuration = fullFlash ? 22 : edgeHighlight ? 26 : 20;

      tapFx.push({
        lane,
        t: fxDuration,
        maxT: fxDuration,
        quality,
        edgeHighlight,
        fullFlash,
      });
      playDissiadaNote(lane, quality, noteCombo);
      if (quality === "perfect") {
        score += 2;
        combo++;
      } else if (quality === "good") {
        score += 1;
        combo = Math.max(1, combo);
      } else {
        score += 1;
        combo = Math.max(1, combo);
      }
      speed = Math.min(12, 6.5 + score * 0.035);
    };

    const onPointer = (e: PointerEvent) => {
      const { laneW } = getLayout();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      tapLane(Math.min(LANES - 1, Math.max(0, Math.floor(x / laneW))));
    };
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
      if (map[e.code] !== undefined) {
        e.preventDefault();
        tapLane(map[e.code]);
      }
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

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
          const lane = Math.floor(rng() * LANES);
          tiles.push({ lane, y: -TILE_H - 10, hit: false, missed: false });
        }

        for (const t of tiles) {
          if (!t.hit && !t.missed) t.y += speed * dt;
        }

        for (const t of tiles) {
          if (!t.hit && !t.missed && t.y > hitY + okH + MISS_PADDING) {
            t.missed = true;
            combo = 0;
            alive = false;
            onGameOverRef.current(score);
            return;
          }
        }
        tiles = tiles.filter((t) => t.y < height + 40 && !t.missed);

        for (let i = 0; i < LANES; i++) {
          if (laneFlash[i] > 0) laneFlash[i] = Math.max(0, laneFlash[i] - dt);
        }
        for (let i = tapFx.length - 1; i >= 0; i--) {
          tapFx[i].t -= dt;
          if (tapFx[i].t <= 0) tapFx.splice(i, 1);
        }
      }

      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < LANES; i++) {
        const x = i * laneW;
        const flash = laneFlash[i] / 14;
        ctx.fillStyle =
          flash > 0
            ? `rgba(127, 127, 150, ${0.12 + flash * 0.2})`
            : i % 2 === 0
              ? p.laneEven
              : "transparent";
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

      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < LANES; i++) {
        ctx.fillStyle = p.label;
        ctx.fillText(LANE_KEYS[i], i * laneW + laneW / 2, hitY + okH + 22);
      }
      ctx.textAlign = "left";

      for (const t of tiles) {
        if (t.hit || t.missed) continue;
        const x = t.lane * laneW + 8;
        const w = laneW - 16;
        const dist = Math.abs(t.y + TILE_H / 2 - hitY);
        const glow = dist < okH ? 1 - dist / okH : 0;

        if (glow > 0) {
          ctx.shadowColor = laneColors[t.lane];
          ctx.shadowBlur = 12 * glow;
        }

        const grad = ctx.createLinearGradient(x, t.y, x, t.y + TILE_H);
        grad.addColorStop(0, laneColors[t.lane]);
        grad.addColorStop(1, laneColors[t.lane] + "aa");
        ctx.fillStyle = grad;
        ctx.fillRect(x, t.y, w, TILE_H - 4);

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x + 4, t.y + 4, w - 8, 6);
      }

      for (const fx of tapFx) {
        const cx = fx.lane * laneW + laneW / 2;
        const tileX = fx.lane * laneW + 8;
        const tileW = laneW - 16;
        const tileDrawH = TILE_H - 4;
        const idealTileY = hitY - TILE_H / 2;
        const progress = 1 - fx.t / fx.maxT;

        if (fx.edgeHighlight || fx.fullFlash) {
          if (fx.fullFlash) {
            const flashAlpha = (1 - progress) ** 1.4 * 0.9;
            ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
            ctx.fillRect(tileX, idealTileY, tileW, tileDrawH);
          }
          if (fx.edgeHighlight) {
            const edgeAlpha = (1 - progress) ** 0.85 * 0.95;
            const spread = progress * 10;
            ctx.strokeStyle = `rgba(255,255,255,${edgeAlpha})`;
            ctx.lineWidth = 2.5 + progress * 5;
            ctx.strokeRect(
              tileX - spread * 0.35,
              idealTileY - spread * 0.35,
              tileW + spread * 0.7,
              tileDrawH + spread * 0.7,
            );
          }
        }

        const alpha = fx.t / fx.maxT;
        const color =
          fx.quality === "perfect"
            ? "#5cd0a8"
            : fx.quality === "good"
              ? "#e85d04"
              : fx.quality === "ok"
                ? "#fef08a"
                : "#ff5a5a";
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(cx, hitY, 28 + (fx.maxT - fx.t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (fx.quality !== "miss") {
          const label =
            fx.quality === "perfect"
              ? "PERFECT"
              : fx.quality === "good"
                ? "GOOD"
                : "OK";
          const labelY = hitY - 36;
          const outline = 2;
          ctx.font = "800 30px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.95})`;
          for (let ox = -outline; ox <= outline; ox++) {
            for (let oy = -outline; oy <= outline; oy++) {
              if (ox === 0 && oy === 0) continue;
              ctx.fillText(label, cx + ox, labelY + oy);
            }
          }
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fillText(label, cx, labelY);
          ctx.globalAlpha = 1;
          ctx.textAlign = "left";
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
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
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
