import { useEffect } from "react";

/** Screen Orientation lock. `"none"` unlocks so the device can rotate freely. */
export type OrientationLock = OrientationLockType | "none";

let desired: OrientationLock = "portrait-primary";
let gestureBound = false;

function applyLock(type: OrientationLock): void {
  const ori = screen.orientation;
  if (!ori) return;
  try {
    if (type === "none") {
      ori.unlock();
      return;
    }
    void ori.lock(type).catch(() => {
      if (type === "portrait-primary") {
        void ori.lock("portrait").catch(() => {});
      }
    });
  } catch {
    /* Safari and some desktop browsers throw synchronously. */
  }
}

function bindGestureRetry(): void {
  if (gestureBound) return;
  gestureBound = true;
  const retry = () => applyLock(desired);
  window.addEventListener("pointerdown", retry);
  window.addEventListener("fullscreenchange", retry);
}

/** Keep the most recently requested lock applied (GameShell can override the app default). */
export function useScreenOrientation(lock: OrientationLock): void {
  useEffect(() => {
    const previous = desired;
    desired = lock;
    bindGestureRetry();
    applyLock(lock);
    return () => {
      desired = previous;
      applyLock(previous);
    };
  }, [lock]);
}
