import { useEffect } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { setWebAudioMusic } from "@/lib/webAudioMusic";

const LOADING_LETTERS = "Upscale".split("");

/** The boot splash mark: breathing logo + hopping "Upscale" letter wave. */
export function LoadingMark({
  label = "Loading Upscale",
  logoSize = 96,
}: {
  label?: string;
  logoSize?: number;
}) {
  return (
    <div
      className="relative z-10 flex animate-pop-in flex-col items-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <img
        src="/Upscale.png"
        alt=""
        width={logoSize}
        height={logoSize}
        draggable={false}
        className="loading-logo"
      />
      <p className="loading-word mt-4 font-display text-2xl font-800" aria-hidden>
        {LOADING_LETTERS.map((letter, i) => (
          <span
            key={i}
            className="loading-letter"
            style={{ animationDelay: `${i * 0.11}s` }}
          >
            {letter}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Shared boot / sign-in splash: logo + letter wave. */
export function LoadingScreen() {
  // Play eShop loop once during loading screen
  useEffect(() => {
    void setWebAudioMusic({
      src: "/10secloopmenumusic.mp3",
      volume: 0.35,
      play: true,
      loopEnd: 11,
    });
    return () => {
      // Stop the loading music when screen unmounts
      void setWebAudioMusic({ src: "", volume: 0, play: false });
    };
  }, []);

  return (
    <div className="app-shell items-center justify-center">
      <BackgroundDecor />
      <LoadingMark />
    </div>
  );
}

/**
 * In-app fallback while a screen is still rendering or loading. Covers the
 * content area with the same splash as boot, but fades in only after a short
 * delay so quick transitions never flash it.
 */
export function LoadingOverlay({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading-overlay" aria-busy="true">
      <LoadingMark label={label} logoSize={80} />
    </div>
  );
}
