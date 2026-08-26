import { useEffect, useMemo, useState } from "react";
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
import { TokenEarnToast } from "@/components/TokenEarnToast";
import { WeeklyRecapSheet } from "@/components/WeeklyRecapSheet";
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
import { TipTopScreen } from "@/screens/games/TipTopScreen";
import { OctaneScreen } from "@/screens/games/OctaneScreen";
import { DissiadaScreen } from "@/screens/games/DissiadaScreen";
import { DaybreakScreen } from "@/screens/games/DaybreakScreen";
import { ProgressScreen } from "@/screens/ProgressScreen";
import { LoadingScreen } from "@/components/LoadingScreen";
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

function AppShell() {
  const location = useLocation();
  const refreshToday = useStore((s) => s.refreshToday);
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const setLastRecapWeek = useStore((s) => s.setLastRecapWeek);
  const startTour = useWalkthrough((s) => s.start);
  const [recapOpen, setRecapOpen] = useState(false);
  const [kudosNote, setKudosNote] = useState<string | null>(null);

  const recap = useMemo(() => buildWeeklyRecap(data), [data]);

  // Roll the day over when the app regains focus (e.g. opened next morning).
  useEffect(() => {
    const onFocus = () => refreshToday();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshToday]);

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

  // Weekly recap offer once per new week.
  useEffect(() => {
    if (shouldOfferRecap(data)) setRecapOpen(true);
  }, [data.lastRecapWeek, data.routines.length]);

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
    });
  }, [user, data.syncedAt]);

  const isCheckin = location.pathname.startsWith("/checkin");
  const isPlayingGame = /^\/games\/[^/]+/.test(location.pathname);
  const hideChrome = isCheckin || isPlayingGame;

  useKeyboardControls();
  useRoutineReminders();

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
      <BackgroundDecor />
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
          <Route path="/games/tiptop" element={<TipTopScreen />} />
          <Route path="/games/octane" element={<OctaneScreen />} />
          <Route path="/games/dissiada" element={<DissiadaScreen />} />
          <Route path="/games/daybreak" element={<DaybreakScreen />} />
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
