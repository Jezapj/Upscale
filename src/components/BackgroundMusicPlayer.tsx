import { useEffect, useRef } from "react";
import { getBackgroundTrack } from "@/lib/backgroundMusic";
import { useBackgroundMusic } from "@/store/useBackgroundMusic";

/** Looped app background music from /public MP4 audio tracks. */
export function BackgroundMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const volume = useBackgroundMusic((s) => s.volume);
  const trackId = useBackgroundMusic((s) => s.trackId);
  const track = getBackgroundTrack(trackId);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    if (volume <= 0) {
      audio.pause();
      return;
    }
    if (unlockedRef.current) void audio.play().catch(() => {});
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const shouldPlay = volume > 0 && unlockedRef.current;
    audio.src = track.src;
    audio.load();
    if (shouldPlay) void audio.play().catch(() => {});
  }, [track.src, volume]);

  useEffect(() => {
    const tryPlay = () => {
      const audio = audioRef.current;
      if (!audio || volume <= 0) return;
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
  }, [volume]);

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
