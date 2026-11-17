import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { useTheme } from "@/store/useTheme";
import { useBackgroundMusic } from "@/store/useBackgroundMusic";
import {
  DEFAULT_BACKGROUND_TRACK_ID,
  isTrackOwned,
} from "@/lib/backgroundMusic";

/**
 * The equipped music track and app theme live in localStorage (per device),
 * while ownership lives in the synced save. Fall back to the free defaults
 * whenever this account does not own what the device has selected.
 */
export function UnlockGuard() {
  const unlocks = useStore((s) => s.data.arcadeUnlocks);
  const trackId = useBackgroundMusic((s) => s.trackId);
  const setTrackId = useBackgroundMusic((s) => s.setTrackId);
  const skin = useTheme((s) => s.skin);
  const setSkin = useTheme((s) => s.setSkin);

  useEffect(() => {
    if (!isTrackOwned(trackId, unlocks?.tracks)) {
      setTrackId(DEFAULT_BACKGROUND_TRACK_ID);
    }
  }, [trackId, unlocks?.tracks, setTrackId]);

  useEffect(() => {
    if (skin && !unlocks?.themes?.includes(skin)) setSkin(null);
  }, [skin, unlocks?.themes, setSkin]);

  return null;
}
