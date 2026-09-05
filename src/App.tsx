import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useStore } from "@/store/useStore";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { Dock } from "@/components/Dock";
import { ScreenHints } from "@/components/ScreenHints";
import { QuickMenu } from "@/components/QuickMenu";
import { BackgroundMusicPlayer } from "@/components/BackgroundMusicPlayer";
import { UiTapSound } from "@/components/UiTapSound";
import { TokenEarnToast } from "@/components/TokenEarnToast";
import { WeeklyRecapSheet } from "@/components/WeeklyRecapSheet";
import { LoginBonusSheet } from "@/components/LoginBonusSheet";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { useRoutineReminders } from "@/hooks/useRoutineReminders";
import { ThemeSyncEffect } from "@/store/useTheme";
import { useWalkthrough, walkthroughSeen } from "@/store/useWalkthrough";
import { Walkthrough } from "@/components/Walkthrough";
import { LoginScreen } from "@/screens/LoginScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { CheckinScreen } from "@/screens/CheckinScreen";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { LibraryScreen } from "@/screens/LibraryScreen";
import { NotesScreen } from "@/screens/NotesScreen";
import { GamesScreen } from "@/screens/GamesScreen";
import { FriendsScreen } from "@/screens/FriendsScreen";
import { ProgressScreen } from "@/screens/ProgressScreen";
import { LoadingScreen } from "@/components/LoadingScreen";

const TipTopScreen = lazy(() =>
  import("@/screens/games/TipTopScreen").then((m) => ({ default: m.TipTopScreen })),
);
const OctaneScreen = lazy(() =>
  import("@/screens/games/OctaneScreen").then((m) => ({ default: m.OctaneScreen })),
);
const DissiadaScreen = lazy(() =>
  import("@/screens/games/DissiadaScreen").then((m) => ({ default: m.DissiadaScreen })),
);
const DaybreakScreen = lazy(() =>
  import("@/screens/games/DaybreakScreen").then((m) => ({ default: m.DaybreakScreen })),
);
const SpacewalkScreen = lazy(() =>
  import("@/screens/games/SpacewalkScreen").then((m) => ({ default: m.SpacewalkScreen })),
);
const AccretionScreen = lazy(() =>
  import("@/screens/games/AccretionScreen").then((m) => ({ default: m.AccretionScreen })),
);

function GameRouteFallback() {
  return (
    <div
      className="flex flex-1 items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading game"
    >
      <img
        src="/Upscale.png"
        alt=""
        width={80}
        height={80}
        draggable={false}
        className="loading-logo"
      />
    </div>
  );
}
import { useScreenOrientation } from "@/hooks/useScreenOrientation";
import { setAppBadgeCount } from "@/lib/appBadge";
import { isDueToday } from "@/lib/frequency";
import { todayKey } from "@/lib/dates";
import {
  buildWeeklyRecap,
  shouldOfferRecap,
} from "@/lib/weeklyRecap";
import { listKudosForDay, publishPublicStats } from "@/lib/social";
import { isCloudUser } from "@/lib/cloudSync";
import { cloudConfigured } from "@/lib/firebase";
import { playUiChime } from "@/lib/uiSound";
import { setAppAudioMuted } from "@/games/gameAudio";
import { useMasterMute } from "@/store/useMasterMute";
import { loginTxnId } from "@/lib/economy";

