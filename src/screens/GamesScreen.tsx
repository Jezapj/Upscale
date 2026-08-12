import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Gamepad2, Crown } from "lucide-react";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { Tile } from "@/components/Tile";
import { ProSubscriptionSheet } from "@/components/ProSubscriptionSheet";
import { GAMES, gamePath, DAILY_FREE_PLAYS, PRO_PRICE_LABEL } from "@/lib/games";
import { useRegisterControls } from "@/store/useControls";
import { useStore } from "@/store/useStore";
import { getDailyCompletion, hasPlayedDaily } from "@/lib/dailyChallenge";
import { prettyDay } from "@/lib/dates";
import { verifyCheckoutSession } from "@/lib/subscription";

const GAME_GLYPH: Record<string, string> = {
  tiptop: "⛳",
  octane: "🏎️",
  dissiada: "🎹",
  daybreak: "🌅",
};

export function GamesScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = useStore((s) => s.today);
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const endlessLeft = useStore((s) => s.endlessPlaysLeft());
  const setGamePremium = useStore((s) => s.setGamePremium);
  const isPro = data.gamePremium === true;
  const [proOpen, setProOpen] = useState(false);

  useRegisterControls(
    {
      back: () => nav("/"),
      primary: () => nav(gamePath(GAMES[0].id)),
    },
    [nav],
  );

  useEffect(() => {
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");
    if (checkout === "success" && sessionId) {
      void verifyCheckoutSession(sessionId).then((active) => {
        if (active) setGamePremium(true);
        params.delete("checkout");
        params.delete("session_id");
        setParams(params, { replace: true });
      });
    } else if (checkout === "cancel") {
      params.delete("checkout");
      setParams(params, { replace: true });
    }
  }, [params, setParams, setGamePremium]);

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-4">
        <PageHeader
          title="Arcade"
          subtitle={`${prettyDay(today)} — one shared daily challenge each.`}
        />

        <div className={`mb-4 grid gap-3 ${isPro ? "grid-cols-1" : "grid-cols-2"}`}>
          <div className="card flex flex-col gap-2 p-4">
            <Gamepad2 size={22} className="shrink-0 text-cat-project" />
            <div className="min-w-0">
              <p className="font-800 text-ink">Daily challenge</p>
              <p className="text-xs font-700 text-ink-faint">
                Free once per game. Endless gives{" "}
                {isPro ? "unlimited" : `${DAILY_FREE_PLAYS} free`} plays a day
                {isPro ? "" : ` · ${endlessLeft} left today`}
              </p>
            </div>
          </div>

          {!isPro && (
            <button
              type="button"
              onClick={() => setProOpen(true)}
              className="card flex flex-col gap-2 p-4 text-left transition-all active:scale-[0.99]"
            >
              <Crown size={22} className="shrink-0 text-cat-project" />
              <div className="min-w-0">
                <p className="font-800 text-ink">Get Upscale Pro</p>
                <p className="text-xs font-700 text-ink-faint">
                  Unlimited Endless plays · {PRO_PRICE_LABEL}
                  {user?.provider !== "google" ? " · Sign in required" : ""}
                </p>
              </div>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {GAMES.map((g) => {
            const done = hasPlayedDaily(data, g.id, today);
            const completion = getDailyCompletion(data, g.id, today);
            return (
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
                  <p className="text-xs font-700 text-ink-faint">
                    {done
                      ? completion && completion.score > 0
                        ? `Played · ${completion.score.toLocaleString()}`
                        : "Played today"
                      : "Daily ready"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <ProSubscriptionSheet open={proOpen} onClose={() => setProOpen(false)} />
    </>
  );
}
