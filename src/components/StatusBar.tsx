import { useEffect, useState } from "react";
import { BatteryFull, Clock3, Volume2, VolumeX } from "lucide-react";
import { prettyTime } from "@/lib/dates";
import { useStore } from "@/store/useStore";
import { useControls } from "@/store/useControls";
import { useMasterMute } from "@/store/useMasterMute";
import { SettingsSheet } from "./SettingsSheet";

/** Top IISU console chrome: avatar cluster + LT/RT shoulder pills and a
 *  clock · battery status capsule. */
export function StatusBar() {
  const user = useStore((s) => s.user);
  const settingsOpen = useControls((s) => s.settingsOpen);
  const setSettingsOpen = useControls((s) => s.setSettingsOpen);
  const muted = useMasterMute((s) => s.muted);
  const toggleMuted = useMasterMute((s) => s.toggleMuted);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const initial = (user?.name ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3 no-select">
      <button
        data-tour="settings"
        onClick={() => setSettingsOpen(true)}
        className="relative flex shrink-0 items-center active:scale-95"
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

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-sfx-skip
          data-tour="mute"
          onClick={toggleMuted}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center active:scale-95"
          aria-pressed={muted}
          aria-label={muted ? "Unmute all sound" : "Mute all sound"}
          title={muted ? "Unmute (hold R + T)" : "Mute (hold R + T)"}
        >
          <span className="capsule absolute -left-1 -top-1.5 z-20 px-1.5 py-0 text-[9px] font-900 leading-none text-ink-faint">
            RT
          </span>
          <span
            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-ink-soft shadow-soft"
            style={{
              background: muted
                ? "linear-gradient(160deg,#d4d7de,#b8bcc6)"
                : "linear-gradient(160deg,#f4f6f9,#dfe3ea)",
            }}
          >
            {muted ? <VolumeX size={14} strokeWidth={2.4} /> : <Volume2 size={14} strokeWidth={2.4} />}
          </span>
        </button>
        <div className="capsule flex min-w-0 items-center gap-1 px-2.5 py-1 text-[11px] font-800 text-ink-soft sm:gap-1.5 sm:px-3 sm:text-xs">
          <Clock3 size={13} className="shrink-0 text-ink-faint" />
          <span className="tabular-nums">{prettyTime(now)}</span>
          <span className="text-ink-faint">·</span>
          <BatteryFull size={16} className="shrink-0 text-mint-deep" />
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
