import { create } from "zustand";

const STORAGE_MUTED = "upscale:master-muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_MUTED) === "1";
  } catch {
    return false;
  }
}

interface MasterMuteState {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

/** App-wide mute (music, UI chimes, and game audio). Independent of Options sliders. */
export const useMasterMute = create<MasterMuteState>((set, get) => ({
  muted: readMuted(),
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
