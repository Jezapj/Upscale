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
import { MedalStars } from "@/components/GameStatDetail";
import { ArcadeUsernameModal } from "@/components/ArcadeUsernameModal";
import { OrientationHint } from "@/components/OrientationHint";
import { useScreenOrientation } from "@/hooks/useScreenOrientation";
import { gamePlayOrientation } from "@/lib/gameOrientation";
import {
  arcadeDisplayName,
  dailySeed,
  DAILY_DAYBREAK_ATTEMPTS,
  getDailyCompletion,
  hasPlayedDaily,
} from "@/lib/dailyChallenge";
import {
  listDailyBoard,
  submitDailyScore,
  hasUserDailyBoardEntry,
  type DailyBoardEntry,
} from "@/lib/dailyLeaderboard";
import { withDailyBots } from "@/lib/dailyBots";
import { ArcadeResultScreen } from "@/components/ArcadeResultScreen";
import { googleSubFromUserId } from "@/lib/cloudSync";
import { cloudConfigured } from "@/lib/firebase";
import { activeFirestoreUid } from "@/lib/firebaseAuth";
import { ProSubscriptionSheet } from "@/components/ProSubscriptionSheet";
import { PRO_PRICE_LABEL } from "@/lib/games";
import { prettyDay, todayKey } from "@/lib/dates";
import {
  TOKEN_COST_CONTINUE,
  TOKEN_COST_ENDLESS,
  canAfford,
  tokenBalance,
} from "@/lib/economy";

export type PlayMode = "daily" | "practice";

