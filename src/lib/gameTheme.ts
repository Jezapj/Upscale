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

export interface SpacewalkPalette {
  bgTop: string;
  bgBot: string;
  star: string;
  nebula: string;
  planet: string;
  station: string;
  stationLight: string;
  rocket: string;
  rocketNose: string;
  fin: string;
  flameInner: string;
  flameOuter: string;
  smoke: string;
  portalRim: string;
  portalCore: string;
  portalParticle: string;
  drawPreview: string;
  danger: string;
  hudText: string;
}

export interface AccretionPalette {
  grassTop: string;
  grassBot: string;
  grassStripe: string;
  path: string;
  pathEdge: string;
  hedge: string;
  hedgeDark: string;
  ball: string;
  ballPanel: string;
  finish: string;
  hudText: string;
  danger: string;
  sparkle: string;
}

export interface GamePalette {
  isDark: boolean;
  tiptop: TipTopPalette;
  octane: OctanePalette;
  dissiada: DissiadaPalette;
  daybreak: DaybreakPalette;
  spacewalk: SpacewalkPalette;
  accretion: AccretionPalette;
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
    spacewalk: {
      bgTop: "#232a55",
      bgBot: "#4a4f8c",
      star: "#e8ecff",
      nebula: "rgba(140, 120, 220, 0.16)",
      planet: "#7a8ad4",
      station: "#3a4070",
      stationLight: "#8fd8ff",
      rocket: "#e8ecf5",
      rocketNose: "#ff7a59",
      fin: "#6a7dff",
      flameInner: "#ffe27a",
      flameOuter: "#ff8a4a",
      smoke: "rgba(200, 205, 225, 0.35)",
      portalRim: "#6ee7ff",
      portalCore: "rgba(60, 140, 255, 0.30)",
      portalParticle: "#aef2ff",
      drawPreview: "rgba(110, 231, 255, 0.7)",
      danger: "#ff5c5c",
      hudText: "#f0f2ff",
    },
    accretion: {
      grassTop: "#7ecb6e",
      grassBot: "#5cb85c",
      grassStripe: "rgba(255, 255, 255, 0.07)",
      path: "#e8d8ae",
      pathEdge: "#c4a86a",
      hedge: "#3f8f4a",
      hedgeDark: "#2d6e38",
      ball: "#ffffff",
      ballPanel: "#2d3038",
      finish: "#ff7a59",
      hudText: "#1e3d2a",
      danger: "#ff5c5c",
      sparkle: "#ffd76e",
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
    spacewalk: {
      bgTop: "#070a1a",
      bgBot: "#1a1f42",
      star: "#dfe6ff",
      nebula: "rgba(120, 90, 200, 0.14)",
      planet: "#3a4580",
      station: "#1c2244",
      stationLight: "#6ee7ff",
      rocket: "#dfe3f0",
      rocketNose: "#ff7a59",
      fin: "#6a7dff",
      flameInner: "#ffe27a",
      flameOuter: "#ff8a4a",
      smoke: "rgba(160, 168, 200, 0.30)",
      portalRim: "#6ee7ff",
      portalCore: "rgba(70, 130, 255, 0.28)",
      portalParticle: "#aef2ff",
      drawPreview: "rgba(110, 231, 255, 0.7)",
      danger: "#ff5c5c",
      hudText: "#f0f2ff",
    },
    accretion: {
      grassTop: "#1e3a26",
      grassBot: "#16301e",
      grassStripe: "rgba(255, 255, 255, 0.04)",
      path: "#6a5c3e",
      pathEdge: "#4a4030",
      hedge: "#1f5230",
      hedgeDark: "#143a20",
      ball: "#e8e8ec",
      ballPanel: "#1a1c22",
      finish: "#ff7a59",
      hudText: "#f0f2ff",
      danger: "#ff5c5c",
      sparkle: "#ffd76e",
    },
  },
};

