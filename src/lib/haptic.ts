/**
 * Light Vibration API wrappers. No-ops on desktop / iOS Safari.
 * Prefer short pulses; games should throttle noisy events themselves.
 */

const lastPulse = new Map<string, number>();

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function vibrate(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return false;
  }
  if (reducedMotion()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function hapticStop(): void {
  vibrate(0);
}

/** Dock tab / tiny UI tick. */
export function hapticLight(): void {
  vibrate(8);
}

/** Check-in rating, flap, hold tick. */
export function hapticTick(): void {
  vibrate(10);
}

/** Hole-in, combo milestone, shift, jump pad, double jump. */
export function hapticMedium(): void {
  vibrate(22);
}

/** Check-in finished. */
export function hapticSuccess(): void {
  vibrate([18, 45, 32]);
}

/** Octane launch from a standstill. */
export function hapticLaunch(): void {
  vibrate(70);
}

/** Wall / obstacle / death. */
export function hapticImpact(): void {
  vibrate(30);
}

/** TipTop laser. */
export function hapticZap(): void {
  vibrate([14, 28, 36]);
}

/** Spacewalk bay smash or rocket expiry. */
export function hapticExplode(): void {
  vibrate([32, 38, 52]);
}

/** Daybreak defeat. */
export function hapticDefeat(): void {
  vibrate([40, 40, 55]);
}

/** Repeating light pulse (drop-dash charge, etc.). */
export function hapticPulse(key: string, intervalMs: number, durationMs = 10): void {
  const now = performance.now();
  const last = lastPulse.get(key) ?? 0;
  if (now - last < intervalMs) return;
  lastPulse.set(key, now);
  vibrate(durationMs);
}

export function hapticThrottled(
  key: string,
  cooldownMs: number,
  pattern: number | number[],
): boolean {
  const now = performance.now();
  const last = lastPulse.get(key) ?? 0;
  if (now - last < cooldownMs) return false;
  lastPulse.set(key, now);
  return vibrate(pattern);
}
