import { useNavigate, useLocation, NavLink } from "react-router-dom";
import { Home, Gamepad2, Trophy, Smile, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "@/store/useStore";
import { todayKey } from "@/lib/dates";
import { isDueToday } from "@/lib/frequency";
import { dockNext, dockPrev } from "@/lib/dock";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: Item[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/checkin", label: "Check-in", icon: Gamepad2 },
  { to: "/goals", label: "Goals", icon: Trophy },
  { to: "/progress", label: "Progress", icon: Smile },
  { to: "/library", label: "Library", icon: LayoutGrid },
];

/** Floating IISU bottom dock with clickable LB/RB shoulder pills. */
export function Dock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const data = useStore((s) => s.data);
  const key = todayKey();
  const dueCount = data.routines.filter((r) => isDueToday(r, key, data)).length;

  const goPrev = () => navigate(dockPrev(pathname));
  const goNext = () => navigate(dockNext(pathname));

  return (
    <nav className="relative z-50 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-1 no-select">
      <div className="relative mx-auto max-w-[420px]">
        <button
          type="button"
          onClick={goPrev}
          title="Previous tab (hold L + B)"
          className="dock-shoulder absolute -top-1 left-2 transition-all active:scale-95"
        >
          LB
        </button>
        <button
          type="button"
          onClick={goNext}
          title="Next tab (hold R + B)"
          className="dock-shoulder absolute -top-1 right-2 transition-all active:scale-95"
        >
          RB
        </button>

        <div className="capsule relative z-0 flex items-center justify-between gap-1 px-2.5 py-2 shadow-dock">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="relative flex flex-1 items-center justify-center py-1"
            >
              {({ isActive }) => (
                <span
                  className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${
                    isActive ? "dock-tab-active" : ""
                  }`}
                  style={
                    isActive
                      ? undefined
                      : { transform: "none" }
                  }
                >
                  <item.icon
                    size={24}
                    strokeWidth={2.6}
                    color={isActive ? "#ffffff" : "#8b919c"}
                    className={isActive ? "" : "dock-icon-idle"}
                  />
                  {item.to === "/checkin" && dueCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cat-exercise px-1 text-[10px] font-900 text-white shadow-soft ring-2 ring-white">
                      {dueCount}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
