import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GameId } from "@/lib/types";
import { GAME_BY_ID } from "@/lib/games";
import { GamePaletteProvider } from "./GamePaletteContext";

interface Props {
  gameId: GameId;
  children: (api: {
    width: number;
    height: number;
    onGameOver: (score: number) => void;
  }) => React.ReactNode;
  /** Custom pre-play UI (e.g. Octane mode picker). Call `start()` when ready. */
  renderLobby?: (start: () => void) => React.ReactNode;
  /** Called when the player chooses Play again (e.g. clear mode config). */
  onSessionReset?: () => void;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

/** Wraps a canvas game with themed chrome and play flow. */
export function GameShell({ gameId, children, renderLobby, onSessionReset }: Props) {
  const nav = useNavigate();
  const meta = GAME_BY_ID[gameId];
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const size = useContainerSize(containerRef);
  const [score, setScore] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    setScore(null);
  }, []);

  const onGameOver = useCallback((s: number) => {
    setScore(s);
    startedRef.current = false;
    setStarted(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") nav("/games");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  return (
    <GamePaletteProvider>
      <div className="game-shell flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={() => nav("/games")}
            className="capsule flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center">
            <p className="game-shell-title font-display text-lg font-800">{meta.name}</p>
            <p className="text-[10px] font-700 text-ink-faint">{meta.controls}</p>
          </div>
          <div className="w-10" />
        </div>

        <div ref={containerRef} className="game-stage relative min-h-0 flex-1 overflow-hidden">
          {!started && score === null && (
            renderLobby ? (
              renderLobby(start)
            ) : (
              <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm font-700 text-ink-soft">{meta.tagline}</p>
                <button type="button" onClick={start} className="btn px-8">
                  Play
                </button>
              </div>
            )
          )}
          {score !== null && !started && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6">
              <p className="game-shell-title font-display text-2xl font-800">
                Score: {score}
              </p>
              <button
                type="button"
                onClick={() => {
                  onSessionReset?.();
                  setScore(null);
                  startedRef.current = false;
                  setStarted(false);
                  if (!renderLobby) start();
                }}
                className="btn"
              >
                Play again
              </button>
              <button type="button" onClick={() => nav("/games")} className="btn-ghost">
                Back to arcade
              </button>
            </div>
          )}
          {started && size.width > 0 && children({ ...size, onGameOver })}
        </div>
      </div>
    </GamePaletteProvider>
  );
}
