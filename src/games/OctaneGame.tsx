import { useEffect, useRef } from "react";
import { useGamePalette } from "./GamePaletteContext";

interface Props {
  width: number;
  height: number;
  onGameOver: (score: number) => void;
}

const GEARS = 6;
const RPM_MAX = 9000;
const REDLINE_START = 7500;
const REDLINE_END = 9000;
const SHIFT_PERFECT_MIN = 7000;
const SHIFT_PERFECT_MAX = 8800;
const RACE_DISTANCE = 4800;

function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  value: number,
  max: number,
  label: string,
  unit: string,
  redlineStart: number | null,
  redlineEnd: number | null,
  faceColor: string,
  tickColor: string,
  needleColor: string,
) {
  const startA = Math.PI * 0.75;
  const endA = Math.PI * 2.25;
  const span = endA - startA;

  ctx.fillStyle = faceColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startA, endA);
  ctx.stroke();

  if (redlineStart !== null && redlineEnd !== null) {
    const rs = startA + (redlineStart / max) * span;
    const re = startA + (redlineEnd / max) * span;
    ctx.strokeStyle = "#e03030";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, rs, re);
    ctx.stroke();
  }

  const majorTicks = max <= 10 ? 9 : 8;
  for (let i = 0; i <= majorTicks; i++) {
    const t = i / majorTicks;
    const ang = startA + t * span;
    const inner = r - 14;
    const outer = r - 4;
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();

    if (i % 2 === 0) {
      const display = max <= 10 ? i : i * (max / majorTicks / 1000);
      ctx.fillStyle = tickColor;
      ctx.font = "bold 9px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(display)), cx + Math.cos(ang) * (r - 22), cy + Math.sin(ang) * (r - 22) + 3);
    }
  }

  const pct = Math.min(1, value / max);
  const needleA = startA + pct * span;
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needleA) * (r - 18), cy + Math.sin(needleA) * (r - 18));
  ctx.stroke();
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = tickColor;
  ctx.font = "bold 10px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + r * 0.45);
  ctx.font = "bold 13px Nunito, sans-serif";
  ctx.fillText(unit, cx, cy + 8);
  ctx.textAlign = "left";
}

