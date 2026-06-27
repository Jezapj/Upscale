import { useEffect, useState } from "react";
import { BatteryFull, Clock3 } from "lucide-react";
import { prettyTime } from "@/lib/dates";
import { useStore } from "@/store/useStore";
import { useControls } from "@/store/useControls";
import { SettingsSheet } from "./SettingsSheet";

/** Top IISU console chrome: avatar cluster + LT/RT shoulder pills and a
 *  clock · battery status capsule. */
export function StatusBar() {
  const user = useStore((s) => s.user);
  const settingsOpen = useControls((s) => s.settingsOpen);
  const setSettingsOpen = useControls((s) => s.setSettingsOpen);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const initial = (user?.name ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-3 no-select">
      <button
        onClick={() => setSettingsOpen(true)}
        className="relative flex items-center active:scale-95"
        title="Settings (hold L + T)"
      >
        <span className="capsule absolute -left-1 -top-2 z-20 px-1.5 py-0 text-[9px] font-900 text-ink-faint">
          LT
        </span>
        <span className="absolute left-7 z-0 h-8 w-8 rounded-full border-2 border-white bg-[#cfe0ff] shadow-soft" />
        <span className="absolute left-[3.4rem] z-0 h-8 w-8 rounded-full border-2 border-white bg-[#ffd6e6] shadow-soft" />
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="relative z-10 h-10 w-10 rounded-full border-2 border-white object-cover shadow-soft"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-sm font-900 text-white shadow-soft"
            style={{ background: "linear-gradient(160deg,#74c0ff,#3a8ef0)" }}
          >
            {initial}
          </span>
        )}
      </button>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="flex items-center gap-2">
        <span className="capsule px-1.5 py-0 text-[9px] font-900 text-ink-faint">
          RT
        </span>
        <div className="capsule flex items-center gap-1.5 px-3 py-1 text-xs font-800 text-ink-soft">
          <Clock3 size={13} className="text-ink-faint" />
          <span>{prettyTime(now)}</span>
          <span className="text-ink-faint">·</span>
          <BatteryFull size={16} className="text-mint-deep" />
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
