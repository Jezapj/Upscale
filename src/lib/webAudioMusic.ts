import { getAppAudioOutput, getGameAudioContext, unlockGameAudio } from "@/games/gameAudio";

const bufferCache = new Map<string, Promise<AudioBuffer>>();
let masterGain: GainNode | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let playingKey: string | null = null;
let loadGeneration = 0;
let hideHandlerBound = false;

function ensureGain(audioCtx: AudioContext): GainNode {
  if (!masterGain || masterGain.context !== audioCtx) {
    masterGain = audioCtx.createGain();
    masterGain.connect(getAppAudioOutput(audioCtx));
  }
  return masterGain;
}

function stopSource(): void {
  if (!sourceNode) return;
  try {
    sourceNode.stop();
  } catch {
    /* already stopped */
  }
  try {
    sourceNode.disconnect();
  } catch {
    /* already disconnected */
  }
  sourceNode = null;
  playingKey = null;
}

async function decodeTrack(audioCtx: AudioContext, src: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(src);
  if (cached) return cached;

  const pending = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to load background track (${res.status})`);
    const data = await res.arrayBuffer();
    return audioCtx.decodeAudioData(data.slice(0));
  })();

  bufferCache.set(src, pending);
  try {
    return await pending;
  } catch (err) {
    bufferCache.delete(src);
    throw err;
  }
}

function bindHideHandler(): void {
  if (hideHandlerBound || typeof document === "undefined") return;
  hideHandlerBound = true;
  document.addEventListener("visibilitychange", () => {
    const audioCtx = getGameAudioContext();
    if (!audioCtx) return;
    if (document.hidden) {
      void audioCtx.suspend();
      return;
    }
    void audioCtx.resume();
  });
}

/**
 * Loop a background track through Web Audio so the OS does not attach a
 * media-session / lock-screen player (that only applies to media elements).
 */
export async function setWebAudioMusic(opts: {
  src: string;
  volume: number;
  play: boolean;
  /** If set, loop only this many seconds from the start (clips a long tail). */
  loopEnd?: number;
}): Promise<void> {
  const audioCtx = unlockGameAudio();
  if (!audioCtx) return;

  bindHideHandler();
  const gain = ensureGain(audioCtx);
  const vol = Math.min(1, Math.max(0, opts.volume));
  gain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.03);

  if (!opts.play || vol <= 0) {
    stopSource();
    return;
  }

  if (document.hidden) {
    void audioCtx.suspend();
  } else if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  const loopEnd =
    opts.loopEnd && opts.loopEnd > 0.2
      ? Math.min(opts.loopEnd, 10_000)
      : undefined;
  const key = `${opts.src}|${loopEnd ?? "full"}`;
  if (playingKey === key && sourceNode) return;

  const generation = ++loadGeneration;
  let buffer: AudioBuffer;
  try {
    buffer = await decodeTrack(audioCtx, opts.src);
  } catch (err) {
    console.warn("Background music decode failed", err);
    return;
  }
  if (generation !== loadGeneration) return;

  stopSource();
  const next = audioCtx.createBufferSource();
  next.buffer = buffer;
  next.loop = true;
  next.loopStart = 0;
  const end = loopEnd ? Math.min(loopEnd, buffer.duration) : buffer.duration;
  if (end < buffer.duration - 0.01) {
    next.loopEnd = end;
  }
  next.connect(gain);
  next.start(0);
  sourceNode = next;
  playingKey = key;
}