function drawCheckeredPedal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
) {
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(x, y, w, h);

  const cell = 6;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const even = (row + col) % 2 === 0;
      ctx.fillStyle = even ? "#f2f2f2" : "#1a1a1a";
      const cw = Math.min(cell, x + w - (x + col * cell));
      const ch = Math.min(cell, y + h - (y + row * cell));
      ctx.fillRect(x + col * cell, y + row * cell, cw, ch);
    }
  }

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "rgba(255,255,255,0.22)");
  grad.addColorStop(0.5, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  if (active) {
    ctx.fillStyle = "rgba(92, 208, 168, 0.4)";
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawPixelCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bodyColor: string,
  scale: number,
) {
  const cols = [
    "......bbbbbbbbbbbbbbbb......",
    "....bbbbbbbbbbbbbbbbbbbb....",
    "...bbbbbbbbbbbbbbbbbbbbbb...",
    "..bbbbbbwwwwwwwwwwwwbbbbbb..",
    ".bbbbbbwwwwwwwwwwwwwwbbbbbb.",
    "bbbbbbwwwwwwwwwwwwwwwwbbbbbb",
    "bbbbbbwwwwwwwwwwwwwwwwbbbbbb",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "bbwwwwbbbbbbbbbbbbbbwwwwbbbb",
    "bbwwwwbbbbbbbbbbbbbbwwwwbbbb",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "...bbbbbb......bbbbbb...",
  ];
  const colorMap: Record<string, string> = {
    b: bodyColor,
    w: "#88bbee",
    ".": "",
  };
  cols.forEach((row, ri) => {
    for (let ci = 0; ci < row.length; ci++) {
      const ch = row[ci];
      if (ch === ".") continue;
      ctx.fillStyle = colorMap[ch] ?? bodyColor;
      ctx.fillRect(x + ci * scale, y + ri * scale, scale, scale);
    }
  });
}

/** Pixel drag racer: hold gas, clutch to shift at redline, scrolling road, dashboard gauges. */
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

    const sceneH = height * 0.58;
    const dashY = sceneH;
    const dashH = height - sceneH;
    const roadY = sceneH * 0.72;
    const roadH = sceneH - roadY;
    const carScale = 5;
    const carRows = 14;
    const carH = carRows * carScale;
    const carW = 28 * carScale;
    const carX = width * 0.08;
    const carY = roadY + roadH * 0.42 - carH;

    const clutchBtn = { x: 14, y: height - 62, w: 40, h: 40 };
    const brakeBtn = { x: 60, y: height - 62, w: 40, h: 40 };
    const gasBtn = { x: width - 62, y: height - 98, w: 48, h: 76 };

    const hit = (x: number, y: number, b: typeof gasBtn) =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    let rpm = 2200;
    let gear = 1;
    let speed = 0;
    let distance = 0;
    let scroll = 0;
    let alive = true;
    let finished = false;
    let shiftFlash = 0;
    let shiftQuality = 0;
    let time = 0;
    let clutchDown = false;
    let brakeDown = false;
    let gasDown = false;

    const rpmRiseRate = (g: number) => 165 / Math.pow(g, 1.85);

    const shift = () => {
      if (!alive || finished || gear >= GEARS) return;
      if (rpm < SHIFT_PERFECT_MIN * 0.55) {
        shiftQuality = -1;
        shiftFlash = 22;
        rpm = Math.max(1800, rpm - 900);
        speed = Math.max(0, speed - 1.2);
        return;
      }
      const perfect = rpm >= SHIFT_PERFECT_MIN && rpm <= SHIFT_PERFECT_MAX;
      shiftQuality = perfect ? 1 : rpm > SHIFT_PERFECT_MAX ? -1 : 0;
      shiftFlash = perfect ? 40 : 18;
      gear++;
      rpm = perfect ? 3800 + gear * 120 : 4600 + gear * 80;
      speed += perfect ? 5.5 : rpm > SHIFT_PERFECT_MAX ? 1.5 : 3;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (hit(x, y, clutchBtn)) {
        clutchDown = true;
        shift();
      } else if (hit(x, y, brakeBtn)) {
        brakeDown = true;
      } else if (hit(x, y, gasBtn)) {
        gasDown = true;
        gasRef.current = true;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (clutchDown && hit(x, y, clutchBtn)) clutchDown = false;
      if (brakeDown && hit(x, y, brakeBtn)) brakeDown = false;
      if (gasDown && hit(x, y, gasBtn)) {
        gasDown = false;
        gasRef.current = false;
      }
    };
    const onLeave = () => {
      clutchDown = false;
      brakeDown = false;
      gasDown = false;
      gasRef.current = false;
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
    canvas.addEventListener("pointerleave", onLeave);
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
          rpm += rpmRiseRate(gear) * dt;
          const gearMult = 1 + (gear - 1) * 0.28;
          speed += 0.065 * gearMult * dt;
        } else {
          rpm -= 75 * dt;
          speed = Math.max(0, speed - 0.035 * dt);
        }
        if (brakeDown) {
          rpm -= 120 * dt;
          speed = Math.max(0, speed - 0.12 * dt);
        }

        if (rpm > REDLINE_END) {
          rpm = REDLINE_END;
        }
        rpm = Math.max(1600, Math.min(RPM_MAX, rpm));

        distance += speed * dt * 0.42;
        scroll += speed * dt * 3.2;

        if (distance >= RACE_DISTANCE) {
          finished = true;
          const score = Math.round((RACE_DISTANCE / Math.max(time, 1)) * 100);
          setTimeout(() => onGameOver(score), 800);
        }
      }

      if (shiftFlash > 0) shiftFlash--;

      const sky = ctx.createLinearGradient(0, 0, 0, sceneH);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(0.55, p.skyBot);
      sky.addColorStop(1, "#6ecf8a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, sceneH);

      const cloudScroll = scroll * 0.08;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 180 - cloudScroll) % (width + 200)) - 80;
        const cy = 28 + (i % 3) * 22;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.arc(cx + 24, cy - 6, 18, 0, Math.PI * 2);
        ctx.arc(cx + 44, cy, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      const poleScroll = scroll * 0.45;
      for (let i = 0; i < 6; i++) {
        const px = ((i * 140 - poleScroll) % (width + 160)) - 40;
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, sceneH * 0.42);
        ctx.lineTo(px, sceneH * 0.72);
        ctx.stroke();
        ctx.fillStyle = "#444";
        ctx.fillRect(px - 8, sceneH * 0.4, 16, 6);
      }

      const roadY = sceneH * 0.72;
      const roadH = sceneH - roadY;
      ctx.fillStyle = p.road;
      ctx.fillRect(0, roadY, width, roadH);

      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, roadY + 4);
      ctx.lineTo(width, roadY + 4);
      ctx.stroke();

      const lineScroll = scroll % 70;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([36, 44]);
      for (let lx = -lineScroll; lx < width + 70; lx += 80) {
        ctx.beginPath();
        ctx.moveTo(lx, roadY + roadH * 0.55);
        ctx.lineTo(lx + 36, roadY + roadH * 0.55);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const finishScroll = width - ((distance / RACE_DISTANCE) * (width * 2.5));
      if (finishScroll > -60 && finishScroll < width + 60) {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#fff" : "#111";
          ctx.fillRect(finishScroll, roadY, 16, roadH);
        }
      }

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(carX + carW * 0.45, roadY + roadH * 0.38, carW * 0.42, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      const carColor = shiftFlash > 0 && shiftQuality === 1 ? "#7fffd4" : "#1a1a1a";
      drawPixelCar(ctx, carX, carY, carColor, carScale);

      if (gasRef.current && !finished) {
        ctx.fillStyle = "rgba(255,180,80,0.7)";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(carX - 12 - i * 8 - (scroll % 4), carY + carH * 0.55 + i, 6, 4);
        }
      }

      ctx.fillStyle = palette.isDark ? "rgba(8,10,16,0.92)" : "rgba(30,32,38,0.88)";
      ctx.fillRect(0, dashY, width, dashH);
      ctx.strokeStyle = p.hudBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, dashY);
      ctx.lineTo(width, dashY);
      ctx.stroke();

      const gaugeR = Math.min(dashH * 0.38, width * 0.17);
      const rpmCx = width * 0.28;
      const mphCx = width * 0.72;
      const gaugeCy = dashY + dashH * 0.42;
      const face = palette.isDark ? "#1a1c24" : "#e8eaee";
      const tick = palette.isDark ? "#ccc" : "#333";

      drawGauge(
        ctx,
        rpmCx,
        gaugeCy,
        gaugeR,
        rpm / 1000,
        9,
        "RPM",
        `${Math.round(rpm)}`,
        REDLINE_START / 1000,
        REDLINE_END / 1000,
        face,
        tick,
        rpm >= REDLINE_START ? "#ff4444" : "#ffaa44",
      );

      const mph = Math.round(speed * 22);
      drawGauge(ctx, mphCx, gaugeCy, gaugeR, mph, 160, "MPH", `${mph}`, null, null, face, tick, "#44aaff");

      const gearX = width * 0.5;
      const gearTop = dashY + dashH * 0.18;
      ctx.fillStyle = tick;
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GEAR", gearX, gearTop);
      const bars = ["#4aa3ff", "#5cd0a8", "#ffb43d", "#ff7a59", "#ff5a5a", "#c084fc"];
      for (let i = 0; i < GEARS; i++) {
        ctx.fillStyle = i < gear ? bars[i % bars.length] : "rgba(120,120,120,0.35)";
        ctx.fillRect(gearX - 28 + i * 10, gearTop + 8, 8, 22);
      }
      ctx.font = "bold 28px Nunito, sans-serif";
      ctx.fillStyle = gear === 0 ? tick : bars[(gear - 1) % bars.length];
      ctx.fillText(gear >= 1 ? String(gear) : "N", gearX, gearTop + 58);
      ctx.font = "bold 10px Nunito, sans-serif";
      ctx.fillStyle = "rgba(150,150,150,0.8)";
      ctx.fillText("R", gearX - 20, gearTop + 58);
      ctx.textAlign = "left";

      ctx.fillStyle = tick;
      ctx.font = "bold 11px Nunito, sans-serif";
      ctx.fillText(`${Math.round(distance)}m`, 14, dashY + 16);
      ctx.fillText(`${RACE_DISTANCE}m`, width - 58, dashY + 16);

      drawCheckeredPedal(ctx, clutchBtn.x, clutchBtn.y, clutchBtn.w, clutchBtn.h, clutchDown);
      drawCheckeredPedal(ctx, brakeBtn.x, brakeBtn.y, brakeBtn.w, brakeBtn.h, brakeDown);
      drawCheckeredPedal(ctx, gasBtn.x, gasBtn.y, gasBtn.w, gasBtn.h, gasDown || gasRef.current);

      ctx.fillStyle = tick;
      ctx.font = "9px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CLUTCH", clutchBtn.x + clutchBtn.w / 2, height - 6);
      ctx.fillText("BRAKE", brakeBtn.x + brakeBtn.w / 2, height - 6);
      ctx.fillText("GAS", gasBtn.x + gasBtn.w / 2, height - 6);
      ctx.textAlign = "left";

      if (shiftFlash > 0) {
        ctx.fillStyle =
          shiftQuality === 1 ? "#5cd0a8" : shiftQuality === 0 ? "#ffb43d" : "#ff5a5a";
        ctx.font = "bold 15px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          shiftQuality === 1 ? "PERFECT!" : shiftQuality === 0 ? "Good shift" : rpm > SHIFT_PERFECT_MAX ? "Over-rev!" : "Too early!",
          width / 2,
          sceneH * 0.35,
        );
        ctx.textAlign = "left";
      }

      if (finished) {
        ctx.fillStyle = palette.isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = p.hudText;
        ctx.font = "bold 28px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FINISH!", width / 2, height / 2);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
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
