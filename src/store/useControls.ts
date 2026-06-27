import { useEffect } from "react";
import { create } from "zustand";

export type ControlKey = "menu" | "back" | "primary" | "secondary" | "tertiary";

export type ControlHandlers = Partial<Record<ControlKey, () => void>>;

interface ControlsState {
  handlers: ControlHandlers;
  settingsOpen: boolean;
  quickMenuOpen: boolean;

  register: (handlers: ControlHandlers) => void;
  clear: () => void;
  invoke: (key: ControlKey) => void;

  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setQuickMenuOpen: (open: boolean) => void;
  toggleQuickMenu: () => void;
}

export const useControls = create<ControlsState>((set, get) => ({
  handlers: {},
  settingsOpen: false,
  quickMenuOpen: false,

  register: (handlers) => set({ handlers }),
  clear: () => set({ handlers: {} }),

  invoke: (key) => {
    get().handlers[key]?.();
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setQuickMenuOpen: (open) => set({ quickMenuOpen: open }),
  toggleQuickMenu: () => set((s) => ({ quickMenuOpen: !s.quickMenuOpen })),
}));

/** Register screen-specific hint actions; cleared automatically on unmount. */
export function useRegisterControls(
  handlers: ControlHandlers,
  deps: unknown[] = [],
) {
  const register = useControls((s) => s.register);
  const clear = useControls((s) => s.clear);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    register(handlers);
    return clear;
  }, [register, clear, ...deps]);
}
