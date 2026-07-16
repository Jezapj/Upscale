/**
 * Daybreak audio: everything is synthesized live through the Web Audio API —
 * no sample files. Provides the backing rhythm track (kick / hat / bass in the
 * chosen key), elevation-pitched jump & landing notes, death and victory SFX,
 * and a pause system that suspends the AudioContext.
 *
 * The AudioContext clock is also the game's master clock: `time()` freezes
 * while paused (suspended contexts stop advancing `currentTime`), which keeps
 * the level scroll perfectly in sync with the scheduled music.
 */

import { unlockGameAudio } from "../gameAudio";
import {
  elevationHz,
  midiToHz,
  scaleFrequencies,
  type MusicalKey,
} from "./musicTheory";

export interface DaybreakAudioHandle {
  /** Master clock in seconds. Frozen while paused. */
  time(): number;
  /**
   * Begin (or restart) the backing track. Returns the `time()` value at
   * which beat 0 lands, i.e. the moment the level starts scrolling.
   */
  startTrack(): number;
  /** Stop scheduling new beats (already-scheduled ones ring out). */
  stopTrack(): void;
  pause(): void;
  resume(): void;
  /** Note pitched by the elevation the player jumped from. */
  jumpNote(elevation: number): void;
  /** Percussive note pitched by the elevation the player landed on. */
  landNote(elevation: number): void;
  /**
   * Brief in-key triad when an obstacle is cleared. Quantized to the next
   * half-beat; root follows the given elevation.
   */
  clearChord(elevation: number): void;
  death(): void;
  winFanfare(): void;
  dispose(): void;
}

const SCHEDULE_AHEAD = 0.18;
const SCHEDULER_INTERVAL_MS = 25;
const TRACK_LEAD_IN = 0.15;

/** Fallback used when the AudioContext can't be created (still playable). */
function createSilentHandle(): DaybreakAudioHandle {
  let pauseStart: number | null = null;
  let pausedTotal = 0;
  const time = () => ((pauseStart ?? performance.now()) - pausedTotal) / 1000;
  return {
    time,
    startTrack: () => time() + TRACK_LEAD_IN,
    stopTrack: () => {},
    pause: () => {
      if (pauseStart === null) pauseStart = performance.now();
    },
    resume: () => {
      if (pauseStart !== null) {
        pausedTotal += performance.now() - pauseStart;
        pauseStart = null;
      }
    },
    jumpNote: () => {},
    landNote: () => {},
    clearChord: () => {},
    death: () => {},
    winFanfare: () => {},
    dispose: () => {},
  };
}

