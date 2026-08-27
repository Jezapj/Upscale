import { useEffect } from "react";
import { Coins } from "lucide-react";
import { useStore } from "@/store/useStore";
import { playUiChime } from "@/lib/uiSound";

/** Brief Play Coin style toast when check-ins mint tokens. */
export function TokenEarnToast() {
  const event = useStore((s) => s.lastTokenEarn);
  const clear = useStore((s) => s.clearTokenEarn);

  useEffect(() => {
    if (!event) return;
    playUiChime("success");
    const t = window.setTimeout(() => clear(), 2200);
    return () => window.clearTimeout(t);
  }, [event, clear]);

  if (!event) return null;

  return (
    <div
      key={event.id}
      className="pointer-events-none fixed left-1/2 top-[18%] z-[60] -translate-x-1/2 animate-pop-in"
    >
      <div className="capsule flex items-center gap-2 px-4 py-2 shadow-panel">
        <Coins size={18} className="text-cat-project" />
        <span className="font-display text-base font-800 text-ink">
          +{event.amount} Play Token{event.amount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
