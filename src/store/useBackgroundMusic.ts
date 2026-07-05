import { create } from "zustand";
import {
  BACKGROUND_TRACKS,
  getBackgroundTrack,
  nextBackgroundTrackId,
  type BackgroundTrackId,
} from "@/lib/backgroundMusic";

const STORAGE_VOLUME = "upscale:bg-music-volume";
const STORAGE_TRACK = "upscale:bg-music-track";

function readVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_VOLUME);
    const v = raw === null ? 0.45 : parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.45;
  } catch {
    return 0.45;
  }
}

function readTrack(): BackgroundTrackId {
  try {
    const stored = localStorage.getItem(STORAGE_TRACK);
    if (stored && BACKGROUND_TRACKS.some((t) => t.id === stored)) {
      return stored as BackgroundTrackId;
    }
  } catch {
    /* noop */
  }
  return BACKGROUND_TRACKS[0].id;
}

interface BackgroundMusicState {
  volume: number;
  trackId: BackgroundTrackId;
  setVolume: (volume: number) => void;
  setTrackId: (trackId: BackgroundTrackId) => void;
  cycleTrack: () => void;
}

export const useBackgroundMusic = create<BackgroundMusicState>((set, get) => ({
  volume: readVolume(),
  trackId: readTrack(),
  setVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(STORAGE_VOLUME, String(clamped));
    } catch {
      /* noop */
    }
    set({ volume: clamped });
  },
  setTrackId: (trackId) => {
    try {
      localStorage.setItem(STORAGE_TRACK, trackId);
    } catch {
      /* noop */
    }
    set({ trackId });
  },
  cycleTrack: () => {
    const next = nextBackgroundTrackId(get().trackId);
    get().setTrackId(next);
  },
}));

export function useBackgroundTrack() {
  const trackId = useBackgroundMusic((s) => s.trackId);
  return getBackgroundTrack(trackId);
}
