/**
 * eShop-style UI chimes from /public. Volume comes from Options → Sound effects.
 */
import { getAppAudioOutput, isAppAudioMuted, unlockGameAudio } from "@/games/gameAudio";
import { useUiSound } from "@/store/useUiSound";

export const UI_CHIMES = {
  tap: "/tapchime.mp3",
  tapLow: "/tapchime2low.mp3",
  tapMedium: "/tapchime3medium.mp3",
  tapHigh: "/tapchime4high.mp3",
  popup: "/popupchime.mp3",
  info: "/informationchime.mp3",
  alert: "/alertchime.mp3",
  success: "/successchime.mp3",
  scroll: encodeURI("/scrollchime (2).mp3"),
} as const;

export type UiChimeId = keyof typeof UI_CHIMES;

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
const lastEndAt: Partial<Record<UiChimeId, number>> = {};
let lastAnyTapAt = 0;

function uiVolume(): number {
  if (isAppAudioMuted()) return 0;
  const { volume, muted } = useUiSound.getState();
  if (muted) return 0;
  return Math.min(1, Math.max(0, volume));
}

async function decodeChime(audioCtx: AudioContext, src: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(src);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      return await audioCtx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  })();
  bufferCache.set(src, pending);
  return pending;
}

export function preloadUiChimes(): void {
  const audioCtx = unlockGameAudio();
  if (!audioCtx) return;
  for (const src of Object.values(UI_CHIMES)) {
    void decodeChime(audioCtx, src);
  }
}

/**
 * Play a named UI chime. `exclusive` waits until the previous play of that
 * clip has finished (used for scroll ticks).
 */
export function playUiChime(
  id: UiChimeId,
  opts?: { exclusive?: boolean; volume?: number; durationSec?: number },
): void {
  const volume = uiVolume() * (opts?.volume ?? 1);
  if (volume <= 0) return;

  const now = performance.now();
  const reservedMs = (opts?.durationSec ?? 0.08) * 1000;
  if (opts?.exclusive) {
    if (lastEndAt[id] && now < lastEndAt[id]!) return;
    lastEndAt[id] = now + reservedMs;
  }

  const audioCtx = unlockGameAudio();
  if (!audioCtx || audioCtx.state === "suspended") {
    void audioCtx?.resume();
  }
  if (!audioCtx) return;

  const src = UI_CHIMES[id];
  void decodeChime(audioCtx, src).then((buffer) => {
    if (!buffer) return;
    const playAt = performance.now();
    const playDur = Math.min(opts?.durationSec ?? buffer.duration, buffer.duration);
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    const peak = Math.min(1, 0.72 * volume);
    const t0 = audioCtx.currentTime;
    gain.gain.setValueAtTime(peak, t0);
    const fade = Math.min(0.045, playDur * 0.25);
    if (fade > 0.008) {
      gain.gain.setValueAtTime(peak, t0 + playDur - fade);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + playDur);
    }
    source.connect(gain);
    gain.connect(getAppAudioOutput(audioCtx));
    source.start(t0, 0, playDur);
    lastEndAt[id] = playAt + playDur * 1000;
  });
}

/** Default tap; debounce pointerdown + click on the same press. */
export function playUiTap(): void {
  const now = performance.now();
  if (now - lastAnyTapAt < 70) return;
  lastAnyTapAt = now;
  playUiChime("tap");
}

export function playUiTapKind(id: UiChimeId): void {
  const now = performance.now();
  if (now - lastAnyTapAt < 70) return;
  lastAnyTapAt = now;
  playUiChime(id);
}

export function pickTapChime(el: Element): UiChimeId {
  const tagged = el.closest("[data-sfx]")?.getAttribute("data-sfx");
  if (tagged && tagged in UI_CHIMES) return tagged as UiChimeId;
  if (el.closest(".btn-ghost, .dock-shoulder")) return "tapLow";
  if (el.closest(".btn")) return "tapHigh";
  if (el.closest("nav")) return "tapLow";
  if (el.closest("input[type='checkbox'], input[type='radio']")) return "tapMedium";
  return "tap";
}

const SCROLL_PEAK = 0.34;
const SCROLL_IDLE_MS = 48;
const SCROLL_FADE_SEC = 0.08;
const SCROLL_ATTACK_SEC = 0.03;

let scrollGain: GainNode | null = null;
let scrollSource: AudioBufferSourceNode | null = null;
let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
let scrollCtx: AudioContext | null = null;
let scrollBoot: Promise<void> | null = null;

function stopScrollLoop(): void {
  if (scrollIdleTimer) {
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = null;
  }
  scrollBoot = null;
  if (scrollSource) {
    try {
      scrollSource.stop();
    } catch {
      /* already stopped */
    }
    try {
      scrollSource.disconnect();
    } catch {
      /* already disconnected */
    }
    scrollSource = null;
  }
  if (scrollGain) {
    try {
      scrollGain.disconnect();
    } catch {
      /* already disconnected */
    }
    scrollGain = null;
  }
}

function fadeScrollOut(): void {
  const audioCtx = scrollCtx;
  const gain = scrollGain;
  if (!audioCtx || !gain) {
    stopScrollLoop();
    return;
  }
  const t0 = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + SCROLL_FADE_SEC);
  window.setTimeout(() => {
    if (scrollIdleTimer) return;
    stopScrollLoop();
  }, SCROLL_FADE_SEC * 1000 + 40);
}

async function ensureScrollLoop(): Promise<void> {
  const volume = uiVolume() * SCROLL_PEAK;
  if (volume <= 0) {
    stopScrollLoop();
    return;
  }
  const audioCtx = unlockGameAudio();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") void audioCtx.resume();
  scrollCtx = audioCtx;

  const rampUp = () => {
    if (!scrollGain || scrollGain.context !== audioCtx) return;
    const t0 = audioCtx.currentTime;
    scrollGain.gain.cancelScheduledValues(t0);
    scrollGain.gain.setValueAtTime(Math.max(0.0001, scrollGain.gain.value), t0);
    scrollGain.gain.linearRampToValueAtTime(volume, t0 + SCROLL_ATTACK_SEC);
  };

  if (scrollSource && scrollGain) {
    rampUp();
    return;
  }
  if (scrollBoot) {
    await scrollBoot;
    rampUp();
    return;
  }

  scrollBoot = (async () => {
    const buffer = await decodeChime(audioCtx, UI_CHIMES.scroll);
    if (!buffer || scrollSource) return;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + SCROLL_ATTACK_SEC);
    gain.connect(getAppAudioOutput(audioCtx));

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();

    scrollGain = gain;
    scrollSource = source;
  })();
  await scrollBoot;
  scrollBoot = null;
}

/** Soft looping bed while the user is scrolling; fades out after they stop. */
export function onUiScroll(deltaPx: number): void {
  if (Math.abs(deltaPx) < 1) return;
  if (uiVolume() <= 0) return;

  void ensureScrollLoop();
  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    scrollIdleTimer = null;
    fadeScrollOut();
  }, SCROLL_IDLE_MS);
}

export function warmupScrollClip(): void {
  preloadUiChimes();
}
