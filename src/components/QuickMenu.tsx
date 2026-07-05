import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Moon, Music, Sun, X } from "lucide-react";
import { useControls } from "@/store/useControls";
import { useBackgroundMusic, useBackgroundTrack } from "@/store/useBackgroundMusic";
import { useTheme } from "@/store/useTheme";

/** Quick options menu (B) - dark mode toggle and future shortcuts. */
export function QuickMenu() {
  const open = useControls((s) => s.quickMenuOpen);
  const setOpen = useControls((s) => s.setQuickMenuOpen);
  const { theme, toggleTheme } = useTheme();
  const { volume, setVolume, cycleTrack } = useBackgroundMusic();
  const track = useBackgroundTrack();
  const [shell, setShell] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setShell(document.getElementById("app-shell"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || !shell) return null;

  const isDark = theme === "dark";

  return createPortal(
    <div className="absolute inset-0 z-[45] flex flex-col justify-end">
      <button
        aria-label="Close options"
        className="absolute inset-0 bg-ink/25 backdrop-blur-[3px] animate-pop-in dark-overlay"
        onClick={() => setOpen(false)}
      />
      <div className="quick-menu-panel relative z-10 mx-4 mb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-slide-up overflow-hidden rounded-[1.75rem] p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-800 text-ink">Options</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-ink-soft transition-all active:scale-95"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="quick-menu-row flex w-full items-center justify-between gap-3 rounded-tile px-4 py-3.5 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{
                background: isDark
                  ? "linear-gradient(135deg, #c084fc 0%, #60a5fa 100%)"
                  : "linear-gradient(180deg, #f5f6f8, #dde0e6)",
                boxShadow: isDark
                  ? "0 8px 20px -6px rgba(192,132,252,0.55)"
                  : "inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              {isDark ? (
                <Moon size={20} className="text-white" strokeWidth={2.4} />
              ) : (
                <Sun size={20} className="text-ink-soft" strokeWidth={2.4} />
              )}
            </span>
            <div>
              <p className="font-800 text-ink">Dark mode</p>
              <p className="text-xs font-700 text-ink-faint">
                {isDark ? "Dark theme enabled" : "Light theme"}
              </p>
            </div>
          </div>
          <span
            className="relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-200"
            style={{
              background: isDark
                ? "linear-gradient(135deg, #c084fc 0%, #60a5fa 100%)"
                : "rgba(120,130,150,0.25)",
            }}
          >
            <span
              className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200"
              style={{ left: isDark ? "1.35rem" : "0.15rem" }}
            />
          </span>
        </button>

        <div className="quick-menu-row mt-2 rounded-tile px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: isDark
                  ? "linear-gradient(135deg, #f472b6 0%, #fb923c 100%)"
                  : "linear-gradient(180deg, #fce7f3, #fed7aa)",
                boxShadow: isDark
                  ? "0 8px 20px -6px rgba(244,114,182,0.45)"
                  : "inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              <Music size={20} className={isDark ? "text-white" : "text-ink-soft"} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-800 text-ink">Music</p>
              <button
                type="button"
                onClick={cycleTrack}
                className="mt-0.5 flex w-full items-center gap-1 text-left text-xs font-700 text-ink-faint transition-colors active:text-ink"
              >
                <span className="truncate">{track.label}</span>
                <ChevronRight size={14} className="shrink-0 opacity-70" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="w-7 text-right text-[11px] font-800 tabular-nums text-ink-faint">
              {Math.round(volume * 100)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Music volume"
              className="h-2 flex-1 cursor-pointer accent-[#c084fc]"
            />
          </div>
        </div>

        <p className="mt-3 px-1 text-center text-[11px] font-700 text-ink-faint">
          Hold L + T for settings · L + B / R + B to switch tabs
        </p>
      </div>
    </div>,
    shell,
  );
}
