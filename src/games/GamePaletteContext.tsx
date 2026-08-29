import { createContext, useContext, type ReactNode } from "react";
import { getGamePalette, getGamePaletteWithUnlock, type GamePalette } from "@/lib/gameTheme";
import { useTheme } from "@/store/useTheme";
import { useStore } from "@/store/useStore";
import type { GameId } from "@/lib/types";

const GamePaletteContext = createContext<GamePalette | null>(null);

export function GamePaletteProvider({
  children,
  gameId,
}: {
  children: ReactNode;
  gameId?: GameId;
}) {
  const theme = useTheme((s) => s.theme);
  const equipped = useStore((s) =>
    gameId ? s.data?.arcadeUnlocks?.equipped?.[gameId] : undefined,
  );
  const palette = getGamePaletteWithUnlock(theme, equipped);
  return (
    <GamePaletteContext.Provider value={palette}>
      {children}
    </GamePaletteContext.Provider>
  );
}

export function useGamePalette(): GamePalette {
  const ctx = useContext(GamePaletteContext);
  if (!ctx) return getGamePalette("light");
  return ctx;
}
