import { useEffect } from "react";
import { create } from "zustand";
import { getAppTheme, isAppThemeId, type AppThemeId } from "@/lib/appThemes";

export type Theme = "light" | "dark";

const STORAGE_KEY = "upscale:theme";
const STORAGE_SKIN = "upscale:skin";

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

function storedSkin(): AppThemeId | null {
  try {
    const raw = localStorage.getItem(STORAGE_SKIN);
    if (isAppThemeId(raw)) return raw;
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

/** Light/dark actually on screen: an equipped skin pins its own base. */
export function effectiveTheme(theme: Theme, skin: AppThemeId | null): Theme {
  return getAppTheme(skin)?.base ?? theme;
}

function applyTheme(theme: Theme, skin: AppThemeId | null) {
  const root = document.documentElement;
  const base = effectiveTheme(theme, skin);
  root.setAttribute("data-theme", base);
  if (skin) root.setAttribute("data-skin", skin);
  else root.removeAttribute("data-skin");
  root.style.colorScheme = base;
  const color =
    getAppTheme(skin)?.themeColor ?? (base === "dark" ? "#050508" : "#eef0f3");
  // index.html ships media-scoped fallbacks too; keep them all in step.
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", color));
}

interface ThemeState {
  /** The player's own light/dark choice (used when no skin is equipped). */
  theme: Theme;
  /** Equipped Shop theme, or null for the classic look. */
  skin: AppThemeId | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSkin: (skin: AppThemeId | null) => void;
  applySystemTheme: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initial = readInitial();
  const initialSkin = storedSkin();
  applyTheme(initial, initialSkin);

  return {
    theme: initial,
    skin: initialSkin,
    setTheme: (theme) => {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* noop */
      }
      applyTheme(theme, get().skin);
      set({ theme });
    },
    toggleTheme: () => {
      const next = get().theme === "dark" ? "light" : "dark";
      get().setTheme(next);
    },
    setSkin: (skin) => {
      try {
        if (skin) localStorage.setItem(STORAGE_SKIN, skin);
        else localStorage.removeItem(STORAGE_SKIN);
      } catch {
        /* noop */
      }
      applyTheme(get().theme, skin);
      set({ skin });
    },
    applySystemTheme: () => {
      if (storedTheme()) return;
      const theme = systemTheme();
      applyTheme(theme, get().skin);
      set({ theme });
    },
  };
});

/** Light/dark base currently on screen (skin-aware). */
export function useEffectiveTheme(): Theme {
  return useTheme((s) => effectiveTheme(s.theme, s.skin));
}

export function ThemeSyncEffect() {
  const theme = useTheme((s) => s.theme);
  const skin = useTheme((s) => s.skin);
  const applySystemTheme = useTheme((s) => s.applySystemTheme);

  useEffect(() => {
    applyTheme(theme, skin);
  }, [theme, skin]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applySystemTheme();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [applySystemTheme]);

  return null;
}