export function getGamePalette(theme: Theme): GamePalette {
  return PALETTES[theme];
}

/** Named unlockable palette overlays keyed by shop id. */
const UNLOCK_OVERLAYS: Record<
  string,
  (base: GamePalette) => GamePalette
> = {
  sunset: (base) => ({
    ...base,
    tiptop: {
      ...base.tiptop,
      skyTop: "#ff9e64",
      skyBot: "#ffe0b8",
      fairway: "#ff7a59",
      ball: "#fff8e8",
    },
    octane: { ...base.octane, car: "#ff9e64", skyTop: "#ffb08a" },
    dissiada: {
      ...base.dissiada,
      laneColors: ["#ff9e64", "#ff5c5c", "#ffd76e", "#ff77b0"],
      hitLine: "rgba(255, 158, 100, 0.7)",
    },
    daybreak: {
      ...base.daybreak,
      accent: "#ff9e64",
      terrainTop: "#ffb08a",
    },
    spacewalk: {
      ...base.spacewalk,
      portalRim: "#ffb87a",
      portalCore: "rgba(255, 158, 100, 0.28)",
      portalParticle: "#ffd9b0",
      drawPreview: "rgba(255, 184, 122, 0.7)",
      fin: "#ff9e64",
      nebula: "rgba(255, 140, 90, 0.14)",
    },
    accretion: {
      ...base.accretion,
      grassTop: "#d4a05c",
      grassBot: "#b8823e",
      ballPanel: "#8a4a2a",
      finish: "#ff9e64",
      sparkle: "#ffe0b8",
    },
  }),
  midnight: (base) => ({
    ...base,
    isDark: true,
    tiptop: {
      ...base.tiptop,
      skyTop: "#1a2840",
      skyBot: "#0e1520",
      fairway: "#6a5a9a",
      ball: "#c084fc",
    },
    octane: {
      ...base.octane,
      skyTop: "#1a1a2e",
      skyBot: "#2a2a40",
      car: "#c084fc",
    },
    dissiada: {
      ...base.dissiada,
      bg: "#0e1018",
      laneColors: ["#c084fc", "#6a5a9a", "#60a5fa", "#a78bfa"],
    },
    daybreak: {
      ...base.daybreak,
      terrain: "#241d38",
      terrainTop: "#6a5a9a",
      accent: "#c084fc",
    },
    spacewalk: {
      ...base.spacewalk,
      bgTop: "#0a0618",
      bgBot: "#1e1438",
      portalRim: "#c084fc",
      portalCore: "rgba(192, 132, 252, 0.28)",
      portalParticle: "#e0c8ff",
      drawPreview: "rgba(192, 132, 252, 0.7)",
      fin: "#c084fc",
    },
    accretion: {
      ...base.accretion,
      grassTop: "#2a2244",
      grassBot: "#1c1734",
      path: "#5a4e78",
      pathEdge: "#3e3458",
      hedge: "#4a3a78",
      hedgeDark: "#342858",
      ballPanel: "#c084fc",
      hudText: "#f0f2ff",
    },
  }),
  mint: (base) => ({
    ...base,
    tiptop: {
      ...base.tiptop,
      skyTop: "#a8efe0",
      skyBot: "#e8f6fc",
      fairway: "#5cd0a8",
      ball: "#ffffff",
    },
    octane: { ...base.octane, car: "#2bc4a8", shiftBtnReady: "#5cd0a8" },
    dissiada: {
      ...base.dissiada,
      laneColors: ["#5cd0a8", "#2bc4a8", "#4aa3ff", "#a06bff"],
      hitLine: "rgba(92, 208, 168, 0.7)",
    },
    daybreak: {
      ...base.daybreak,
      accent: "#5cd0a8",
      terrainTop: "#2bc4a8",
    },
    spacewalk: {
      ...base.spacewalk,
      portalRim: "#5cd0a8",
      portalCore: "rgba(92, 208, 168, 0.28)",
      portalParticle: "#b8f5e0",
      drawPreview: "rgba(92, 208, 168, 0.7)",
      fin: "#2bc4a8",
      nebula: "rgba(60, 200, 160, 0.12)",
    },
    accretion: {
      ...base.accretion,
      grassTop: "#8ee6c8",
      grassBot: "#5cd0a8",
      hedge: "#2bc4a8",
      hedgeDark: "#1e9a84",
      ballPanel: "#1e9a84",
      finish: "#2bc4a8",
    },
  }),
  candy: (base) => ({
    ...base,
    tiptop: {
      ...base.tiptop,
      skyTop: "#ffb8d9",
      skyBot: "#ffe8f4",
      fairway: "#ff77b0",
      ball: "#ffffff",
    },
    octane: { ...base.octane, car: "#ff77b0" },
    dissiada: {
      ...base.dissiada,
      laneColors: ["#ff77b0", "#a06bff", "#4aa3ff", "#ffd76e"],
    },
    daybreak: {
      ...base.daybreak,
      accent: "#ff77b0",
      terrainTop: "#a06bff",
    },
    spacewalk: {
      ...base.spacewalk,
      portalRim: "#ff77b0",
      portalCore: "rgba(255, 119, 176, 0.26)",
      portalParticle: "#ffc8de",
      drawPreview: "rgba(255, 119, 176, 0.7)",
      fin: "#ff77b0",
      nebula: "rgba(255, 120, 180, 0.13)",
    },
    accretion: {
      ...base.accretion,
      grassTop: "#ffb8d9",
      grassBot: "#ff8ec4",
      path: "#fff0f6",
      pathEdge: "#e8a8c8",
      hedge: "#a06bff",
      hedgeDark: "#7a4ed4",
      ballPanel: "#ff77b0",
      finish: "#a06bff",
      hudText: "#5a2a44",
    },
  }),
  mono: (base) => ({
    ...base,
    tiptop: {
      ...base.tiptop,
      skyTop: "#9aabb8",
      skyBot: "#e8eef5",
      fairway: "#5a6068",
      fairwayStripe: "rgba(60,64,71,0.2)",
      ball: "#f0f0f5",
      rough: "#3c4047",
    },
    octane: {
      ...base.octane,
      car: "#3c4047",
      road: "#5a6068",
      building: "#9aabb8",
    },
    dissiada: {
      ...base.dissiada,
      laneColors: ["#3c4047", "#5a6068", "#9aabb8", "#c5ccd4"],
      hitLine: "rgba(60, 64, 71, 0.55)",
    },
    daybreak: {
      ...base.daybreak,
      accent: "#3c4047",
      terrain: "#3c4047",
      terrainTop: "#9aabb8",
    },
    spacewalk: {
      ...base.spacewalk,
      bgTop: "#14161c",
      bgBot: "#2a2e38",
      nebula: "rgba(154, 171, 184, 0.10)",
      planet: "#5a6068",
      portalRim: "#c5ccd4",
      portalCore: "rgba(197, 204, 212, 0.22)",
      portalParticle: "#e8eef5",
      drawPreview: "rgba(197, 204, 212, 0.7)",
      fin: "#9aabb8",
      rocketNose: "#5a6068",
    },
    accretion: {
      ...base.accretion,
      grassTop: "#9aabb8",
      grassBot: "#7a8894",
      path: "#e8eef5",
      pathEdge: "#c5ccd4",
      hedge: "#5a6068",
      hedgeDark: "#3c4047",
      ballPanel: "#3c4047",
      finish: "#3c4047",
      hudText: "#22252a",
    },
  }),
};

export function getGamePaletteWithUnlock(
  theme: Theme,
  unlockId?: string | null,
): GamePalette {
  const base = getGamePalette(theme);
  if (!unlockId) return base;
  const overlay = UNLOCK_OVERLAYS[unlockId];
  return overlay ? overlay(base) : base;
}

