import { Coins, Flame, Gamepad2, Sparkles } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import type { WeeklyRecap } from "@/lib/weeklyRecap";
import { prettyDay } from "@/lib/dates";

interface Props {
  open: boolean;
  onClose: () => void;
  recap: WeeklyRecap | null;
}

/** eShop-style featured cartridge cover for last week. */
export function WeeklyRecapSheet({ open, onClose, recap }: Props) {
  if (!recap) return null;

  return (
    <Sheet open={open} onClose={onClose} title="Weekly recap">
      <div
        className="relative overflow-hidden rounded-[1.5rem] p-5 text-left shadow-panel"
        style={{
          background:
            "linear-gradient(145deg, #5cd0a8 0%, #4aa3ff 45%, #a06bff 100%)",
        }}
      >
        <p className="text-[11px] font-800 uppercase tracking-wide text-white/80">
          Featured this week
        </p>
        <h3 className="mt-1 font-display text-2xl font-800 text-white">
          {recap.title}
        </h3>
        <p className="mt-1 text-sm font-700 text-white/85">
          {prettyDay(recap.start)} to {prettyDay(recap.end)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/20 px-3 py-2 backdrop-blur-sm">
            <p className="text-2xl font-800 text-white">{recap.completionPct}%</p>
            <p className="text-[11px] font-700 text-white/80">Completion</p>
          </div>
          <div className="rounded-2xl bg-white/20 px-3 py-2 backdrop-blur-sm">
            <p className="flex items-center gap-1 text-2xl font-800 text-white">
              <Coins size={18} /> {recap.tokensEarned}
            </p>
            <p className="text-[11px] font-700 text-white/80">Tokens earned</p>
          </div>
          <div className="rounded-2xl bg-white/20 px-3 py-2 backdrop-blur-sm">
            <p className="flex items-center gap-1 text-2xl font-800 text-white">
              <Flame size={18} /> {recap.bestStreak}
            </p>
            <p className="text-[11px] font-700 text-white/80">Best streak</p>
          </div>
          <div className="rounded-2xl bg-white/20 px-3 py-2 backdrop-blur-sm">
            <p className="text-2xl font-800 text-white">
              {recap.completed}/{recap.scheduled}
            </p>
            <p className="text-[11px] font-700 text-white/80">Routines done</p>
          </div>
        </div>
      </div>

      {recap.insight && (
        <div className="card mt-4 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-800 text-ink">
            <Sparkles size={16} className="text-cat-project" /> Insight
          </p>
          <p className="text-sm font-700 text-ink-soft">{recap.insight}</p>
        </div>
      )}

      {recap.arcadeHighlight && (
        <div className="card mt-3 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-800 text-ink">
            <Gamepad2 size={16} className="text-cat-project" /> Arcade highlight
          </p>
          <p className="text-sm font-700 text-ink-soft">{recap.arcadeHighlight}</p>
        </div>
      )}

      <button type="button" className="btn mt-5 w-full" onClick={onClose}>
        Nice
      </button>
    </Sheet>
  );
}