function AppShell() {
  const location = useLocation();
  const refreshToday = useStore((s) => s.refreshToday);
  const pullFromCloud = useStore((s) => s.pullFromCloud);
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const setLastRecapWeek = useStore((s) => s.setLastRecapWeek);
  const loginBonusOpen = useStore((s) => s.loginBonusOpen);
  const openLoginBonus = useStore((s) => s.openLoginBonus);
  const closeLoginBonus = useStore((s) => s.closeLoginBonus);
  const startTour = useWalkthrough((s) => s.start);
  const walkthroughActive = useWalkthrough((s) => s.active);
  const [recapOpen, setRecapOpen] = useState(false);
  const [kudosNote, setKudosNote] = useState<string | null>(null);

  const recap = useMemo(() => buildWeeklyRecap(data), [data]);

  // Roll the day over when the app regains focus, and pull the latest cloud backup
  // so tokens / notes / palettes / daily plays catch up across devices.
  useEffect(() => {
    const onFocus = () => {
      refreshToday();
      if (document.visibilityState === "hidden") return;
      const playing = /^\/games\/[^/]+/.test(window.location.pathname);
      if (!playing) void pullFromCloud();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshToday, pullFromCloud]);

  // App badge: due routine count.
  useEffect(() => {
    const key = todayKey();
    const due = data.routines.filter((r) => isDueToday(r, key, data)).length;
    setAppBadgeCount(due);
    const onVis = () => {
      const k = todayKey();
      setAppBadgeCount(
        useStore.getState().data.routines.filter((r) =>
          isDueToday(r, k, useStore.getState().data),
        ).length,
      );
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [data]);

  // Weekly recap offer once per new week (after walkthrough and daily login bonus).
  const walkthroughSeenFlag = walkthroughSeen();
  const loginBonusShown = data.loginBonus?.lastPopupDate === todayKey();
  const loginBonusClaimed = (data.wallet?.txns ?? []).some(
    (t) => t.id === loginTxnId(todayKey()),
  );
  const shouldShowRecap = walkthroughSeenFlag && (loginBonusShown || loginBonusClaimed);

  useEffect(() => {
    if (shouldShowRecap && shouldOfferRecap(data)) setRecapOpen(true);
  }, [data.lastRecapWeek, data.routines.length, shouldShowRecap]);

  // Publish public stats + load kudos for Google users.
  useEffect(() => {
    if (!user || !isCloudUser(user.id) || !cloudConfigured()) return;
    void publishPublicStats(user.id, data, user.name);
    void listKudosForDay(user.id).then((entries) => {
      if (entries.length === 0) return;
      const names = entries.map((e) => e.fromName).join(", ");
      setKudosNote(
        entries.length === 1
          ? `${names} sent kudos!`
          : `${names} sent kudos!`,
      );
      playUiChime("info");
    });
  }, [user, data.syncedAt]);

  const isCheckin = location.pathname.startsWith("/checkin");
  const isPlayingGame = /^\/games\/[^/]+/.test(location.pathname);
  const hideChrome = isCheckin || isPlayingGame;

  // Daily login bonus once per calendar day (skipped during games / recap / tour).
  useEffect(() => {
    if (loginBonusOpen || recapOpen || walkthroughActive) return;
    if (!walkthroughSeen()) return;
    if (isPlayingGame || isCheckin) return;
    if (data.loginBonus?.lastPopupDate === todayKey()) return;
    const claimed = (data.wallet?.txns ?? []).some(
      (t) => t.id === loginTxnId(todayKey()),
    );
    if (claimed) return;
    openLoginBonus();
  }, [
    data.loginBonus?.lastPopupDate,
    data.wallet,
    data.syncedAt,
    loginBonusOpen,
    recapOpen,
    walkthroughActive,
    isPlayingGame,
    isCheckin,
    openLoginBonus,
  ]);

  useKeyboardControls();
  useRoutineReminders();

  const masterMuted = useMasterMute((s) => s.muted);
  useEffect(() => {
    setAppAudioMuted(masterMuted);
  }, [masterMuted]);

  useEffect(() => {
    if (location.pathname !== "/") return;
    if (walkthroughSeen()) return;
    const id = window.setTimeout(() => startTour(), 400);
    return () => window.clearTimeout(id);
  }, [location.pathname, startTour]);

  return (
    <div id="app-shell" className="app-shell">
      <ThemeSyncEffect />
      <BackgroundMusicPlayer />
      <UiTapSound />
      <BackgroundDecor paused={isPlayingGame} />
      <TokenEarnToast />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {kudosNote && location.pathname === "/" && (
          <div className="px-4 pt-2">
            <div className="capsule px-3 py-2 text-center text-xs font-800 text-ink">
              {kudosNote}
            </div>
          </div>
        )}
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/checkin" element={<CheckinScreen />} />
          <Route path="/goals" element={<GoalsScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/games" element={<GamesScreen />} />
          <Route path="/friends" element={<FriendsScreen />} />
          <Route
            path="/games/tiptop"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <TipTopScreen />
              </Suspense>
            }
          />
          <Route
            path="/games/octane"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <OctaneScreen />
              </Suspense>
            }
          />
          <Route
            path="/games/dissiada"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <DissiadaScreen />
              </Suspense>
            }
          />
          <Route
            path="/games/daybreak"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <DaybreakScreen />
              </Suspense>
            }
          />
          <Route
            path="/games/spacewalk"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <SpacewalkScreen />
              </Suspense>
            }
          />
          <Route
            path="/games/accretion"
            element={
              <Suspense fallback={<GameRouteFallback />}>
                <AccretionScreen />
              </Suspense>
            }
          />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <QuickMenu />
      <Walkthrough />
      <WeeklyRecapSheet
        open={recapOpen}
        onClose={() => {
          setLastRecapWeek(recap.weekKey);
          setRecapOpen(false);
        }}
        recap={recap}
      />
      <LoginBonusSheet open={loginBonusOpen} onClose={closeLoginBonus} />
      {!hideChrome && (
        <div className="relative z-30">
          <ScreenHints />
        </div>
      )}
      {!hideChrome && <Dock />}
    </div>
  );
}

export default function App() {
  const { ready, user, signingIn, init } = useStore();
  useScreenOrientation("portrait-primary");

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready || signingIn) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
