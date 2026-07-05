import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";
import { playDissiadaNote, unlockGameAudio } from "./gameAudio";
import { DISSIADA_COMBO_VISUALS } from "./gameSoundConfigs";
interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
}

interface Tile {
  lane: number;
  y: number;
  hit: boolean;
  missed: boolean;
}

interface TapFx {
  lane: number;
  t: number;
  maxT: number;
  quality: "perfect" | "good" | "miss";
  edgeHighlight: boolean;
  fullFlash: boolean;
}

/** Piano tiles with hit zone guide, lane highlights, and tight timing. */
export function DissiadaGame({ width, height, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();

  useEffect(() => {
    const p = palette.dissiada;
    const laneColors = p.laneColors;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const lanes = 4;
    const laneW = width / lanes;
    const hitY = height - Math.max(72, height * 0.14);
    const timingScale = Math.min(1.2, Math.max(1, 520 / height));
    const perfectH = 22 * timingScale;
    const goodH = 50 * timingScale;
    const missPadding = 14;
    const tileH = 52;
    const isPortrait = height > width;

    let tiles: Tile[] = [];
    let score = 0;
    let combo = 0;
    let alive = true;
    let spawnTimer = 0;
    let speed = 6.5;
    let laneFlash = [0, 0, 0, 0];
    const tapFx: TapFx[] = [];

    const laneKeys = ["D", "F", "J", "K"];

    const judgeTile = (lane: number): TapFx["quality"] | null => {
      let best: { tile: Tile; dist: number } | null = null;
      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed) continue;
        const tileCenter = t.y + tileH / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (!best || dist < best.dist) best = { tile: t, dist: dist };
      }
      if (!best || best.dist > goodH) return null;
      if (best.dist <= perfectH) return "perfect";
      return "good";
    };

    const tapLane = (lane: number) => {
      if (!alive) return;
      unlockGameAudio();
      laneFlash[lane] = 14;

      const quality = judgeTile(lane);
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
        onGameOver(score);
        return;
      }

      for (const t of tiles) {
        if (t.lane !== lane || t.hit || t.missed) continue;
        const tileCenter = t.y + tileH / 2;
        const dist = Math.abs(tileCenter - hitY);
        if (dist <= goodH) {
          t.hit = true;
          break;
        }
      }

      const noteCombo =
        quality === "perfect" ? combo + 1 : Math.max(1, combo);
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
      } else {
        score += 1;
        combo = Math.max(1, combo);
      }
      speed = Math.min(12, 6.5 + score * 0.035);
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      tapLane(Math.min(lanes - 1, Math.max(0, Math.floor(x / laneW))));
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

    const loop = () => {
      if (!alive) return;

      spawnTimer++;
      const spawnRate = Math.max(14, 32 - Math.floor(score / 8));
      if (spawnTimer >= spawnRate) {
        spawnTimer = 0;
        const lane = Math.floor(Math.random() * lanes);
        tiles.push({ lane, y: -tileH - 10, hit: false, missed: false });
      }

      for (const t of tiles) {
        if (!t.hit && !t.missed) t.y += speed;
      }

      for (const t of tiles) {
        if (!t.hit && !t.missed && t.y > hitY + goodH + missPadding) {
          t.missed = true;
          combo = 0;
          alive = false;
          onGameOver(score);
          return;
        }
      }
      tiles = tiles.filter((t) => t.y < height + 40 && !t.missed);

      for (let i = 0; i < lanes; i++) {
        if (laneFlash[i] > 0) laneFlash[i]--;
      }
      for (let i = tapFx.length - 1; i >= 0; i--) {
        tapFx[i].t--;
        if (tapFx[i].t <= 0) tapFx.splice(i, 1);
      }

      // Background
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, width, height);

      // Lanes
      for (let i = 0; i < lanes; i++) {
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
          ctx.fillRect(x + 4, hitY - goodH - 20, laneW - 8, goodH * 2 + 40);
        }
      }

      // Lane dividers
      ctx.strokeStyle = p.divider;
      ctx.lineWidth = 1;
      for (let i = 1; i < lanes; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneW, 0);
        ctx.lineTo(i * laneW, height);
        ctx.stroke();
      }

      // Hit zone guide
      const guideTop = hitY - goodH;
      const guideBot = hitY + goodH;
      ctx.fillStyle = p.guideZone;
      ctx.fillRect(0, guideTop, width, guideBot - guideTop);

      // Perfect zone (bright center line)
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

      // Lane key labels at hit line
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < lanes; i++) {
        ctx.fillStyle = p.label;
        ctx.fillText(laneKeys[i], i * laneW + laneW / 2, hitY + goodH + 22);
      }
      ctx.textAlign = "left";

      // Tiles
      for (const t of tiles) {
        if (t.hit || t.missed) continue;
        const x = t.lane * laneW + 8;
        const w = laneW - 16;
        const dist = Math.abs(t.y + tileH / 2 - hitY);
        const glow = dist < goodH ? 1 - dist / goodH : 0;

        if (glow > 0) {
          ctx.shadowColor = laneColors[t.lane];
          ctx.shadowBlur = 12 * glow;
        }

        const grad = ctx.createLinearGradient(x, t.y, x, t.y + tileH);
        grad.addColorStop(0, laneColors[t.lane]);
        grad.addColorStop(1, laneColors[t.lane] + "aa");
        ctx.fillStyle = grad;
        ctx.fillRect(x, t.y, w, tileH - 4);

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x + 4, t.y + 4, w - 8, 6);
      }

      // Tap feedback
      for (const fx of tapFx) {
        const cx = fx.lane * laneW + laneW / 2;
        const tileX = fx.lane * laneW + 8;
        const tileW = laneW - 16;
        const tileDrawH = tileH - 4;
        const idealTileY = hitY - tileH / 2;
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
          fx.quality === "perfect" ? "#5cd0a8" : fx.quality === "good" ? "#ffb43d" : "#ff5a5a";
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(cx, hitY, 28 + (fx.maxT - fx.t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (fx.quality !== "miss") {
          ctx.fillStyle = color;
          ctx.font = "bold 13px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(fx.quality === "perfect" ? "PERFECT" : "GOOD", cx, hitY - 36);
          ctx.textAlign = "left";
        }
      }

      // HUD — center combo on portrait so it stays visible
      const hudX = isPortrait ? width / 2 : 16;
      const scoreY = isPortrait ? 30 : 36;
      const comboY = isPortrait ? 54 : 58;
      ctx.textAlign = isPortrait ? "center" : "left";
      ctx.fillStyle = palette.isDark ? "#fff" : palette.tiptop.hud;
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
  }, [width, height, onGameOver, palette]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none"
      style={{ width, height }}
    />
  );
}
