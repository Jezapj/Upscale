import { useNavigate } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { Tile } from "@/components/Tile";
import { GAMES, gamePath } from "@/lib/games";
import { useRegisterControls } from "@/store/useControls";

const GAME_GLYPH: Record<string, string> = {
  tiptop: "⛳",
  octane: "🏎️",
  dissiada: "🎹",
  daybreak: "🌅",
};

export function GamesScreen() {
  const nav = useNavigate();

  useRegisterControls(
    {
      back: () => nav("/"),
      primary: () => nav(gamePath(GAMES[0].id)),
    },
    [nav],
  );

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-4">
        <PageHeader
          title="Arcade"
          subtitle="Quick mini-games between check-ins."
        />

        <div className="card mb-4 flex items-start gap-3 p-4">
          <Gamepad2 size={22} className="mt-0.5 shrink-0 text-cat-project" />
          <p className="min-w-0 text-sm font-600 text-ink-soft">
            <span className="font-800 text-ink">Unlimited plays</span> for now.
            Daily limits and subscriptions via Stripe are planned for later.
          </p>
        </div>

        <div className="space-y-3">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => nav(gamePath(g.id))}
              className="card flex w-full items-center gap-3 p-4 text-left transition-all active:scale-[0.99]"
            >
              <Tile
                glyph={GAME_GLYPH[g.id]}
                color={g.color}
                size={56}
                state="selected"
              />
              <div className="min-w-0 flex-1">
                <p className="content-title font-display text-lg font-800">
                  {g.name}
                </p>
                <p className="text-xs font-700 text-ink-faint">{g.tagline}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