interface Props {
  gameId: GameId;
  children: (api: {
    width: number;
    height: number;
    onGameOver: (result: number | GameResult) => void;
    /** True while the shell pause menu is open: freeze the game loop. */
    paused: boolean;
    playMode: PlayMode;
    /** Set for daily runs (and optional practice seeds). */
    seed?: number;
    /** TipTop ghost flap trace to race against. */
    ghostTrace?: number[];
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
  const [boardError, setBoardError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingDailySubmit, setPendingDailySubmit] = useState<GameResult | null>(
    null,
  );
  const [remoteDailyLocked, setRemoteDailyLocked] = useState(false);
  const [proOpen, setProOpen] = useState(false);

  const today = useStore((s) => s.today);
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const recordGameScore = useStore((s) => s.recordGameScore);
  const markDailyPlayed = useStore((s) => s.markDailyPlayed);
  const setArcadeProfile = useStore((s) => s.setArcadeProfile);
  const consumePlay = useStore((s) => s.consumePlay);
  const buyContinue = useStore((s) => s.buyContinue);
  const endlessLeft = useStore((s) => s.endlessPlaysLeft());
  const isPro = data.gamePremium === true;
  const balance = tokenBalance(data.wallet);
  const dailyContinued =
    data.arcadeDaily?.date === today &&
    !!data.arcadeDaily.completed[gameId]?.continued;
  const [raceGhost, setRaceGhost] = useState(false);
  const [ghostTrace, setGhostTrace] = useState<number[] | undefined>(undefined);

  const dailyDone =
    hasPlayedDaily(data, gameId, today) || remoteDailyLocked;
  const dailyCompletion = getDailyCompletion(data, gameId, today);
  const googleSub = user ? googleSubFromUserId(user.id) : null;
  const isGoogle = !!googleSub;
  const boardUid = activeFirestoreUid() ?? googleSub;
  const daySeed = dailySeed(gameId, today);
  const practiceEntries = useStore((s) =>
    getGameScores(s.data, activePracticeKey),
  );

  const refreshDailyBoard = useCallback(async () => {
    const day = todayKey();
    if (!isGoogle) {
      setDailyEntries(withDailyBots([], gameId, day));
      setBoardError(null);
      return;
    }
    if (!cloudConfigured()) {
      setDailyEntries(withDailyBots([], gameId, day));
      setBoardError("Firebase is not configured (missing VITE_FIREBASE_* in .env).");
      return;
    }
    setBoardLoading(true);
    setBoardError(null);
    try {
      const entries = await listDailyBoard(gameId, day);
      setDailyEntries(withDailyBots(entries, gameId, day));
    } catch {
      setBoardError(
        "Could not load today's board. Deploy firestore.rules and check the browser console.",
      );
      setDailyEntries(withDailyBots([], gameId, day));
    } finally {
      setBoardLoading(false);
    }
  }, [gameId, isGoogle]);

  useEffect(() => {
    void refreshDailyBoard();
  }, [refreshDailyBoard]);

  useEffect(() => {
    if (!boardUid) return;
    const mine = dailyEntries.find((e) => e.uid === boardUid);
    if (!mine) return;
    const local = getDailyCompletion(useStore.getState().data, gameId, today);
    if (local && local.score > 0 && local.score >= mine.score) return;
    markDailyPlayed(gameId, mine.score, true, {
      ghostTrace: mine.meta?.ghostTrace
        ? mine.meta.ghostTrace
            .split(",")
            .map(Number)
            .filter((n) => Number.isFinite(n))
        : undefined,
    });
  }, [dailyEntries, boardUid, gameId, today, markDailyPlayed]);

  useEffect(() => {
    if (!user || !isGoogle) {
      setRemoteDailyLocked(false);
      return;
    }
    let cancelled = false;
    void hasUserDailyBoardEntry(user.id, gameId, today).then((locked) => {
      if (!cancelled) setRemoteDailyLocked(locked);
    });
    return () => {
      cancelled = true;
    };
  }, [user, isGoogle, gameId, today]);

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
    setRaceGhost(false);
    setGhostTrace(undefined);
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

  const startDaily = useCallback(async () => {
    if (user && isGoogle) {
      const locked = await hasUserDailyBoardEntry(user.id, gameId, todayKey());
      if (locked) {
        setRemoteDailyLocked(true);
        return;
      }
    }
    if (hasPlayedDaily(useStore.getState().data, gameId, todayKey())) return;
    markDailyPlayed(gameId, 0);
    beginRun("daily");
  }, [beginRun, gameId, isGoogle, markDailyPlayed, user]);

  const startEndlessDirect = useCallback(() => {
    if (!isPro && endlessLeft <= 0) {
      return;
    }
    if (!consumePlay(gameId)) {
      return;
    }
    beginRun("practice");
  }, [beginRun, consumePlay, endlessLeft, gameId, isPro]);

  const chooseEndless = useCallback(() => {
    if (renderPracticeLobby) {
      if (!isPro && endlessLeft <= 0) {
        return;
      }
      setPlayMode("practice");
      setShowPracticePicker(true);
      setResult(null);
      return;
    }
    startEndlessDirect();
  }, [endlessLeft, isPro, renderPracticeLobby, startEndlessDirect]);

  const tryContinue = useCallback(() => {
    if (dailyContinued) return;
    if (!canAfford(data, TOKEN_COST_CONTINUE)) {
      return;
    }
    if (!buyContinue(gameId)) {
      return;
    }
    setResult(null);
    beginRun("daily");
  }, [beginRun, buyContinue, dailyContinued, data, gameId]);

  const postDailyScore = useCallback(
    async (normalized: GameResult) => {
      if (!user || !isGoogle) return;
      const profile = useStore.getState().data.arcadeProfile;
      const meta: Record<string, string> = {
        ...(resultMeta(normalized) ?? {}),
      };
      if (normalized.ghostTrace?.length) {
        const encoded = normalized.ghostTrace.join(",");
        if (encoded.length < 40_000) meta.ghostTrace = encoded;
      }
      await submitDailyScore({
        userId: user.id,
        gameId,
        score: normalized.score,
        displayName: arcadeDisplayName(profile),
        meta: Object.keys(meta).length ? meta : undefined,
      });
      await refreshDailyBoard();
    },
    [gameId, isGoogle, refreshDailyBoard, user],
  );

  const finishDaily = useCallback(
    async (normalized: GameResult) => {
      markDailyPlayed(gameId, normalized.score, true, {
        ghostTrace: normalized.ghostTrace,
      });
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
      setRemoteDailyLocked(true);
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
  const playOrientation = gamePlayOrientation(gameId);
  const orientationLock =
    started && playOrientation === "landscape"
      ? "landscape"
      : started && playOrientation === "any"
        ? "none"
        : "portrait-primary";
  useScreenOrientation(orientationLock);

  return (
    <GamePaletteProvider gameId={gameId}>
      <div className="game-shell flex h-full min-h-0 flex-col">
        <div
          ref={containerRef}
          className="game-stage relative min-h-0 flex-1 overflow-hidden"
        >
          {inMainLobby && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col overflow-y-auto px-6 py-8 text-center landscape:px-16 landscape:py-3">
              <button
                type="button"
                onClick={goArcade}
                className="capsule absolute left-3 top-3 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
                aria-label="Back to arcade"
              >
                <ArrowLeft size={20} />
              </button>

              <div className="m-auto flex flex-col items-center gap-3 landscape:flex-row landscape:items-center landscape:gap-8">
              {/* Left column: title, cues, play buttons. */}
              <div className="flex flex-col items-center gap-3 landscape:max-w-xs landscape:gap-1.5">
                <p className="game-shell-title font-display text-2xl font-800 landscape:text-xl">
                  {meta.name}
                </p>
                <p className="text-sm font-700 text-ink-soft landscape:hidden">
                  {meta.tagline}
                </p>
                <div className="landscape:hidden">
                  <OrientationHint gameId={gameId} />
                </div>
                <p className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-800 uppercase tracking-wide text-ink-faint">
                  {prettyDay(today)} · one attempt
                  {gameId === "daybreak" ? ` · ${DAILY_DAYBREAK_ATTEMPTS} lives` : ""}
                </p>
                <p className="max-w-xs text-xs font-700 text-ink-faint">{meta.controls}</p>

                {dailyDone && dailyCompletion ? (
                  <p className="text-sm font-800 text-ink">
                    Today&apos;s score: {dailyCompletion.score.toLocaleString()}
                  </p>
                ) : null}

                {gameId === "tiptop" && dailyCompletion?.ghostTrace?.length ? (
                  <label className="flex items-center gap-2 text-xs font-700 text-ink-soft">
                    <input
                      type="checkbox"
                      checked={raceGhost}
                      onChange={(e) => {
                        setRaceGhost(e.target.checked);
                        setGhostTrace(
                          e.target.checked ? dailyCompletion.ghostTrace : undefined,
                        );
                      }}
                    />
                    Race today&apos;s ghost (practice only after daily)
                  </label>
                ) : null}

                {gameId === "tiptop" && !dailyDone && (() => {
                  const last = data.lastGhosts?.tiptop;
                  const boardGhost = dailyEntries.find((e) => e.meta?.ghostTrace);
                  const trace = last?.trace?.length
                    ? last.trace
                    : boardGhost?.meta?.ghostTrace
                      ? boardGhost.meta.ghostTrace
                          .split(",")
                          .map(Number)
                          .filter((n) => Number.isFinite(n))
                      : undefined;
                  if (!trace?.length) return null;
                  const label = last?.trace?.length
                    ? `Race your ${last.day} ghost`
                    : "Race a board ghost";
                  return (
                    <label className="flex items-center gap-2 text-xs font-700 text-ink-soft">
                      <input
                        type="checkbox"
                        checked={raceGhost}
                        onChange={(e) => {
                          setRaceGhost(e.target.checked);
                          setGhostTrace(e.target.checked ? trace : undefined);
                        }}
                      />
                      {label}
                    </label>
                  );
                })()}

                <button
                  type="button"
                  onClick={startDaily}
                  disabled={dailyDone}
                  className="btn px-8 disabled:opacity-40"
                >
                  {dailyDone ? "Daily complete" : "Play today's challenge"}
                </button>
                {isPro ? (
                  <p className="text-xs font-700 text-accent">Pro · unlimited Endless</p>
                ) : (
                  <p className="text-xs font-700 text-ink-faint">
                    Endless: {TOKEN_COST_ENDLESS} token per run · {balance} tokens
                  </p>
                )}
                <button
                  type="button"
                  onClick={chooseEndless}
                  disabled={!isPro && endlessLeft <= 0}
                  className="btn-ghost disabled:opacity-40"
                >
                  Endless
                </button>
                {!isPro && endlessLeft <= 0 && (
                  <div className="flex flex-col items-center gap-2">
                    <p className="max-w-xs text-xs font-700 text-ink-soft">
                      Complete a routine to earn a token, then come back to play.
                    </p>
                    <button
                      type="button"
                      onClick={() => nav("/checkin")}
                      className="btn px-6"
                    >
                      Go to check-in
                    </button>
                    <button
                      type="button"
                      onClick={() => setProOpen(true)}
                      className="text-xs font-800 text-cat-project underline"
                    >
                      Or get Pro for unlimited Endless · {PRO_PRICE_LABEL}
                    </button>
                  </div>
                )}
              </div>

              {/* Right column: today's board. */}
              <div className="flex w-full max-w-sm flex-col items-center gap-3 landscape:min-h-0 landscape:gap-1.5">
                {boardLoading && dailyEntries.length === 0 && !boardError ? (
                  <p className="text-xs font-700 text-ink-faint">Loading board…</p>
                ) : (
                  <>
                    {boardError ? (
                      <p className="max-w-xs text-xs font-700 text-cat-health">
                        {boardError}
                      </p>
                    ) : null}
                    <DailyBoardList
                      entries={dailyEntries}
                      gameId={gameId}
                      highlightUid={boardUid}
                      compact
                    />
                    {!isGoogle && (
                      <p className="max-w-xs text-xs font-700 text-ink-faint">
                        Sign in with Google to post your score to today&apos;s board.
                      </p>
                    )}
                  </>
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
              </div>
              </div>
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
              {renderPracticeLobby(startEndlessDirect)}
            </>
          )}

          {result !== null && !started && (
            <div className="game-overlay absolute inset-0 z-10 flex flex-col overflow-y-auto px-6 py-8">
              <button
                type="button"
                onClick={goArcade}
                className="capsule absolute left-3 top-3 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
                aria-label="Back to arcade"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3">
              {resultMode === "daily" ? (
                <>
                  {result.title && (
                    <p className="text-sm font-700 text-ink-soft">{result.title}</p>
                  )}
                  <ArcadeResultScreen
                    gameId={gameId}
                    day={today}
                    score={result.score}
                    entries={dailyEntries}
                    youUid={boardUid}
                    meta={resultMeta(result)}
                  />
                  {!isGoogle && (
                    <p className="text-xs font-700 text-ink-faint">
                      Sign in with Google to post your score to the global board.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {result.title && (
                    <p className="text-sm font-700 text-ink-soft">{result.title}</p>
                  )}
                  {isNewBest ? (
                    <p className="text-sm font-800 text-accent">New personal best!</p>
                  ) : null}
                  <p className="game-shell-title font-display text-2xl font-800">
                    Score: {result.score.toLocaleString()}
                  </p>
                  {result.stats && result.stats.length > 0 && (
                    <div className="flex flex-col items-center gap-1 text-center">
                      {result.stats.map((stat) =>
                        stat.label === "Medals" ? (
                          <span key={stat.label} className="flex items-center gap-1">
                            <MedalStars value={stat.value} className="scale-125" />
                          </span>
                        ) : (
                          <p key={stat.label} className="text-sm font-700 text-ink-soft">
                            {stat.label}: <span className="text-ink">{stat.value}</span>
                          </p>
                        ),
                      )}
                    </div>
                  )}
                  {user ? (
                    <GameLeaderboardList
                      entries={practiceEntries}
                      gameId={gameId}
                      highlightScore={result.score}
                      compact
                    />
                  ) : (
                    <p className="text-xs font-700 text-ink-faint">
                      Sign in to save scores to your Endless board.
                    </p>
                  )}
                </>
              )}

              {resultMode === "daily" ? (
                <>
                  {!dailyContinued && (
                    <button
                      type="button"
                      onClick={tryContinue}
                      disabled={!canAfford(data, TOKEN_COST_CONTINUE)}
                      className="btn disabled:opacity-40"
                    >
                      Continue · {TOKEN_COST_CONTINUE} tokens
                    </button>
                  )}
                  {!canAfford(data, TOKEN_COST_CONTINUE) && !dailyContinued && (
                    <button
                      type="button"
                      onClick={() => nav("/checkin")}
                      className="text-xs font-800 text-ink-soft underline"
                    >
                      Earn tokens at check-in
                    </button>
                  )}
                  <button type="button" onClick={chooseEndless} className="btn-ghost">
                    Endless
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
                      if (!isPro && endlessLeft <= 0) {
                        return;
                      }
                      if (!consumePlay(gameId)) {
                        return;
                      }
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
                  {!isPro && endlessLeft <= 0 && (
                    <button
                      type="button"
                      onClick={() => nav("/checkin")}
                      className="text-xs font-800 text-ink-soft underline"
                    >
                      Complete a routine to earn a token
                    </button>
                  )}
                  <button type="button" onClick={resetToLobby} className="btn-ghost">
                    Back to lobby
                  </button>
                </>
              )}
              <button type="button" onClick={goArcade} className="btn-ghost">
                Back to arcade
              </button>
              </div>
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
                ghostTrace:
                  gameId === "tiptop" && raceGhost ? ghostTrace : undefined,
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
                    {playMode === "daily" ? " · Daily" : " · Endless"}
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

          <ProSubscriptionSheet open={proOpen} onClose={() => setProOpen(false)} />
        </div>
      </div>
    </GamePaletteProvider>
  );
}
