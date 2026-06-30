import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";

interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
}

interface Pit {
  x: number;
  width: number;
  depth: number;
  scored: boolean;
}

interface Stage {
  worldW: number;
  pit: Pit;
  groundPhase: number;
  groundAmp: number;
}

const STAGE_COUNT = 3;
const GRAVITY = 0.24;
const FLAP_POWER = 5.4;
const FLAP_ANGLE = (75 * Math.PI) / 180;
const GROUND_Y = 0.78;
const STAGE_CLEAR_FRAMES = 50;

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStage(seed: number): Stage {
  const rand = mulberry32(seed);
  const worldW = 1800 + Math.floor(rand() * 1400);
  const pitX = 520 + Math.floor(rand() * (worldW - 720));
  return {
    worldW,
    pit: {
      x: pitX,
      width: 58 + Math.floor(rand() * 22),
      depth: 48 + Math.floor(rand() * 18),
      scored: false,
    },
    groundPhase: rand() * Math.PI * 2,
    groundAmp: 10 + rand() * 14,
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
  if (worldX < pit.x - half || worldX > pit.x + half) return null;
  const edge = pit.x - half;
  const t = (worldX - edge) / pit.width;
  const bowl = Math.sin(t * Math.PI);
  return groundHeight(worldX, viewH, stage) + bowl * pit.depth;
}

function pitBottomY(pit: Pit, viewH: number, stage: Stage): number {
  return groundHeight(pit.x, viewH, stage) + pit.depth;
}

function formatTime(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.floor(s) + "s";
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
    let stageIndex = 0;
    let stageFlaps = 0;
    let stageStartTime = performance.now();
    let clearFrames = 0;

    let px = 120;
    let py = playH * 0.35;
    let vx = 0;
    let vy = 0;
    let alive = true;
    let camX = 0;

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

    const advanceStage = () => {
      if (stageIndex >= STAGE_COUNT - 1) {
        alive = false;
        onGameOver(STAGE_COUNT);
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
      stageFlaps++;
      const angle = dir < 0 ? Math.PI - FLAP_ANGLE : FLAP_ANGLE;
      vx += Math.cos(angle) * FLAP_POWER;
      vy -= Math.sin(angle) * FLAP_POWER;
      const maxSpd = 14;
      const sp = Math.hypot(vx, vy);
      if (sp > maxSpd) {
        vx = (vx / sp) * maxSpd;
        vy = (vy / sp) * maxSpd;
      }
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

      const stage = currentStage();
      const pit = currentPit();
      const ww = worldW();

      if (clearFrames > 0) {
        clearFrames--;
        if (clearFrames === 0) advanceStage();
      } else {
        vy += GRAVITY;
        vx *= 0.996;
        vy *= 0.9992;
        px += vx;
        py += vy;

        if (px < ballR) {
          px = ballR;
          vx = Math.abs(vx) * 0.3;
        }
        if (px > ww - ballR) px = ww - ballR;

        const gY = groundHeight(px, playH, stage);
        let onGround = false;
        let overPit = false;

        const half = pit.width / 2;
        const rimY = groundHeight(pit.x, playH, stage);
        const inPitX = px > pit.x - half + ballR * 0.35 && px < pit.x + half - ballR * 0.35;
        const onPitFloor = px > pit.x - half + ballR * 0.15 && px < pit.x + half - ballR * 0.15;

        if (px > pit.x - half - ballR && px < pit.x + half + ballR) {
          overPit = true;
        }

        const surface = pitSurfaceY(pit, px, playH, stage);
        const bottomY = pitBottomY(pit, playH, stage);
        const nearLip =
          Math.abs(px - (pit.x - half)) < ballR + 2 || Math.abs(px - (pit.x + half)) < ballR + 2;

        if (pit.scored) {
          if (inPitX && surface !== null && py + ballR >= surface - 1) {
            py = surface - ballR;
            vy *= 0.15;
            vx *= 0.7;
            onGround = true;
          }
        } else if (onPitFloor && surface !== null) {
          if (py + ballR >= surface - 2) {
            const settled = py + ballR >= bottomY - 6 && Math.abs(vy) < 12 && Math.abs(vx) < 9;
            if (settled) {
              pit.scored = true;
              vy = 0;
              vx *= 0.15;
              py = surface - ballR;
              onGround = true;
              clearFrames = STAGE_CLEAR_FRAMES;
            } else {
              py = surface - ballR;
              vy *= -0.18;
              vx *= 0.88;
              onGround = true;
            }
          }
        } else if (nearLip && py + ballR >= rimY - ballR * 0.6) {
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
          alive = false;
          onGameOver(stageIndex);
          return;
        }
      }

      camX = Math.max(0, Math.min(ww - width, px - width * 0.38));

      const sky = ctx.createLinearGradient(0, 0, 0, playH);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(1, p.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, playH);

      const drawGroundSegment = (wx: number, segW: number) => {
        const sx = wx - camX;
        if (sx > width + 20 || sx + segW < -20) return;
        ctx.fillStyle = p.rough;
        ctx.fillRect(sx, 0, segW, playH);
        ctx.fillStyle = p.fairway;
        ctx.beginPath();
        ctx.moveTo(sx, playH);
        for (let i = 0; i <= segW; i += 6) {
          const gx = wx + i;
          ctx.lineTo(sx + i, groundHeight(gx, playH, stage));
        }
        ctx.lineTo(sx + segW, playH);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.fairwayStripe;
        for (let i = 0; i < segW; i += 40) {
          const gx = wx + i;
          const gy = groundHeight(gx, playH, stage);
          ctx.fillRect(sx + i, gy, 20, playH - gy);
        }
      };

      const segStart = Math.floor(camX / 200) * 200;
      for (let wx = segStart; wx < camX + width + 200; wx += 200) {
        drawGroundSegment(wx, 200);
      }

      const sx = pit.x - camX;
      if (sx >= -80 && sx <= width + 80) {
        const rimY = groundHeight(pit.x, playH, stage);
        const halfW = pit.width / 2;

        ctx.fillStyle = p.cupInner;
        ctx.beginPath();
        ctx.moveTo(sx - halfW, rimY);
        for (let i = 0; i <= pit.width; i += 4) {
          const gx = pit.x - halfW + i;
          const sy = pitSurfaceY(pit, gx, playH, stage) ?? rimY;
          ctx.lineTo(sx - halfW + i, sy);
        }
        ctx.lineTo(sx + halfW, rimY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = p.cup;
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

      const stageElapsed = performance.now() - stageStartTime;
      ctx.fillStyle = p.hud;
      ctx.font = "bold 18px Nunito, sans-serif";
      ctx.fillText(`Stage ${stageIndex + 1}/${STAGE_COUNT}`, 14, 26);
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
