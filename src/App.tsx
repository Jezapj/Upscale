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

  // The check-in flow is a focused, full-screen experience (no dock).
  const isCheckin = location.pathname.startsWith("/checkin");

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
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <QuickMenu />
      {!isCheckin && (
        <div className="relative z-30">
          <ScreenHints />
        </div>
      )}
      {!isCheckin && <Dock />}
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