export function createDaybreakAudio(
  key: MusicalKey,
  bpm: number,
): DaybreakAudioHandle {
  const ctx = unlockGameAudio();
  if (!ctx) return createSilentHandle();

  const freqs = scaleFrequencies(key);
  const beatDur = 60 / bpm;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  let noise: AudioBuffer | null = null;
  const noiseBuffer = (): AudioBuffer => {
    if (noise) return noise;
    const len = Math.ceil(ctx.sampleRate * 1);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  };

  // ── Drum & bass voices ────────────────────────────────────────────────────

  const kick = (t: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(musicBus);
    osc.start(t);
    osc.stop(t + 0.18);
  };

  const hat = (t: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(hp).connect(gain).connect(musicBus);
    src.start(t);
    src.stop(t + 0.06);
  };

  const bass = (t: number, hz: number, dur: number) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = hz;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.17, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp).connect(gain).connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };

  // ── Backing-track scheduler (lookahead on the audio clock) ────────────────

  const bassRootHz = midiToHz(key.tonicMidi - 12);
  const bassFifthHz = midiToHz(key.tonicMidi - 12 + 7);

  let schedulerId: number | null = null;
  let trackStart = 0;
  let nextBeat = 0;

  const scheduleBeat = (beat: number, t: number) => {
    kick(t);
    hat(t + beatDur / 2);
    // Simple root/fifth bassline, one note per beat: | R . 5 R |
    const pos = beat % 4;
    if (pos === 0) bass(t, bassRootHz, beatDur * 0.85);
    else if (pos === 2) bass(t, bassFifthHz, beatDur * 0.85);
    else if (pos === 3) bass(t, bassRootHz, beatDur * 0.4);
  };

  const tick = () => {
    while (trackStart + nextBeat * beatDur < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleBeat(nextBeat, trackStart + nextBeat * beatDur);
      nextBeat++;
    }
  };

  const stopTrack = () => {
    if (schedulerId !== null) {
      window.clearInterval(schedulerId);
      schedulerId = null;
    }
  };

  const startTrack = (): number => {
    stopTrack();
    trackStart = ctx.currentTime + TRACK_LEAD_IN;
    nextBeat = 0;
    tick();
    schedulerId = window.setInterval(tick, SCHEDULER_INTERVAL_MS);
    return trackStart;
  };

  // ── Player SFX ────────────────────────────────────────────────────────────

  const jumpNote = (elevation: number) => {
    const hz = elevationHz(freqs, elevation);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = hz;
    const shimmer = ctx.createOscillator();
    shimmer.type = "square";
    shimmer.frequency.value = hz * 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.035, t);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(sfxBus);
    shimmer.connect(shimmerGain).connect(sfxBus);
    osc.start(t);
    shimmer.start(t);
    osc.stop(t + 0.22);
    shimmer.stop(t + 0.14);
  };

  const landNote = (elevation: number) => {
    const hz = elevationHz(freqs, elevation);
    const t = ctx.currentTime;
    // Pitched body...
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(sfxBus);
    osc.start(t);
    osc.stop(t + 0.12);
    // ...plus a percussive click.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.min(8000, hz * 4);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.08, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(bp).connect(clickGain).connect(sfxBus);
    src.start(t);
    src.stop(t + 0.04);
  };

  /**
   * Quantize to the next half-beat of the backing track, then play a short
   * diatonic triad rooted at the clearance elevation.
   */
  const clearChord = (elevation: number) => {
    const now = ctx.currentTime;
    const half = beatDur / 2;
    let t = now;
    if (trackStart > 0 && half > 0) {
      const elapsed = Math.max(0, now - trackStart);
      const nextSlot = Math.ceil(elapsed / half - 1e-6) * half;
      t = Math.max(now, trackStart + nextSlot);
    }
    // Soften if we somehow schedule far ahead.
    if (t - now > half) t = now;

    const root = Math.round(elevation);
    const tones = [0, 2, 4].map((deg) => elevationHz(freqs, root + deg));
    const vols = [0.11, 0.08, 0.07];
    tones.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vols[i], t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  };

  const death = () => {
    const t = ctx.currentTime;
    // Retro descending zap...
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.42);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.22, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(oscGain).connect(sfxBus);
    osc.start(t);
    osc.stop(t + 0.5);
    // ...under an explosion of filtered noise.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.35);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(lp).connect(noiseGain).connect(sfxBus);
    src.start(t);
    src.stop(t + 0.45);
  };

  const winFanfare = () => {
    const t = ctx.currentTime;
    const third = key.mode === "major" ? 4 : 3;
    const semis = [0, third, 7, 12];
    semis.forEach((s, i) => {
      const at = t + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = midiToHz(key.tonicMidi + s);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
      osc.connect(gain).connect(sfxBus);
      osc.start(at);
      osc.stop(at + 0.35);
    });
  };

  // ── Pause / lifecycle ─────────────────────────────────────────────────────

  let paused = false;

  const pause = () => {
    if (paused) return;
    paused = true;
    stopTrack();
    void ctx.suspend();
  };

  const resume = () => {
    if (!paused) return;
    paused = false;
    void ctx.resume();
    // Restart the lookahead scheduler exactly where it left off; the audio
    // clock did not advance while suspended, so beat times are still valid.
    if (schedulerId === null && trackStart > 0) {
      tick();
      schedulerId = window.setInterval(tick, SCHEDULER_INTERVAL_MS);
    }
  };

  const dispose = () => {
    stopTrack();
    master.disconnect();
    // Never leave the shared context suspended for other games.
    if (ctx.state === "suspended") void ctx.resume();
  };

  return {
    time: () => ctx.currentTime,
    startTrack,
    stopTrack,
    pause,
    resume,
    jumpNote,
    landNote,
    clearChord,
    death,
    winFanfare,
    dispose,
  };
}
