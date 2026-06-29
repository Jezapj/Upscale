import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";

interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
}

interface Hole {
  x: number;
  y: number;
  r: number;
  scored: boolean;
}

/** Flappy golf: stationary fairway, flap the ball into cup targets. */
export function TipTopGame({ width, height, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useGamePalette();

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

    const ballR = 12;
    const ballX = width * 0.22;
    const gravity = 0.38;
    const flap = -6.8;

    let ballY = height * 0.5;
    let vy = 0;
    let score = 0;
    let alive = true;
    let holesScored = 0;
    let celebration = 0;

    const fairwayTop = height * 0.12;
    const fairwayBot = height * 0.88;

    const makeHole = (index: number): Hole => ({
      x: width * 0.72,
      y: fairwayTop + 60 + ((index * 53 + 17) % Math.max(80, fairwayBot - fairwayTop - 120)),
      r: 24,
      scored: false,
    });

    let holes: Hole[] = [makeHole(0), makeHole(1)];

    const flapUp = () => {
      if (!alive || celebration > 0) return;
      vy = flap;
    };

    const onPointer = () => flapUp();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flapUp();
      }
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

    let raf = 0;

    const loop = () => {
      if (!alive) return;

      if (celebration > 0) {
        celebration--;
        if (celebration === 0) {
          ballY = height * 0.5;
          vy = 0;
        }
      } else {
        vy += gravity;
        ballY += vy;

        if (ballY - ballR < fairwayTop || ballY + ballR > fairwayBot) {
          alive = false;
          onGameOver(score);
          return;
        }

        for (const hole of holes) {
          if (hole.scored) continue;
          const dx = ballX - hole.x;
          const dy = ballY - hole.y;
          const dist = Math.hypot(dx, dy);
          if (dist < hole.r - 2 && Math.abs(vy) < 6 && Math.abs(dx) < hole.r + ballR) {
            hole.scored = true;
            score += 1;
            holesScored++;
            celebration = 28;
            vy = -2;
            holes.push(makeHole(holesScored + 1));
            if (holes.length > 4) holes = holes.filter((h) => !h.scored || holes.indexOf(h) >= holes.length - 3);
            break;
          }
        }
      }

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(1, p.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // Rough (out of bounds)
      ctx.fillStyle = p.rough;
      ctx.fillRect(0, 0, width, fairwayTop);
      ctx.fillRect(0, fairwayBot, width, height - fairwayBot);

      // Fairway stripe texture
      ctx.fillStyle = p.fairway;
      ctx.fillRect(0, fairwayTop, width, fairwayBot - fairwayTop);
      ctx.fillStyle = p.fairwayStripe;
      for (let sx = 0; sx < width; sx += 48) {
        ctx.fillRect(sx, fairwayTop, 24, fairwayBot - fairwayTop);
      }

      // Sand bunkers (stationary decor)
      const bunkers = [
        { x: width * 0.45, y: fairwayTop + 20, w: 70, h: 35 },
        { x: width * 0.7, y: fairwayBot - 55, w: 90, h: 40 },
      ];
      for (const b of bunkers) {
        ctx.fillStyle = p.bunker;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Holes (cups)
      for (const hole of holes) {
        if (hole.scored) continue;
        ctx.fillStyle = p.cup;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.cupInner;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, hole.r - 6, 0, Math.PI * 2);
        ctx.fill();
        // Flag
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hole.x, hole.y - hole.r);
        ctx.lineTo(hole.x, hole.y - hole.r - 36);
        ctx.stroke();
        ctx.fillStyle = "#ff5a5a";
        ctx.fillRect(hole.x, hole.y - hole.r - 36, 18, 12);
      }

      // Ball shadow
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.ellipse(ballX + 3, ballY + ballR + 2, ballR * 0.9, ballR * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Golf ball
      ctx.fillStyle = celebration > 0 ? "#fff9c4" : p.ball;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = "#ddd";
        ctx.beginPath();
        ctx.arc(ballX + Math.cos(a) * 4, ballY + Math.sin(a) * 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Drift guide toward cup
      const activeHole = holes.find((h) => !h.scored);
      if (activeHole) {
        ctx.strokeStyle = p.guide;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(ballX, ballY);
        ctx.lineTo(activeHole.x, activeHole.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // HUD
      ctx.fillStyle = p.hud;
      ctx.font = "bold 22px Nunito, sans-serif";
      ctx.fillText(`Holes: ${score}`, 16, 36);
      if (celebration > 0) {
        ctx.fillStyle = p.fairway;
        ctx.font = "bold 18px Nunito, sans-serif";
        ctx.fillText("In the hole!", width * 0.35, height * 0.15);
      }

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
