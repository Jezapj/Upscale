// IISU-style backdrop: a perforated paper with scattered, hand-drawn line-art
// "sticker" doodles in pastel colours drifting around the edges.
import type { ReactElement } from "react";

type DoodleProps = { c: string; size: number };

const Squiggle = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path
      d="M4 26c4-8 8 8 12 0s8 8 12 0 6-10 8-14"
      stroke={c}
      strokeWidth="3.4"
      strokeLinecap="round"
    />
  </svg>
);
const Star = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path
      d="M20 5l4 9 10 1-7.5 6.5L29 32l-9-5-9 5 2.5-10.5L6 15l10-1z"
      stroke={c}
      strokeWidth="3.2"
      strokeLinejoin="round"
    />
  </svg>
);
const Spiral = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path
      d="M20 20a4 4 0 10-3 3 8 8 0 10 8-9 12 12 0 10-13 13"
      stroke={c}
      strokeWidth="3.2"
      strokeLinecap="round"
    />
  </svg>
);
const Leaf = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path
      d="M8 32C8 16 24 8 34 8c0 14-10 26-26 24z"
      stroke={c}
      strokeWidth="3.2"
      strokeLinejoin="round"
    />
    <path d="M14 28C20 22 26 18 30 16" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
const Plus = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M20 8v24M8 20h24" stroke={c} strokeWidth="4" strokeLinecap="round" />
  </svg>
);
const Drop = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path
      d="M20 6c7 9 12 14 12 20a12 12 0 01-24 0c0-6 5-11 12-20z"
      stroke={c}
      strokeWidth="3.2"
      strokeLinejoin="round"
    />
  </svg>
);
const Pad = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="6" y="13" width="28" height="15" rx="7.5" stroke={c} strokeWidth="3.2" />
    <path d="M13 17v6M10 20h6" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="27" cy="19" r="1.8" fill={c} />
    <circle cx="30" cy="23" r="1.8" fill={c} />
  </svg>
);
const Arrows = ({ c, size }: DoodleProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M8 28L22 10M14 10h8v8" stroke={c} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 32L32 14M24 14h8v8" stroke={c} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const D = { Squiggle, Star, Spiral, Leaf, Plus, Drop, Pad, Arrows };

interface Item {
  Comp: (p: DoodleProps) => ReactElement;
  c: string;
  size: number;
  left: string;
  top: string;
  rot: number;
  delay: string;
}

const MINT = "#7fdcc0";
const PURPLE = "#b59bf0";
const CORAL = "#ff8f7a";
const ORANGE = "#ffb04d";
const BLUE = "#7db8ff";
const PINK = "#ff9ecb";

const ITEMS: Item[] = [
  { Comp: D.Squiggle, c: MINT, size: 46, left: "-3%", top: "16%", rot: -12, delay: "0s" },
  { Comp: D.Star, c: ORANGE, size: 30, left: "12%", top: "6%", rot: 8, delay: "1.2s" },
  { Comp: D.Spiral, c: PURPLE, size: 38, left: "84%", top: "5%", rot: 0, delay: "0.6s" },
  { Comp: D.Plus, c: CORAL, size: 22, left: "70%", top: "12%", rot: 0, delay: "2s" },
  { Comp: D.Drop, c: BLUE, size: 26, left: "92%", top: "30%", rot: 18, delay: "1.5s" },
  { Comp: D.Leaf, c: MINT, size: 44, left: "-4%", top: "58%", rot: 20, delay: "0.3s" },
  { Comp: D.Arrows, c: PINK, size: 40, left: "88%", top: "66%", rot: -6, delay: "1.8s" },
  { Comp: D.Pad, c: PURPLE, size: 42, left: "6%", top: "86%", rot: -10, delay: "2.6s" },
  { Comp: D.Star, c: BLUE, size: 22, left: "34%", top: "92%", rot: 0, delay: "0.9s" },
  { Comp: D.Squiggle, c: ORANGE, size: 36, left: "60%", top: "90%", rot: 10, delay: "3s" },
  { Comp: D.Plus, c: MINT, size: 18, left: "46%", top: "4%", rot: 0, delay: "1.1s" },
  { Comp: D.Drop, c: CORAL, size: 22, left: "20%", top: "44%", rot: -20, delay: "2.2s" },
];

export function BackgroundDecor() {
  return (
    <div className="paper-bg pointer-events-none overflow-hidden">
      {ITEMS.map((it, i) => (
        <span
          key={i}
          className="absolute animate-floaty doodle-layer no-select"
          style={{
            left: it.left,
            top: it.top,
            // @ts-expect-error custom prop consumed by the floaty keyframes
            "--r": `${it.rot}deg`,
            transform: `rotate(${it.rot}deg)`,
            animationDelay: it.delay,
            opacity: 0.7,
            filter: "drop-shadow(0 2px 3px rgba(120,140,165,0.18))",
          }}
        >
          <it.Comp c={it.c} size={it.size} />
        </span>
      ))}
    </div>
  );
}
