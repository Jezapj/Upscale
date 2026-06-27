import { useEffect } from "react";
import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "upscale:theme";

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "dark" ? "#050508" : "#eef0f3");
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initial = readStored();
  applyTheme(initial);

  return {
    theme: initial,
    setTheme: (theme) => {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* noop */
      }
      applyTheme(theme);
      set({ theme });
    },
    toggleTheme: () => {
      const next = get().theme === "dark" ? "light" : "dark";
      get().setTheme(next);
    },
  };
});

export function ThemeSyncEffect() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return null;
}
