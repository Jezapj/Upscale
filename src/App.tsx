import { useEffect } from "react";
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
import { useKeyboardControls } from "@/hooks/useKeyboardControls";
import { ThemeSyncEffect } from "@/store/useTheme";
import { LoginScreen } from "@/screens/LoginScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { CheckinScreen } from "@/screens/CheckinScreen";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { LibraryScreen } from "@/screens/LibraryScreen";
import { GamesScreen } from "@/screens/GamesScreen";
import { TipTopScreen } from "@/screens/games/TipTopScreen";
import { OctaneScreen } from "@/screens/games/OctaneScreen";
import { DissiadaScreen } from "@/screens/games/DissiadaScreen";
import { ProgressScreen } from "@/screens/ProgressScreen";

function AppShell() {
  const location = useLocation();
  const refreshToday = useStore((s) => s.refreshToday);

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

  // Full-screen flows: check-in and active game sessions (no dock).
  const isCheckin = location.pathname.startsWith("/checkin");
  const isPlayingGame = /^\/games\/[^/]+/.test(location.pathname);
  const hideChrome = isCheckin || isPlayingGame;

  useKeyboardControls();

  return (
    <div id="app-shell" className="app-shell">
      <ThemeSyncEffect />
      <BackgroundDecor />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/checkin" element={<CheckinScreen />} />
          <Route path="/goals" element={<GoalsScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/games" element={<GamesScreen />} />
          <Route path="/games/tiptop" element={<TipTopScreen />} />
          <Route path="/games/octane" element={<OctaneScreen />} />
          <Route path="/games/dissiada" element={<DissiadaScreen />} />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <QuickMenu />
      {!hideChrome && (
        <div className="relative z-30">
          <ScreenHints />
        </div>
      )}
      {!hideChrome && <Dock />}
    </div>
  );
}

function Loading() {
  return (
    <div className="app-shell items-center justify-center">
      <BackgroundDecor />
      <div className="relative z-10 animate-pop-in font-display text-2xl font-800 text-ink-soft">
        Upscale…
      </div>
    </div>
  );
}

export default function App() {
  const { ready, user, init } = useStore();

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return <Loading />;
  if (!user) return <LoginScreen />;

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
