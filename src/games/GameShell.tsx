import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pause } from "lucide-react";
import type { GameId } from "@/lib/types";
import { GAME_BY_ID } from "@/lib/games";
import { GamePaletteProvider } from "./GamePaletteContext";
import type { GameResult } from "./gameResult";
import { useStore } from "@/store/useStore";
import { getGameScores } from "@/lib/gameLeaderboard";
import { GameLeaderboardList } from "@/components/GameLeaderboardList";
import { DailyBoardList } from "@/components/DailyBoardList";
import { ArcadeUsernameModal } from "@/components/ArcadeUsernameModal";
import {
  arcadeDisplayName,
  dailySeed,
  getDailyCompletion,
  hasPlayedDaily,
} from "@/lib/dailyChallenge";
import {
  listDailyBoard,
  submitDailyScore,
  type DailyBoardEntry,
} from "@/lib/dailyLeaderboard";
import { googleSubFromUserId } from "@/lib/cloudSync";
import { prettyDay, todayKey } from "@/lib/dates";

export type PlayMode = "daily" | "practice";

interface Props {
  gameId: GameId;
  children: (api: {
    width: number;
    height: number;
    onGameOver: (result: number | GameResult) => void;
    /** True while the shell pause menu is open — freeze the game loop. */
    paused: boolean;
    playMode: PlayMode;
    /** Set for daily runs (and optional practice seeds). */
    seed?: number;
  }) => React.ReactNode;
  /** Custom practice lobby (e.g. Octane mode picker). Call `start()` when ready. */
  renderPracticeLobby?: (start: () => void) => React.ReactNode;
  /** Called when returning to lobby / resetting practice session. */
  onSessionReset?: () => void;
  /** Personal practice board key when not set on the game result. */
  practiceLeaderboardKey?: string;
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

function normalizeResult(input: number | GameResult): GameResult {
  return typeof input === "number" ? { score: input } : input;
}

function resultMeta(result: GameResult): Record<string, string> | undefined {
  if (!result.stats?.length) return undefined;
  const metaMap: Record<string, string> = {};
  for (const stat of result.stats) metaMap[stat.label] = stat.value;
  return Object.keys(metaMap).length ? metaMap : undefined;
}

/** Fullscreen canvas shell: daily challenge (main) + practice. */
export function GameShell({
  gameId,
  children,
  renderPracticeLobby,
  onSessionReset,
  practiceLeaderboardKey,
}: Props) {
  const nav = useNavigate();
  const meta = GAME_BY_ID[gameId];
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const size = useContainerSize(containerRef);

  const [playMode, setPlayMode] = useState<PlayMode | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [activePracticeKey, setActivePracticeKey] = useState(
    practiceLeaderboardKey ?? gameId,
  );
  const [showPracticePicker, setShowPracticePicker] = useState(false);
  const [dailyEntries, setDailyEntries] = useState<DailyBoardEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingDailySubmit, setPendingDailySubmit] = useState<GameResult | null>(
    null,
  );

  const today = useStore((s) => s.today);
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const recordGameScore = useStore((s) => s.recordGameScore);
  const markDailyPlayed = useStore((s) => s.markDailyPlayed);
  const setArcadeProfile = useStore((s) => s.setArcadeProfile);

  const dailyDone = hasPlayedDaily(data, gameId, today);
  const dailyCompletion = getDailyCompletion(data, gameId, today);
  const googleSub = user ? googleSubFromUserId(user.id) : null;
  const isGoogle = !!googleSub;
  const daySeed = dailySeed(gameId, today);
  const practiceEntries = useStore((s) =>
    getGameScores(s.data, activePracticeKey),
  );

  const refreshDailyBoard = useCallback(async () => {
    if (!isGoogle) {
      setDailyEntries([]);
      return;
    }
    setBoardLoading(true);
    try {
      const entries = await listDailyBoard(gameId, todayKey());
      setDailyEntries(entries);
    } finally {
      setBoardLoading(false);
    }
  }, [gameId, isGoogle]);

  useEffect(() => {
    void refreshDailyBoard();
  }, [refreshDailyBoard]);

  const goArcade = useCallback(() => nav("/games"), [nav]);

  const resetToLobby = useCallback(() => {
    onSessionReset?.();
    startedRef.current = false;
    setStarted(false);
    setPaused(false);
    setResult(null);
    setIsNewBest(false);
    setPlayMode(null);
    setShowPracticePicker(false);
    setPendingDailySubmit(null);
  }, [onSessionReset]);

