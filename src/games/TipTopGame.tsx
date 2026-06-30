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

const WORLD_W = 7200;
const GRAVITY = 0.18;
const FLAP_POWER = 5.4;
/** Loft angle from horizontal (degrees). */
const FLAP_ANGLE = (75 * Math.PI) / 180;
const GROUND_Y = 0.78;

function groundHeight(worldY: number, viewH: number): number {
  return viewH * GROUND_Y + Math.sin(worldY * 0.004) * 18 + Math.sin(worldY * 0.011) * 8;
}

function buildPits(): Pit[] {
  const pits: Pit[] = [];
  let x = 520;
  while (x < WORLD_W - 200) {
    pits.push({
      x,
      width: 64 + (pits.length % 3) * 14,
      depth: 52 + (pits.length % 4) * 12,
      scored: false,
    });
    x += 380 + (pits.length % 5) * 90;
  }
  return pits;
}

function pitSurfaceY(pit: Pit, worldX: number, viewH: number): number | null {
  const half = pit.width / 2;
  if (worldX < pit.x - half || worldX > pit.x + half) return null;
  const edge = pit.x - half;
  const t = (worldX - edge) / pit.width;
  const bowl = Math.sin(t * Math.PI);
  return groundHeight(worldX, viewH) + bowl * pit.depth;
}

function pitBottomY(pit: Pit, viewH: number): number {
  return groundHeight(pit.x, viewH) + pit.depth;
}

/** Flappy Golf 2 style: flap left/right, camera follows ball into ground pits. */
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

    let px = 120;
    let py = playH * 0.35;
    let vx = 0;
    let vy = 0;
    let score = 0;
    let alive = true;
    let camX = 0;
    const pits = buildPits();

    const flap = (dir: -1 | 1) => {
      if (!alive) return;
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

      vy += GRAVITY;
      vx *= 0.996;
      vy *= 0.9992;
      px += vx;
      py += vy;

      if (px < ballR) {
        px = ballR;
        vx = Math.abs(vx) * 0.3;
      }
      if (px > WORLD_W - ballR) px = WORLD_W - ballR;

      const gY = groundHeight(px, playH);
      let onGround = false;
      let overPit = false;

      for (const pit of pits) {
        const half = pit.width / 2;
        const rimY = groundHeight(pit.x, playH);
        const inPitX = px > pit.x - half + ballR * 0.35 && px < pit.x + half - ballR * 0.35;
        const onPitFloor = px > pit.x - half + ballR * 0.15 && px < pit.x + half - ballR * 0.15;

        if (px > pit.x - half - ballR && px < pit.x + half + ballR) {
          overPit = true;
        }

        if (pit.scored) {
          if (inPitX) {
            const surface = pitSurfaceY(pit, px, playH);
            if (surface !== null && py + ballR >= surface - 1) {
              py = surface - ballR;
              vy *= 0.15;
              vx *= 0.7;
              onGround = true;
            }
          }
          continue;
        }

        const surface = pitSurfaceY(pit, px, playH);
        const bottomY = pitBottomY(pit, playH);
        const nearLip = Math.abs(px - (pit.x - half)) < ballR + 2 || Math.abs(px - (pit.x + half)) < ballR + 2;

        if (onPitFloor && surface !== null) {
          if (py + ballR >= surface - 2) {
            const settled =
              py + ballR >= bottomY - 6 && Math.abs(vy) < 12 && Math.abs(vx) < 9;
            if (settled) {
              pit.scored = true;
              score++;
              vy = 0;
              vx *= 0.15;
              py = surface - ballR;
              onGround = true;
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
        onGameOver(score);
        return;
      }

      camX = Math.max(0, Math.min(WORLD_W - width, px - width * 0.38));

      const sky = ctx.createLinearGradient(0, 0, 0, playH);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(1, p.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, playH);

      const drawGroundSegment = (wx: number, ww: number) => {
        const sx = wx - camX;
        if (sx > width + 20 || sx + ww < -20) return;
        ctx.fillStyle = p.rough;
        ctx.fillRect(sx, 0, ww, playH);
        ctx.fillStyle = p.fairway;
        ctx.beginPath();
        ctx.moveTo(sx, playH);
        for (let i = 0; i <= ww; i += 6) {
          const gx = wx + i;
          ctx.lineTo(sx + i, groundHeight(gx, playH));
        }
        ctx.lineTo(sx + ww, playH);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.fairwayStripe;
        for (let i = 0; i < ww; i += 40) {
          const gx = wx + i;
          const gy = groundHeight(gx, playH);
          ctx.fillRect(sx + i, gy, 20, playH - gy);
        }
      };

      const segStart = Math.floor(camX / 200) * 200;
      for (let wx = segStart; wx < camX + width + 200; wx += 200) {
        drawGroundSegment(wx, 200);
      }

      for (const pit of pits) {
        const sx = pit.x - camX;
        if (sx < -80 || sx > width + 80) continue;
        const rimY = groundHeight(pit.x, playH);
        const half = pit.width / 2;

        ctx.fillStyle = p.cupInner;
        ctx.beginPath();
        ctx.moveTo(sx - half, rimY);
        for (let i = 0; i <= pit.width; i += 4) {
          const gx = pit.x - half + i;
          const sy = pitSurfaceY(pit, gx, playH) ?? rimY;
          ctx.lineTo(sx - half + i, sy);
        }
        ctx.lineTo(sx + half, rimY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = p.cup;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx - half, rimY, 4, 0, Math.PI * 2);
        ctx.arc(sx + half, rimY, 4, 0, Math.PI * 2);
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
      ctx.ellipse(bsx + 2, groundHeight(px, playH) + 3, ballR, ballR * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.ball;
      ctx.beginPath();
      ctx.arc(bsx, bsy, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = p.hud;
      ctx.font = "bold 20px Nunito, sans-serif";
      ctx.fillText(`Holes: ${score}`, 14, 28);

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
