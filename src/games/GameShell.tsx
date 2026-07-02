import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GameId } from "@/lib/types";
import { GAME_BY_ID } from "@/lib/games";
import { GamePaletteProvider } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import { useStore } from "@/store/useStore";
import { getGameScores } from "@/lib/gameLeaderboard";
import { GameLeaderboardList } from "@/components/GameLeaderboardList";

interface Props {
  gameId: GameId;
  children: (api: {
    width: number;
    height: number;
    onGameOver: (result: number | GameResult) => void;
  }) => React.ReactNode;
  /** Custom pre-play UI (e.g. Octane mode picker). Call `start()` when ready. */
  renderLobby?: (start: () => void) => React.ReactNode;
  /** Called when the player chooses Play again (e.g. clear mode config). */
  onSessionReset?: () => void;
  /** Default leaderboard key when not set on the game result. */
  leaderboardKey?: string;
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
export function GameShell({
  gameId,
  children,
  renderLobby,
  onSessionReset,
  leaderboardKey: defaultLeaderboardKey,
}: Props) {
  const nav = useNavigate();
  const meta = GAME_BY_ID[gameId];
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const size = useContainerSize(containerRef);
  const [result, setResult] = useState<GameResult | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [activeBoardKey, setActiveBoardKey] = useState(defaultLeaderboardKey ?? gameId);
  const [started, setStarted] = useState(false);

  const lobbyBoardKey = defaultLeaderboardKey ?? gameId;
  const user = useStore((s) => s.user);
  const recordGameScore = useStore((s) => s.recordGameScore);
  const lobbyEntries = useStore((s) => getGameScores(s.data, lobbyBoardKey));

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    setResult(null);
    setIsNewBest(false);
  }, []);

  const onGameOver = useCallback(
    (input: number | GameResult) => {
      const normalized = typeof input === "number" ? { score: input } : input;
      const boardKey = normalized.leaderboardKey ?? defaultLeaderboardKey ?? gameId;
      setActiveBoardKey(boardKey);

      const meta: Record<string, string> = {};
      for (const stat of normalized.stats ?? []) {
        meta[stat.label] = stat.value;
      }

      let newBest = false;
      if (user) {
        newBest = recordGameScore(boardKey, normalized.score, Object.keys(meta).length ? meta : undefined);
      }
      setIsNewBest(newBest);
      setResult(normalized);
      startedRef.current = false;
      setStarted(false);
    },
    [defaultLeaderboardKey, gameId, recordGameScore, user],
  );

  const boardEntries = useStore((s) => getGameScores(s.data, activeBoardKey));

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
          {!started && result === null && (
            renderLobby ? (
              renderLobby(start)
            ) : (
              <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm font-700 text-ink-soft">{meta.tagline}</p>
                {user && lobbyEntries.length > 0 && (
                  <GameLeaderboardList entries={lobbyEntries} compact />
                )}
                <button type="button" onClick={start} className="btn px-8">
                  Play
                </button>
              </div>
            )
          )}
          {result !== null && !started && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8">
              {result.title && (
                <p className="text-sm font-700 text-ink-soft">{result.title}</p>
              )}
              {isNewBest && (
                <p className="text-sm font-800 text-accent">New personal best!</p>
              )}
              <p className="game-shell-title font-display text-2xl font-800">
                Score: {result.score.toLocaleString()}
              </p>
              {result.stats && result.stats.length > 0 && (
                <div className="flex flex-col gap-1 text-center">
                  {result.stats.map((stat) => (
                    <p key={stat.label} className="text-sm font-700 text-ink-soft">
                      {stat.label}: <span className="text-ink">{stat.value}</span>
                    </p>
                  ))}
                </div>
              )}
              {user ? (
                <GameLeaderboardList entries={boardEntries} highlightScore={result.score} compact />
              ) : (
                <p className="text-xs font-700 text-ink-faint">Sign in to save scores to your leaderboard.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  onSessionReset?.();
                  setResult(null);
                  setIsNewBest(false);
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
