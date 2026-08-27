/**
 * Soft eShop-style UI tap blip, shared by all tappable chrome (buttons,
 * links, toggles). Uses the shared game AudioContext so music and SFX
 * never fight over the audio session.
 */
import { unlockGameAudio } from "@/games/gameAudio";

let lastTapAt = 0;

/** Play a short, soft tap. `volume` is 0..1 from the options slider. */
export function playUiTap(volume: number): void {
  if (volume <= 0) return;
  const now = performance.now();
  // Debounce: pointerdown + click on the same tap should blip once.
  if (now - lastTapAt < 60) return;
  lastTapAt = now;

  const audioCtx = unlockGameAudio();
  if (!audioCtx || audioCtx.state !== "running") return;

  const t0 = audioCtx.currentTime;
  const peak = Math.max(0.0002, 0.14 * volume);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
  gain.connect(audioCtx.destination);

  // Rounded "plip": a sine that eases down plus a faint glassy partial.
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1150, t0);
  osc.frequency.exponentialRampToValueAtTime(870, t0 + 0.07);
  osc.connect(gain);
  osc.start(t0);
  osc.stop(t0 + 0.1);

  const shimmer = audioCtx.createGain();
  shimmer.gain.setValueAtTime(0.0001, t0);
  shimmer.gain.exponentialRampToValueAtTime(peak * 0.3, t0 + 0.005);
  shimmer.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  shimmer.connect(audioCtx.destination);

  const osc2 = audioCtx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(2300, t0);
  osc2.connect(shimmer);
  osc2.start(t0);
  osc2.stop(t0 + 0.06);
}