  const beginRun = useCallback((mode: PlayMode) => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPlayMode(mode);
    setStarted(true);
    setPaused(false);
    setResult(null);
    setIsNewBest(false);
    setShowPracticePicker(false);
  }, []);

  const startDaily = useCallback(() => {
    if (hasPlayedDaily(useStore.getState().data, gameId, todayKey())) return;
    // Starting locks today's attempt (abandon still counts).
    markDailyPlayed(gameId, 0);
    beginRun("daily");
  }, [beginRun, gameId, markDailyPlayed]);

  const startPracticeDirect = useCallback(() => {
    beginRun("practice");
  }, [beginRun]);

  const choosePractice = useCallback(() => {
    if (renderPracticeLobby) {
      setPlayMode("practice");
      setShowPracticePicker(true);
      setResult(null);
      return;
    }
    startPracticeDirect();
  }, [renderPracticeLobby, startPracticeDirect]);

  const postDailyScore = useCallback(
    async (normalized: GameResult) => {
      if (!user || !isGoogle) return;
      const profile = useStore.getState().data.arcadeProfile;
      await submitDailyScore({
        userId: user.id,
        gameId,
        score: normalized.score,
        displayName: arcadeDisplayName(profile),
        meta: resultMeta(normalized),
      });
      await refreshDailyBoard();
    },
    [gameId, isGoogle, refreshDailyBoard, user],
  );

  const finishDaily = useCallback(
    async (normalized: GameResult) => {
      markDailyPlayed(gameId, normalized.score, true);
      setResult(normalized);
      setIsNewBest(false);
      startedRef.current = false;
      setStarted(false);
      setPaused(false);

      if (!user || !isGoogle) {
        void refreshDailyBoard();
        return;
      }

      const profile = useStore.getState().data.arcadeProfile;
      if (!profile?.prompted) {
        setPendingDailySubmit(normalized);
        setProfileOpen(true);
        return;
      }
      await postDailyScore(normalized);
    },
    [gameId, isGoogle, markDailyPlayed, postDailyScore, refreshDailyBoard, user],
  );

  const onGameOver = useCallback(
    (input: number | GameResult) => {
      const normalized = normalizeResult(input);
      const mode = playMode ?? "practice";

      if (mode === "daily") {
        void finishDaily(normalized);
        return;
      }

      const boardKey =
        normalized.leaderboardKey ?? practiceLeaderboardKey ?? gameId;
      setActivePracticeKey(boardKey);

      let newBest = false;
      if (user) {
        newBest = recordGameScore(
          boardKey,
          normalized.score,
          resultMeta(normalized),
        );
      }
      setIsNewBest(newBest);
      setResult(normalized);
      startedRef.current = false;
      setStarted(false);
      setPaused(false);
    },
    [
      finishDaily,
      gameId,
      playMode,
      practiceLeaderboardKey,
      recordGameScore,
      user,
    ],
  );

  const onProfileSaved = useCallback(
    async (choice: { username: string | null; optedOut: boolean }) => {
      setArcadeProfile({
        username: choice.username,
        optedOut: choice.optedOut,
        prompted: true,
      });
      setProfileOpen(false);
      const pending = pendingDailySubmit;
      setPendingDailySubmit(null);
      if (pending) await postDailyScore(pending);
      else void refreshDailyBoard();
    },
    [pendingDailySubmit, postDailyScore, refreshDailyBoard, setArcadeProfile],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (profileOpen) return;
      if (started) {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      goArcade();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, goArcade, profileOpen]);

  const inMainLobby = !started && result === null && !showPracticePicker;
  const resultMode = playMode;

  return (
    <GamePaletteProvider>
      <div className="game-shell flex h-full min-h-0 flex-col">
        <div
          ref={containerRef}
          className="game-stage relative min-h-0 flex-1 overflow-hidden"
        >
          {inMainLobby && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
              <button
                type="button"
                onClick={goArcade}
                className="capsule absolute left-3 top-3 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
                aria-label="Back to arcade"
              >
                <ArrowLeft size={20} />
              </button>
              <p className="game-shell-title font-display text-2xl font-800">
                {meta.name}
              </p>
              <p className="text-sm font-700 text-ink-soft">{meta.tagline}</p>
              <p className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-800 uppercase tracking-wide text-ink-faint">
                {prettyDay(today)} · one attempt
              </p>
              <p className="max-w-xs text-xs font-700 text-ink-faint">{meta.controls}</p>

              {dailyDone && dailyCompletion ? (
                <p className="text-sm font-800 text-ink">
                  Today&apos;s score: {dailyCompletion.score.toLocaleString()}
                </p>
              ) : null}

              {isGoogle ? (
                boardLoading && dailyEntries.length === 0 ? (
                  <p className="text-xs font-700 text-ink-faint">Loading board…</p>
                ) : (
                  <DailyBoardList entries={dailyEntries} highlightUid={googleSub} compact />
                )
              ) : (
                <p className="max-w-xs text-xs font-700 text-ink-faint">
                  Sign in with Google to post and see today&apos;s global board.
                </p>
              )}

              {isGoogle && (
                <button
                  type="button"
                  className="text-[11px] font-800 text-ink-faint underline"
                  onClick={() => setProfileOpen(true)}
                >
                  {data.arcadeProfile?.prompted
                    ? data.arcadeProfile.optedOut
                      ? "Board name: Anonymous"
                      : `Board name: ${data.arcadeProfile.username ?? "Anonymous"}`
                    : "Set board name"}
                </button>
              )}

              <button
                type="button"
                onClick={startDaily}
                disabled={dailyDone}
                className="btn px-8 disabled:opacity-40"
              >
                {dailyDone ? "Daily complete" : "Play today's challenge"}
              </button>
              <button type="button" onClick={choosePractice} className="btn-ghost">
                Practice
              </button>
            </div>
          )}

          {showPracticePicker && renderPracticeLobby && (
            <>
              <button
                type="button"
                onClick={resetToLobby}
                className="capsule absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
              {renderPracticeLobby(startPracticeDirect)}
            </>
          )}

          {result !== null && !started && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8">
              <button
                type="button"
                onClick={goArcade}
                className="capsule absolute left-3 top-3 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
                aria-label="Back to arcade"
              >
                <ArrowLeft size={20} />
              </button>
              {result.title && (
                <p className="text-sm font-700 text-ink-soft">{result.title}</p>
              )}
              {resultMode === "daily" ? (
                <p className="text-sm font-800 text-accent">Daily challenge logged</p>
              ) : isNewBest ? (
                <p className="text-sm font-800 text-accent">New personal best!</p>
              ) : null}
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

              {resultMode === "daily" ? (
                isGoogle ? (
                  <DailyBoardList
                    entries={dailyEntries}
                    highlightUid={googleSub}
                    compact
                  />
                ) : (
                  <p className="text-xs font-700 text-ink-faint">
                    Sign in with Google to appear on today&apos;s board.
                  </p>
                )
              ) : user ? (
                <GameLeaderboardList
                  entries={practiceEntries}
                  highlightScore={result.score}
                  compact
                />
              ) : (
                <p className="text-xs font-700 text-ink-faint">
                  Sign in to save scores to your practice board.
                </p>
              )}

              {resultMode === "daily" ? (
                <>
                  <button type="button" onClick={choosePractice} className="btn">
                    Practice
                  </button>
                  <button type="button" onClick={resetToLobby} className="btn-ghost">
                    Back to lobby
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onSessionReset?.();
                      setResult(null);
                      setIsNewBest(false);
                      if (renderPracticeLobby) {
                        setShowPracticePicker(true);
                        setPlayMode("practice");
                        startedRef.current = false;
                        setStarted(false);
                      } else {
                        beginRun("practice");
                      }
                    }}
                    className="btn"
                  >
                    Play again
                  </button>
                  <button type="button" onClick={resetToLobby} className="btn-ghost">
                    Back to lobby
                  </button>
                </>
              )}
              <button type="button" onClick={goArcade} className="btn-ghost">
                Back to arcade
              </button>
            </div>
          )}

          {started && size.width > 0 && playMode && (
            <>
              {children({
                ...size,
                onGameOver,
                paused,
                playMode,
                seed: playMode === "daily" ? daySeed : undefined,
              })}

              {!paused && (
                <button
                  type="button"
                  onClick={() => setPaused(true)}
                  className="capsule absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center text-ink-soft shadow-sm active:scale-95"
                  aria-label="Pause"
                >
                  <Pause size={20} />
                </button>
              )}

              {paused && (
                <div className="game-overlay absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="game-shell-title font-display text-2xl font-800">
                    Paused
                  </p>
                  <p className="game-shell-title font-display text-lg font-800">
                    {meta.name}
                    {playMode === "daily" ? " · Daily" : " · Practice"}
                  </p>
                  <p className="max-w-sm text-sm font-700 text-ink-soft">
                    {meta.controls}
                  </p>
                  <button
                    type="button"
                    className="btn px-8"
                    onClick={() => setPaused(false)}
                  >
                    Resume
                  </button>
                  <button type="button" className="btn-ghost" onClick={goArcade}>
                    Back to arcade
                  </button>
                </div>
              )}
            </>
          )}

          {profileOpen && (
            <ArcadeUsernameModal
              initialUsername={data.arcadeProfile?.username ?? user?.name ?? ""}
              onSave={(choice) => {
                void onProfileSaved(choice);
              }}
            />
          )}
        </div>
      </div>
    </GamePaletteProvider>
  );
}
