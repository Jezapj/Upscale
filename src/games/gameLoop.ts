/** Target 60fps: game logic constants are expressed per frame at this rate. */
export const TARGET_FRAME_MS = 1000 / 60;
export const MAX_PHYSICS_STEPS = 5;

/** Clamp raw frame delta and scale to 60fps units (1 = one 60fps frame). */
export function frameScale(deltaMs: number): number {
  return Math.min(deltaMs, 50) / TARGET_FRAME_MS;
}

/** Per-frame multiplier for values that decay exponentially each frame (e.g. 0.996). */
export function frameDecay(basePerFrame: number, dt: number): number {
  return basePerFrame ** dt;
}

/** Interpolate render position between fixed physics steps. */
export function renderLerp(prev: number, current: number, accum: number): number {
  return prev + (current - prev) * (1 - accum);
}

/** Cap backing-store DPR so 3x phones don't paint 9× the pixels. */
export function canvasDpr(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}
