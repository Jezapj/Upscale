import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Coins, Gift, Sparkles, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { playUiChime } from "@/lib/uiSound";
import {
  LOGIN_BOARD_DAYS,
  loginBonusSummary,
  loginRewardAtStreak,
} from "@/lib/economy";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LoginBonusSheet({ open, onClose }: Props) {
  const data = useStore((s) => s.data);
  const today = useStore((s) => s.today);
  const claimLoginBonus = useStore((s) => s.claimLoginBonus);
  const summary = loginBonusSummary(data, today);
  const [shell, setShell] = useState<HTMLElement | null>(null);

  const page = Math.floor(Math.max(0, summary.streak - 1) / LOGIN_BOARD_DAYS);
  const startDay = page * LOGIN_BOARD_DAYS + 1;
  const days = Array.from({ length: LOGIN_BOARD_DAYS }, (_, i) => startDay + i);

  useEffect(() => {
    setShell(document.getElementById("app-shell"));
  }, []);

  useEffect(() => {
    if (!open) return;
    playUiChime("popup");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !shell) return null;

  const claim = () => {
    if (!summary.claimed) playUiChime("success");
    claimLoginBonus();
  };

  return createPortal(
    <div className="absolute inset-0 z-[55] flex items-center justify-center px-3 py-4">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-pop-in" />
      <div className="panel relative z-10 flex w-full max-w-[22.5rem] flex-col overflow-hidden p-3 animate-pop-in">
        <div className="relative mb-2 flex items-center justify-center px-9">
          <div className="capsule inline-flex items-center gap-1.5 px-3 py-1">
            <Gift size={14} className="text-cat-project" />
            <h2 className="font-display text-base font-800 text-ink">
              Daily login
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-soft shadow-soft active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const reward = loginRewardAtStreak(day);
            const isToday = day === summary.streak;
            const collected = day < summary.streak || (isToday && summary.claimed);
            const upcoming = day > summary.streak;
            const milestone = reward.milestone > 0;
            return (
              <div
                key={day}
                className={`card relative flex aspect-square flex-col items-center justify-center !rounded-[0.7rem] p-0 ${
                  isToday && !summary.claimed
                    ? "shadow-[0_0_0_2px_rgba(58,142,240,0.45),0_8px_16px_-8px_rgba(58,142,240,0.55)]"
                    : ""
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 text-[8px] font-900 leading-none ${
                    upcoming ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  {day}
                </span>
                {milestone ? (
                  <Sparkles
                    size={11}
                    className={upcoming ? "text-ink-soft" : "text-cat-project"}
                  />
                ) : (
                  <Coins
                    size={11}
                    className={upcoming ? "text-ink-soft" : "text-cat-project"}
                  />
                )}
                <span
                  className={`text-[11px] font-900 leading-none ${
                    upcoming ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  {reward.total}
                </span>
                {collected && (
                  <Check
                    size={14}
                    strokeWidth={3}
                    className="absolute bottom-0.5 right-0.5 text-[#34c79a]"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="capsule mt-2 px-3 py-2 text-center">
          <p className="text-sm font-800 text-ink">
            Day {summary.streak}
            {summary.claimed ? " claimed" : ""} · +{summary.total} token
            {summary.total === 1 ? "" : "s"}
          </p>
          {summary.milestone > 0 && (
            <p className="text-[11px] font-700 text-ink-soft">
              Includes +{summary.milestone} streak bonus
            </p>
          )}
        </div>

        <button type="button" className="btn mt-2 w-full py-2.5" onClick={claim}>
          {summary.claimed ? "OK" : "Claim"}
        </button>
      </div>
    </div>,
    shell,
  );
}
