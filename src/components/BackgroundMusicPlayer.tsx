import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getBackgroundTrack } from "@/lib/backgroundMusic";
import { setWebAudioMusic } from "@/lib/webAudioMusic";
import { useBackgroundMusic } from "@/store/useBackgroundMusic";

/** Keep theme music behind UI and game SFX (slider is still 0–100). */
const MUSIC_BED_GAIN = 0.58;

/** Mute on rhythm games; duck on the others so game SFX stay clear. */
function gameMusicDuck(pathname: string): number {
  const m = pathname.match(/^\/games\/([^/]+)/);
  if (!m) return 1;
  const id = m[1];
  if (id === "daybreak" || id === "dissiada") return 0;
  if (id === "tiptop" || id === "octane") return 0.22;
  return 1;
}

/** Looped app background music via Web Audio (no OS media-player notification). */
export function BackgroundMusicPlayer() {
  const location = useLocation();
  const volume = useBackgroundMusic((s) => s.volume);
  const muted = useBackgroundMusic((s) => s.muted);
  const trackId = useBackgroundMusic((s) => s.trackId);
  const track = getBackgroundTrack(trackId);
  const unlockedRef = useRef(false);
  const effectiveVolume = muted
    ? 0
    : volume * MUSIC_BED_GAIN * gameMusicDuck(location.pathname);
  const loopEnd = "loopEnd" in track ? track.loopEnd : undefined;

  useEffect(() => {
    const apply = () => {
      void setWebAudioMusic({
        src: track.src,
        volume: effectiveVolume,
        play: unlockedRef.current && effectiveVolume > 0,
        loopEnd,
      });
    };

    apply();

    const unlock = () => {
      unlockedRef.current = true;
      apply();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [track.src, effectiveVolume, loopEnd]);

  return null;
}
