import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";

interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
}

const GEARS = 5;
const REDLINE = 8200;
const SHIFT_MIN = 5200;
const SHIFT_MAX = 7800;
const RACE_DISTANCE = 402;

/** Pixel drag racer: hold gas, tap shift button, scrolling road, fixed car. */
export function OctaneGame({ width, height, onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gasRef = useRef(false);
  const palette = useGamePalette();

  useEffect(() => {
    const p = palette.octane;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const carX = width * 0.28;
    const carY = height * 0.58;
    const carW = 72;
    const carH = 32;

    const shiftBtn = {
      x: width - 108,
      y: height - 72,
      w: 92,
      h: 52,
    };

    let rpm = 2500;
    let gear = 1;
    let speed = 0;
    let distance = 0;
    let scroll = 0;
    let alive = true;
    let finished = false;
    let shiftFlash = 0;
    let shiftQuality = 0;
    let time = 0;
    let shiftBtnDown = false;

    const inShiftBtn = (x: number, y: number) =>
      x >= shiftBtn.x && x <= shiftBtn.x + shiftBtn.w &&
      y >= shiftBtn.y && y <= shiftBtn.y + shiftBtn.h;

    const shift = () => {
      if (!alive || finished || gear >= GEARS) return;
      if (rpm < SHIFT_MIN) {
        shiftQuality = -1;
        shiftFlash = 20;
        rpm = Math.max(2000, rpm - 800);
        return;
      }
      const perfect = rpm >= SHIFT_MIN && rpm <= SHIFT_MAX;
      shiftQuality = perfect ? 1 : 0;
      shiftFlash = perfect ? 35 : 18;
      gear++;
      rpm = perfect ? 4200 : 4800;
      speed += perfect ? 4.5 : 2.2;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (inShiftBtn(x, y)) {
        shiftBtnDown = true;
        shift();
      } else {
        gasRef.current = true;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (shiftBtnDown && inShiftBtn(x, y)) {
        shiftBtnDown = false;
      } else {
        gasRef.current = false;
      }
    };
    const onGasUp = () => {
      gasRef.current = false;
      shiftBtnDown = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        gasRef.current = true;
      }
      if (e.code === "ShiftLeft" || e.code === "KeyE") {
        e.preventDefault();
        shift();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") gasRef.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onGasUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      time += dt;

      if (!finished) {
        if (gasRef.current) {
          const gearMult = 1 + (gear - 1) * 0.22;
          rpm += (140 + gear * 18) * dt;
          speed += 0.08 * gearMult * dt;
        } else {
          rpm -= 90 * dt;
          speed = Math.max(0, speed - 0.04 * dt);
        }

        if (rpm > REDLINE) {
          rpm = REDLINE;
          speed = Math.max(0, speed - 0.15 * dt);
        }
        rpm = Math.max(1800, Math.min(REDLINE + 200, rpm));

        distance += speed * dt * 0.35;
        scroll += speed * dt * 2.8;

        if (distance >= RACE_DISTANCE) {
          finished = true;
          const score = Math.round((RACE_DISTANCE / Math.max(time, 1)) * 100);
          setTimeout(() => onGameOver(score), 600);
        }
      }

      if (shiftFlash > 0) shiftFlash--;

      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(1, p.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = p.building;
      const bScroll = scroll * 0.15;
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 120 - bScroll) % (width + 120)) - 60;
        const bh = 40 + (i % 3) * 25;
        ctx.fillRect(bx, height * 0.35 - bh, 50, bh);
      }

      const roadY = height * 0.52;
      const roadH = height * 0.48;
      ctx.fillStyle = p.road;
      ctx.fillRect(0, roadY, width, roadH);

      ctx.strokeStyle = p.line;
      ctx.lineWidth = 4;
      ctx.setLineDash([40, 50]);
      const lineScroll = scroll % 90;
      for (let y = roadY + 30; y < height; y += 90) {
        ctx.beginPath();
        ctx.moveTo(width * 0.5, y + lineScroll);
        ctx.lineTo(width * 0.5, y + lineScroll + 40);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = p.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, roadY + 8);
      ctx.lineTo(width, roadY + 8);
      ctx.stroke();

      const finishX = width - ((distance / RACE_DISTANCE) * (width * 1.2) - width * 0.1);
      if (finishX > -40 && finishX < width + 40) {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 === 0 ? p.line : p.road;
          ctx.fillRect(finishX, roadY + i * (roadH / 8), 14, roadH / 8);
        }
      }

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(carX - 4, carY + carH - 2, carW + 8, 8);

      ctx.fillStyle = shiftFlash > 0 && shiftQuality === 1 ? "#7fffd4" : p.car;
      ctx.fillRect(carX, carY, carW, carH);
      ctx.fillStyle = "#333";
      ctx.fillRect(carX + 8, carY + 6, 22, 14);
      ctx.fillStyle = "#222";
      ctx.fillRect(carX + carW - 14, carY + 10, 10, 12);
      ctx.fillStyle = "#111";
      ctx.fillRect(carX + 10, carY + carH - 4, 14, 8);
      ctx.fillRect(carX + carW - 24, carY + carH - 4, 14, 8);

      if (gasRef.current && !finished) {
        ctx.fillStyle = "rgba(255,200,100,0.6)";
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(carX - 12 - i * 8 - (scroll % 5), carY + 14 + i * 2, 6, 4);
        }
      }

      const hudY = height * 0.08;
      ctx.fillStyle = p.hudBg;
      ctx.fillRect(12, hudY, width - 24, 72);
      ctx.strokeStyle = p.hudBorder;
      ctx.strokeRect(12, hudY, width - 24, 72);

      const gaugeX = 28;
      const gaugeW = width - 56;
      const gaugeH = 14;
      const rpmPct = rpm / REDLINE;
      ctx.fillStyle = "#333";
      ctx.fillRect(gaugeX, hudY + 14, gaugeW, gaugeH);
      const shiftStart = SHIFT_MIN / REDLINE;
      const shiftEnd = SHIFT_MAX / REDLINE;
      ctx.fillStyle = "rgba(80,220,120,0.5)";
      ctx.fillRect(gaugeX + gaugeW * shiftStart, hudY + 14, gaugeW * (shiftEnd - shiftStart), gaugeH);
      ctx.fillStyle = rpm > REDLINE * 0.95 ? "#ff4444" : "#ffaa44";
      ctx.fillRect(gaugeX, hudY + 14, gaugeW * Math.min(1, rpmPct), gaugeH);
      ctx.fillStyle = p.hudText;
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.fillText(`${Math.round(rpm)} RPM`, gaugeX, hudY + 10);
      ctx.font = "bold 20px Nunito, sans-serif";
      ctx.fillText(`GEAR ${gear}/${GEARS}`, gaugeX, hudY + 48);
      ctx.fillText(`${Math.round(speed * 18)} km/h`, gaugeX + 120, hudY + 48);
      ctx.font = "bold 14px Nunito, sans-serif";
      ctx.fillText(`${Math.round(distance)}m / ${RACE_DISTANCE}m`, gaugeX + 240, hudY + 48);

      if (shiftFlash > 0) {
        ctx.fillStyle = shiftQuality === 1 ? "#5cd0a8" : shiftQuality === 0 ? "#ffb43d" : "#ff5a5a";
        ctx.font = "bold 16px Nunito, sans-serif";
        ctx.fillText(
          shiftQuality === 1 ? "PERFECT SHIFT!" : shiftQuality === 0 ? "Good shift" : "Too early!",
          width * 0.3,
          height * 0.42,
        );
      }

      // Shift button
      const inGreen = rpm >= SHIFT_MIN && rpm <= SHIFT_MAX;
      ctx.fillStyle = shiftBtnDown ? p.shiftBtnActive : inGreen ? p.shiftBtnReady : p.shiftBtn;
      ctx.fillRect(shiftBtn.x, shiftBtn.y, shiftBtn.w, shiftBtn.h);
      ctx.strokeStyle = inGreen ? p.hudText : p.hudBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(shiftBtn.x, shiftBtn.y, shiftBtn.w, shiftBtn.h);
      ctx.fillStyle = palette.isDark ? "#fff" : p.hudText;
      ctx.font = "bold 16px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SHIFT", shiftBtn.x + shiftBtn.w / 2, shiftBtn.y + shiftBtn.h / 2 + 6);
      ctx.textAlign = "left";

      if (finished) {
        ctx.fillStyle = palette.isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.75)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = p.hudText;
        ctx.font = "bold 28px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FINISH!", width / 2, height / 2);
        ctx.textAlign = "left";
      } else {
        ctx.fillStyle = p.hudText;
        ctx.globalAlpha = 0.55;
        ctx.font = "11px Nunito, sans-serif";
        ctx.fillText("Hold screen to rev", 16, height - 28);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onGasUp);
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
