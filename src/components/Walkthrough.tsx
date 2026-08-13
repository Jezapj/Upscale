import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWalkthrough } from "@/store/useWalkthrough";

interface TourStep {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value; omit for the full-screen welcome. */
  target?: string;
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Upscale",
    body: "You can use it to build daily routines, group them under goals, check in on how things went, keep notes, map your progress, and unwind in a built-in arcade.",
  },
  {
    id: "settings",
    title: "You & settings",
    body: "Tap your avatar (or LT) for Settings - backup, reminders, Arcade Pro, and Help to replay this tour.",
    target: "settings",
  },
  {
    id: "checkin",
    title: "Daily check-in",
    body: "Jump back in here to rate today's due routines. A full check-in sits on its own screen - you stay on Home during this tour.",
    target: "checkin",
  },
  {
    id: "goals",
    title: "Goals",
    body: "Goals are the big picture. Routines can roll up into a goal so you can see progress at a glance. The Goals tab in the dock lists every one.",
    target: "goals",
  },
  {
    id: "notes",
    title: "Notes",
    body: "Open your notes or tap plus to write one. Each note can have a colour and an optional reminder. Notes sync with your Google account, same as goals and routines.",
    target: "notes",
  },
  {
    id: "routines",
    title: "Routines",
    body: "Today's queue lives here. Press a row to rate it without leaving Home. Add more from the plus button or the Library.",
    target: "routines",
  },
  {
    id: "categories",
    title: "Categories",
    body: "These tiles jump into the Library by type - exercise, chores, learning, and the rest - so you can browse and add routines.",
    target: "categories",
  },
  {
    id: "hints",
    title: "Control hints",
    body: "Menu opens Settings. Mute the music or change the songs and volume in Options and toggle between light and dark themes. A starts check-in. + adds a routine. They mirror the keyboard shortcuts.",
    target: "hints",
  },
  {
    id: "dock",
    title: "The dock",
    body: "Switch tabs without leaving the idea of Home: Arcade mini-games, all Goals, Progress heatmaps, and your Routine Library. LB / RB hop between them on desktop.",
    target: "dock",
  },
];

const PAD = 8;

function shellEl(): HTMLElement | null {
  return document.getElementById("app-shell");
}

function targetRect(id: string): DOMRect | null {
  const shell = shellEl();
  const el = shell?.querySelector(`[data-tour="${id}"]`) as HTMLElement | null;
  if (!shell || !el) return null;
  const s = shell.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height);
}

export function Walkthrough() {
  const { pathname } = useLocation();
  const active = useWalkthrough((s) => s.active);
  const step = useWalkthrough((s) => s.step);
  const next = useWalkthrough((s) => s.next);
  const prev = useWalkthrough((s) => s.prev);
  const [shell, setShell] = useState<HTMLElement | null>(null);
  const [spot, setSpot] = useState<DOMRect | null>(null);

  const current = STEPS[step] ?? STEPS[0];
  const lastIndex = STEPS.length - 1;
  const isWelcome = !current.target;

  const measure = useCallback(() => {
    if (!current.target) {
      setSpot(null);
      return;
    }
    const el = shellEl()?.querySelector(
      `[data-tour="${current.target}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setSpot(targetRect(current.target));
  }, [current.target]);

  useEffect(() => {
    setShell(shellEl());
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    measure();
    const t = window.setTimeout(measure, 80);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const area = shellEl()?.querySelector(".scroll-area");
    area?.addEventListener("scroll", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      area?.removeEventListener("scroll", onResize);
    };
  }, [active, measure, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next(lastIndex);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, lastIndex, next, prev]);

  if (!active || !shell || pathname !== "/") return null;

  const placeAbove = spot ? spot.top + spot.height / 2 > shell.clientHeight * 0.55 : false;

  const tooltip = (
    <div
      className={`tour-card relative z-10 ${
        isWelcome ? "w-[min(22rem,calc(100%-2rem))] p-6 text-center" : "w-[min(17.5rem,calc(100%-1.5rem))] p-4"
      }`}
    >
      <p className="font-display text-lg font-800 text-ink">{current.title}</p>
      <p className={`mt-2 font-600 text-ink-soft ${isWelcome ? "text-sm" : "text-xs"}`}>
        {current.body}
      </p>
      <div className={`mt-4 flex items-center ${isWelcome ? "justify-center" : "justify-between"} gap-3`}>
        {!isWelcome && (
          <span className="text-[11px] font-800 tabular-nums text-ink-faint">
            {step}/{lastIndex}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            className="tour-back flex h-10 w-10 items-center justify-center rounded-full text-ink-soft shadow-soft transition-all active:scale-95 disabled:opacity-35"
            aria-label="Previous"
          >
            <ChevronLeft size={20} strokeWidth={2.6} />
          </button>
          <button
            type="button"
            onClick={() => next(lastIndex)}
            className="tour-next flex h-10 w-10 items-center justify-center rounded-full text-white shadow-soft transition-all active:scale-95"
            aria-label={step >= lastIndex ? "Finish" : "Next"}
          >
            <ChevronRight size={20} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div className="absolute inset-0 z-[80] isolate overflow-hidden animate-pop-in">
      {isWelcome ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/40 backdrop-blur-[3px] dark-overlay px-4">
          {tooltip}
        </div>
      ) : (
        <>
          {spot ? (
            <div
              className="tour-spot pointer-events-none absolute rounded-[1.35rem]"
              style={{
                top: Math.max(4, spot.top - PAD),
                left: Math.max(4, spot.left - PAD),
                width: spot.width + PAD * 2,
                height: spot.height + PAD * 2,
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-ink/40 dark-overlay" />
          )}
          <div className="absolute inset-0" aria-hidden />
          <div
            className="absolute z-10 flex w-full justify-center px-3"
            style={
              spot
                ? placeAbove
                  ? { bottom: shell.clientHeight - spot.top + 12, left: 0 }
                  : { top: spot.top + spot.height + 12, left: 0 }
                : { top: "40%", left: 0 }
            }
          >
            {tooltip}
          </div>
        </>
      )}
    </div>,
    shell,
  );
}
