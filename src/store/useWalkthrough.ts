import { create } from "zustand";
import { useControls } from "./useControls";

export const WALKTHROUGH_SEEN_KEY = "upscale:walkthrough-seen";

export function walkthroughSeen(): boolean {
  try {
    return localStorage.getItem(WALKTHROUGH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWalkthroughSeen(): void {
  try {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, "1");
  } catch {
    /* noop */
  }
}

interface WalkthroughState {
  active: boolean;
  step: number;
  start: () => void;
  stop: (markSeen?: boolean) => void;
  next: (lastIndex: number) => void;
  prev: () => void;
}

export const useWalkthrough = create<WalkthroughState>((set, get) => ({
  active: false,
  step: 0,
  start: () => {
    useControls.getState().setSettingsOpen(false);
    useControls.getState().setQuickMenuOpen(false);
    set({ active: true, step: 0 });
  },
  stop: (markSeen = true) => {
    if (markSeen) markWalkthroughSeen();
    set({ active: false, step: 0 });
  },
  next: (lastIndex) => {
    const { step } = get();
    if (step >= lastIndex) {
      get().stop(true);
      return;
    }
    set({ step: step + 1 });
  },
  prev: () => {
    const { step } = get();
    if (step <= 0) return;
    set({ step: step - 1 });
  },
}));
