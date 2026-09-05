import { useEffect } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { setWebAudioMusic } from "@/lib/webAudioMusic";

const LOADING_LETTERS = "Upscale".split("");

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
      <div
        className="relative z-10 flex animate-pop-in flex-col items-center"
        role="status"
        aria-live="polite"
        aria-label="Loading Upscale"
      >
        <img
          src="/Upscale.png"
          alt=""
          width={96}
          height={96}
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
    </div>
  );
}
