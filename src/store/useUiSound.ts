import { create } from "zustand";

const STORAGE_VOLUME = "upscale:ui-sfx-volume";
const STORAGE_MUTED = "upscale:ui-sfx-muted";

function readVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_VOLUME);
    const v = raw === null ? 0.5 : parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  } catch {
    return 0.5;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_MUTED) === "1";
  } catch {
    return false;
  }
}

interface UiSoundState {
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

/** Soft tap sound-effect preferences (Options menu). */
export const useUiSound = create<UiSoundState>((set, get) => ({
  volume: readVolume(),
  muted: readMuted(),
  setVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(STORAGE_VOLUME, String(clamped));
      localStorage.setItem(STORAGE_MUTED, "0");
    } catch {
      /* noop */
    }
    set({ volume: clamped, muted: false });
  },
  setMuted: (muted) => {
    try {
      localStorage.setItem(STORAGE_MUTED, muted ? "1" : "0");
    } catch {
      /* noop */
    }
    set({ muted });
  },
  toggleMuted: () => {
    get().setMuted(!get().muted);
  },
}));
