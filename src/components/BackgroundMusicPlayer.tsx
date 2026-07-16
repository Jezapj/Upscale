import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getBackgroundTrack } from "@/lib/backgroundMusic";
import { useBackgroundMusic } from "@/store/useBackgroundMusic";

/** Mute on rhythm games; duck on the others so game SFX stay clear. */
function gameMusicDuck(pathname: string): number {
  const m = pathname.match(/^\/games\/([^/]+)/);
  if (!m) return 1;
  const id = m[1];
  if (id === "daybreak" || id === "dissiada") return 0;
  if (id === "tiptop" || id === "octane") return 0.22;
  return 1;
}

/** Looped app background music from /public MP4 audio tracks. */
export function BackgroundMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const location = useLocation();
  const volume = useBackgroundMusic((s) => s.volume);
  const trackId = useBackgroundMusic((s) => s.trackId);
  const track = getBackgroundTrack(trackId);
  const unlockedRef = useRef(false);
  const effectiveVolume = volume * gameMusicDuck(location.pathname);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = effectiveVolume;
    if (effectiveVolume <= 0) {
      audio.pause();
      return;
    }
    if (unlockedRef.current) void audio.play().catch(() => {});
  }, [effectiveVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const shouldPlay = effectiveVolume > 0 && unlockedRef.current;
    audio.src = track.src;
    audio.load();
    if (shouldPlay) void audio.play().catch(() => {});
  }, [track.src, effectiveVolume]);

  useEffect(() => {
    const tryPlay = () => {
      const audio = audioRef.current;
      if (!audio || effectiveVolume <= 0) return;
      unlockedRef.current = true;
      void audio.play().catch(() => {});
    };

    tryPlay();

    const unlock = () => {
      unlockedRef.current = true;
      tryPlay();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [effectiveVolume]);

  return (
    <audio
      ref={audioRef}
      loop
      preload="auto"
      playsInline
      aria-hidden
      className="pointer-events-none fixed h-0 w-0 opacity-0"
    />
  );
}
