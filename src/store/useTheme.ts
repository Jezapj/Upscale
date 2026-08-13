import { useEffect } from "react";
import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "upscale:theme";

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function storedTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* noop */
  }
  return null;
}

function systemTheme(): Theme {
  return prefersDark() ? "dark" : "light";
}

function readInitial(): Theme {
  return storedTheme() ?? systemTheme();
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
  applySystemTheme: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initial = readInitial();
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
    applySystemTheme: () => {
      if (storedTheme()) return;
      const theme = systemTheme();
      applyTheme(theme);
      set({ theme });
    },
  };
});

export function ThemeSyncEffect() {
  const theme = useTheme((s) => s.theme);
  const applySystemTheme = useTheme((s) => s.applySystemTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applySystemTheme();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [applySystemTheme]);

  return null;
}
