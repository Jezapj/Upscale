import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { googleConfigured, makeGuest, renderGoogleButton } from "@/lib/auth";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { ArrowRight, Sparkles } from "lucide-react";

export function LoginScreen() {
  const signIn = useStore((s) => s.signIn);
  const btnRef = useRef<HTMLDivElement>(null);
  const [guestName, setGuestName] = useState("");
  const [showGuest, setShowGuest] = useState(false);
  const hasGoogle = googleConfigured();

  useEffect(() => {
    if (hasGoogle && btnRef.current) {
      void renderGoogleButton(btnRef.current, (user) => {
        void signIn(user);
      });
    }
  }, [hasGoogle, signIn]);

  const continueAsGuest = () => {
    void signIn(makeGuest(guestName.trim() || "Friend"));
  };

  return (
    <div className="app-shell">
      <BackgroundDecor />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div className="animate-pop-in">
          <img
            src="/Upscale.png"
            alt="Upscale"
            width={108}
            height={108}
            draggable={false}
          />
        </div>
        <h1 className="mt-5 font-display text-4xl font-800 text-ink">Upscale</h1>
        <p className="mt-2 max-w-[18rem] text-sm font-600 text-ink-soft">
          Build routines, group them under goals, and watch your progress level
          up - one day at a time.
        </p>

        <div className="mt-9 flex w-full max-w-[320px] flex-col items-center gap-3">
          {hasGoogle ? (
            <div ref={btnRef} className="flex justify-center" />
          ) : (
            <div className="card w-full px-4 py-3 text-xs font-600 text-ink-soft">
              <span className="font-800 text-ink">Google sign-in is optional.</span>{" "}
              Set <code className="rounded bg-white/70 px-1">GOOGLE_CLIENT_ID</code> on the
              server to enable it. For now, jump in as a guest - your data is saved on
              this device.
            </div>
          )}

          {!showGuest ? (
            <button
              onClick={() => setShowGuest(true)}
              className="btn-ghost w-full"
            >
              <Sparkles size={18} className="text-cat-learning" />
              Continue as guest
            </button>
          ) : (
            <div className="card w-full space-y-2 p-3 animate-slide-up">
              <input
                autoFocus
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && continueAsGuest()}
                placeholder="What should we call you?"
                className="form-input w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 font-600 text-ink outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-mint"
              />
              <button onClick={continueAsGuest} className="btn w-full">
                Let's go <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs font-600 text-ink-faint">
        Installable as an app
      </div>
    </div>
  );
}
