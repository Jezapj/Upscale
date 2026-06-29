import { createContext, useContext, type ReactNode } from "react";
import { getGamePalette, type GamePalette } from "@/lib/gameTheme";
import { useTheme } from "@/store/useTheme";

const GamePaletteContext = createContext<GamePalette | null>(null);

export function GamePaletteProvider({ children }: { children: ReactNode }) {
  const theme = useTheme((s) => s.theme);
  return (
    <GamePaletteContext.Provider value={getGamePalette(theme)}>
      {children}
    </GamePaletteContext.Provider>
  );
}

export function useGamePalette(): GamePalette {
  const ctx = useContext(GamePaletteContext);
  if (!ctx) return getGamePalette("light");
  return ctx;
}
