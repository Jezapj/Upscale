import type { Theme } from "@/store/useTheme";

export interface TipTopPalette {
  skyTop: string;
  skyBot: string;
  rough: string;
  fairway: string;
  fairwayStripe: string;
  bunker: string;
  cup: string;
  cupInner: string;
  ball: string;
  hud: string;
  guide: string;
}

export interface OctanePalette {
  skyTop: string;
  skyBot: string;
  building: string;
  road: string;
  line: string;
  car: string;
  hudBg: string;
  hudBorder: string;
  hudText: string;
  shiftBtn: string;
  shiftBtnActive: string;
  shiftBtnReady: string;
}

export interface DissiadaPalette {
  bg: string;
  laneEven: string;
  laneFlash: string;
  divider: string;
  guideZone: string;
  perfectZone: string;
  hitLine: string;
  label: string;
  laneColors: string[];
}

export interface DaybreakPalette {
  /** Tint washed over the parallax background so terrain reads clearly. */
  bgOverlay: string;
  terrain: string;
  terrainTop: string;
  beatMarker: string;
  spike: string;
  spikeEdge: string;
  accent: string;
  hudText: string;
  hudChip: string;
  progressTrack: string;
  particleJump: string;
  particleLand: string;
  particleDeath: string[];
}

export interface GamePalette {
  isDark: boolean;
  tiptop: TipTopPalette;
  octane: OctanePalette;
  dissiada: DissiadaPalette;
  daybreak: DaybreakPalette;
}

const PALETTES: Record<Theme, GamePalette> = {
  light: {
    isDark: false,
    tiptop: {
      skyTop: "#87ceeb",
      skyBot: "#e8f6fc",
      rough: "#3d7a52",
      fairway: "#6ecf8a",
      fairwayStripe: "rgba(90, 170, 110, 0.35)",
      bunker: "#e8d4a8",
      cup: "#2d5a3a",
      cupInner: "#1a3d28",
      ball: "#ffffff",
      hud: "#1e3d2a",
      guide: "rgba(30, 61, 42, 0.25)",
    },
    octane: {
      skyTop: "#b8d4f0",
      skyBot: "#e8eef5",
      building: "#9aabb8",
      road: "#5a6068",
      line: "#ffffff",
      car: "#ff7a59",
      hudBg: "rgba(255,255,255,0.92)",
      hudBorder: "rgba(60, 64, 71, 0.15)",
      hudText: "#3c4047",
      shiftBtn: "#dde0e6",
      shiftBtnActive: "#3a8ef0",
      shiftBtnReady: "#5cd0a8",
    },
    dissiada: {
      bg: "#eef0f3",
      laneEven: "rgba(60, 64, 71, 0.04)",
      laneFlash: "rgba(60, 64, 71, 0.12)",
      divider: "rgba(60, 64, 71, 0.12)",
      guideZone: "rgba(160, 107, 255, 0.08)",
      perfectZone: "rgba(160, 107, 255, 0.18)",
      hitLine: "rgba(160, 107, 255, 0.55)",
      label: "rgba(60, 64, 71, 0.45)",
      laneColors: ["#a06bff", "#4aa3ff", "#ff77b0", "#2bc4a8"],
    },
    daybreak: {
      bgOverlay: "rgba(255, 245, 235, 0.12)",
      terrain: "#463a5e",
      terrainTop: "#8b7ab8",
      beatMarker: "rgba(255, 255, 255, 0.10)",
      spike: "#2d2440",
      spikeEdge: "#c9b8ff",
      accent: "#ff9e64",
      hudText: "#2d2440",
      hudChip: "rgba(255, 255, 255, 0.72)",
      progressTrack: "rgba(45, 36, 64, 0.25)",
      particleJump: "#ffe0b8",
      particleLand: "#c9b8ff",
      particleDeath: ["#ff9e64", "#ff5c5c", "#ffd76e", "#ffffff"],
    },
  },
  dark: {
    isDark: true,
    tiptop: {
      skyTop: "#1a2840",
      skyBot: "#0e1520",
      rough: "#1a3028",
      fairway: "#2a5a48",
      fairwayStripe: "rgba(92, 208, 168, 0.12)",
      bunker: "#4a4030",
      cup: "#1a3d28",
      cupInner: "#0d2018",
      ball: "#f0f0f5",
      hud: "#f0f0f5",
      guide: "rgba(192, 132, 252, 0.3)",
    },
    octane: {
      skyTop: "#1a1a2e",
      skyBot: "#4a4a6a",
      building: "#2a2a40",
      road: "#3a3f48",
      line: "#f0f0f0",
      car: "#ff7a59",
      hudBg: "rgba(12, 12, 18, 0.88)",
      hudBorder: "rgba(255, 255, 255, 0.1)",
      hudText: "#f0f0f5",
      shiftBtn: "#555",
      shiftBtnActive: "#3a8ef0",
      shiftBtnReady: "#5cd0a8",
    },
    dissiada: {
      bg: "#0e1018",
      laneEven: "rgba(255, 255, 255, 0.03)",
      laneFlash: "rgba(255, 255, 255, 0.12)",
      divider: "rgba(255, 255, 255, 0.1)",
      guideZone: "rgba(255, 255, 255, 0.04)",
      perfectZone: "rgba(192, 132, 252, 0.25)",
      hitLine: "rgba(192, 132, 252, 0.7)",
      label: "rgba(255, 255, 255, 0.35)",
      laneColors: ["#c084fc", "#60a5fa", "#f472b6", "#34d399"],
    },
    daybreak: {
      bgOverlay: "rgba(10, 8, 24, 0.45)",
      terrain: "#241d38",
      terrainTop: "#6a5a9a",
      beatMarker: "rgba(255, 255, 255, 0.08)",
      spike: "#171126",
      spikeEdge: "#a68cff",
      accent: "#ff9e64",
      hudText: "#f0f0f5",
      hudChip: "rgba(12, 12, 18, 0.66)",
      particleJump: "#ffd9a8",
      particleLand: "#a68cff",
      particleDeath: ["#ff9e64", "#ff5c5c", "#ffd76e", "#ffffff"],
      progressTrack: "rgba(240, 240, 245, 0.2)",
    },
  },
};

export function getGamePalette(theme: Theme): GamePalette {
  return PALETTES[theme];
}
