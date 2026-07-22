import {
  DISSIADA_COMBO_HARMONICS,
  DISSIADA_NOTE_HZ,
  DISSIADA_SOUND,
  type DissiadaComboHarmonic,
  OCTANE_REV_GEAR_PITCH,
  OCTANE_REDLINE,
  OCTANE_IDLE_MIX,
  OCTANE_SAMPLES,
  OCTANE_SOUND,
  TIPTOP_SOUND,
  TIPTOP_FLAP_TONE,
  type SampleClip,
  type SoundTiming,
} from "./gameSoundConfigs";

let sharedCtx: AudioContext | null = null;

export function unlockGameAudio(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new AudioContext();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

function ctx(): AudioContext | null {
  return unlockGameAudio();
}

function scheduleGainEnvelope(
  audioCtx: AudioContext,
  gain: GainNode,
  config: SoundTiming,
  attack = 0.004,
) {
  const t0 = audioCtx.currentTime + config.startTime;
  const peak = Math.max(0.0001, config.volume);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + config.endTime);
  gain.gain.setValueAtTime(0, t0 + config.duration);
}

/** Fade in → hold → fade out; returns when the voice can safely stop. */
function scheduleFadedGainEnvelope(
  audioCtx: AudioContext,
  gain: GainNode,
  config: SoundTiming,
  absoluteT0?: number,
): number {
  const t0 = absoluteT0 ?? audioCtx.currentTime + config.startTime;
  const fadeIn = Math.max(0.004, config.fadeIn ?? 0.008);
  const fadeOut = Math.max(0.012, config.fadeOut ?? 0.05);
  const intensity = config.intensity ?? 1;
  const peak = Math.max(0.0001, config.volume * intensity);
  const voiceEnd = t0 + config.duration;
  const fadeOutStart = Math.max(t0 + fadeIn, voiceEnd - fadeOut);
  const stopAt = voiceEnd + 0.03;

  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + fadeIn);
  if (fadeOutStart > t0 + fadeIn) {
    gain.gain.setValueAtTime(peak, fadeOutStart);
  }
  gain.gain.linearRampToValueAtTime(0, voiceEnd);
  gain.gain.setValueAtTime(0, stopAt);
  return stopAt;
}

function makeNoiseBuffer(audioCtx: AudioContext, seconds = 1): AudioBuffer {
  const len = Math.ceil(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let noiseBuffer: AudioBuffer | null = null;

interface DissiadaBus {
  dry: GainNode;
  audioCtx: AudioContext;
}

let dissiadaBus: DissiadaBus | null = null;
let dissiadaActiveHarmonics = 0;

const DISSIADA_MAX_ACTIVE_HARMONICS = 14;

function getDissiadaBus(audioCtx: AudioContext): DissiadaBus {
  if (dissiadaBus && dissiadaBus.audioCtx === audioCtx) return dissiadaBus;

  const dry = audioCtx.createGain();
  dry.gain.value = 0.95;

  const out = audioCtx.createGain();
  out.gain.value = 0.96;

  dry.connect(out);
  out.connect(audioCtx.destination);

  dissiadaBus = { dry, audioCtx };
  return dissiadaBus;
}

/** Smooth attack/release envelope; returns when the voice should stop. */
function scheduleDissiadaGainEnvelope(
  audioCtx: AudioContext,
  gain: GainNode,
  config: SoundTiming,
  attack = 0.004,
  absoluteT0?: number,
): number {
  const t0 = absoluteT0 ?? audioCtx.currentTime + config.startTime;
  const peak = Math.max(0.0001, config.volume);
  const attackT = Math.max(0.008, attack);
  const fadeEnd = Math.max(t0 + attackT + 0.02, t0 + config.endTime);
  const stopAt = t0 + config.duration + 0.12;

  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attackT);
  gain.gain.setTargetAtTime(0.0001, t0 + attackT, Math.max(0.03, (fadeEnd - t0 - attackT) / 4));
  gain.gain.setValueAtTime(0, stopAt);
  return stopAt;
}

function dissiadaHarmonicLoadScale(combo: number, activeCount: number): number {
  const comboFactor =
    combo > 10 ? 1 / Math.sqrt(1 + (combo - 10) * 0.1) : 1;
  const loadFactor =
    activeCount > 6 ? Math.max(0.3, 6 / activeCount) : 1;
  return comboFactor * loadFactor;
}

function trackDissiadaHarmonic(durationSec: number) {
  dissiadaActiveHarmonics++;
  window.setTimeout(() => {
    dissiadaActiveHarmonics = Math.max(0, dissiadaActiveHarmonics - 1);
  }, durationSec * 1000 + 40);
}

function getNoise(audioCtx: AudioContext): AudioBuffer {
  if (!noiseBuffer) noiseBuffer = makeNoiseBuffer(audioCtx);
  return noiseBuffer;
}

function semitoneRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

type DissiadaHitQuality = "perfect" | "good" | "ok" | "miss";

function scheduleDissiadaVoice(
  audioCtx: AudioContext,
  hz: number,
  quality: DissiadaHitQuality,
  config: SoundTiming,
  volumeScale: number,
  wave: OscillatorType,
  filterHz: number,
) {
  const t0 = audioCtx.currentTime + config.startTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  const filter = audioCtx.createBiquadFilter();

  osc.type = wave;
  osc.frequency.setValueAtTime(hz, t0);
  if (quality === "perfect" || quality === "good") {
    osc.frequency.exponentialRampToValueAtTime(hz * 0.998, t0 + config.endTime);
  } else if (quality === "ok") {
    osc.frequency.exponentialRampToValueAtTime(hz * 0.72, t0 + config.endTime);
  }

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterHz, t0);
  filter.Q.value = 0.7;

  osc.connect(filter);
  filter.connect(gain);
  const bus = getDissiadaBus(audioCtx);
  gain.connect(bus.dry);

  const stopAt = scheduleDissiadaGainEnvelope(
    audioCtx,
    gain,
    {
      ...config,
      volume: config.volume * volumeScale,
    },
    0.004,
    t0,
  );

  osc.start(t0);
  osc.stop(stopAt + 0.05);
}

function resolveDissiadaHarmonicTiming(
  harmonic: DissiadaComboHarmonic,
): SoundTiming {
  const base = DISSIADA_SOUND.harmonic;
  return {
    ...base,
    startTime: harmonic.startTime ?? base.startTime,
    endTime: harmonic.endTime ?? base.endTime,
    duration: harmonic.duration ?? base.duration,
  };
}

function scheduleDissiadaHarmonicsForNote(
  audioCtx: AudioContext,
  rootHz: number,
  harmonics: readonly DissiadaComboHarmonic[],
  volumeScale: number,
) {
  if (harmonics.length === 0) return;

  const bus = getDissiadaBus(audioCtx);
  const noteT0 = audioCtx.currentTime;
  let tailEnd = noteT0;
  const voiceShare = volumeScale / Math.sqrt(harmonics.length);

  for (const harmonic of harmonics) {
    const config = resolveDissiadaHarmonicTiming(harmonic);
    const t0 = noteT0 + config.startTime;
    const hHz = rootHz * semitoneRatio(harmonic.semitones);

    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hHz, t0);
    const decay = Math.max(0.01, config.endTime - config.startTime);
    osc.frequency.exponentialRampToValueAtTime(hHz * 0.998, t0 + decay);

    const voiceGain = audioCtx.createGain();
    voiceGain.gain.value = 0;
    const voiceFilter = audioCtx.createBiquadFilter();
    voiceFilter.type = "lowpass";
    voiceFilter.frequency.setValueAtTime(3600, t0);
    voiceFilter.Q.value = 0.5;

    osc.connect(voiceFilter);
    voiceFilter.connect(voiceGain);
    voiceGain.connect(bus.dry);

    const stopAt = scheduleDissiadaGainEnvelope(
      audioCtx,
      voiceGain,
      {
        ...config,
        startTime: 0,
        volume: config.volume * voiceShare,
      },
      0.008,
      t0,
    );
    tailEnd = Math.max(tailEnd, stopAt);
    osc.start(t0);
    osc.stop(stopAt + 0.05);
  }

  trackDissiadaHarmonic(tailEnd - noteT0);
}

export function playDissiadaNote(
  lane: number,
  quality: DissiadaHitQuality,
  combo = 0,
) {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = quality === "miss" ? DISSIADA_SOUND.noteMiss : DISSIADA_SOUND.note;
  const baseHz = DISSIADA_NOTE_HZ[Math.max(0, Math.min(3, lane))] ?? 261.63;
  const hz =
    quality === "perfect" || quality === "good"
      ? baseHz * 1.02
      : quality === "miss"
        ? baseHz * 0.82
        : baseHz;

  const baseWave: OscillatorType = quality === "miss" ? "sawtooth" : "triangle";
  const baseFilter = quality === "miss" ? 2400 : quality === "ok" ? 2400 : 3200;
  const baseVolume =
    quality === "good" ? 0.88 : quality === "ok" ? 0.78 : 1;
  scheduleDissiadaVoice(audioCtx, hz, quality, config, baseVolume, baseWave, baseFilter);

  if (quality === "miss" || quality === "ok") return;

  const harmonicVolume =
    DISSIADA_SOUND.harmonicVolume * (quality === "good" ? 0.72 : 1);
  const loadScale = dissiadaHarmonicLoadScale(combo, dissiadaActiveHarmonics);

  const activeHarmonics: DissiadaComboHarmonic[] = [];
  for (const harmonic of DISSIADA_COMBO_HARMONICS) {
    if (combo < harmonic.minCombo) continue;
    activeHarmonics.push(harmonic);
  }

  if (
    activeHarmonics.length > 0 &&
    dissiadaActiveHarmonics < DISSIADA_MAX_ACTIVE_HARMONICS
  ) {
    scheduleDissiadaHarmonicsForNote(
      audioCtx,
      hz,
      activeHarmonics,
      harmonicVolume * loadScale,
    );
  }
}

function scheduleTipTopFlapHarmonic(
  audioCtx: AudioContext,
  flapT0: number,
  baseHz: number,
  config: SoundTiming,
  semitones: number,
) {
  const t0 = flapT0 + config.startTime;
  const hz = baseHz * 2 ** (semitones / 12);
  const fadeIn = config.fadeIn ?? 0.008;
  const fadeOut = config.fadeOut ?? 0.05;
  const toneEnd = Math.max(t0 + fadeIn, t0 + config.duration - fadeOut);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  osc.type = "sine";
  osc.frequency.setValueAtTime(hz, t0);
  osc.frequency.exponentialRampToValueAtTime(hz * 0.9, toneEnd);
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const stopAt = scheduleFadedGainEnvelope(
    audioCtx,
    gain,
    { ...config, startTime: 0 },
    t0,
  );

  osc.start(t0);
  osc.stop(stopAt);
}

export function playTipTopFlap() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = TIPTOP_SOUND.flap;
  const { baseHz, noiseHz } = TIPTOP_FLAP_TONE;
  const t0 = audioCtx.currentTime + config.startTime;

  const noise = audioCtx.createBufferSource();
  noise.buffer = getNoise(audioCtx);
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(noiseHz, t0);
  noiseFilter.Q.value = 0.9;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  const noiseStop = scheduleFadedGainEnvelope(audioCtx, noiseGain, {
    ...config,
    volume: config.volume * 0.85,
  });

  const thump = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thumpGain.gain.value = 0;
  thump.type = "sine";
  thump.frequency.setValueAtTime(baseHz, t0);
  thump.frequency.exponentialRampToValueAtTime(baseHz * 0.38, t0 + config.endTime);
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  const thumpStop = scheduleFadedGainEnvelope(audioCtx, thumpGain, {
    ...config,
    volume: config.volume * 0.55,
  });

  noise.start(t0);
  noise.stop(noiseStop);
  thump.start(t0);
  thump.stop(thumpStop);

  const harmonicConfigs = [TIPTOP_SOUND.flapHarmonic1, TIPTOP_SOUND.flapHarmonic2];
  TIPTOP_FLAP_TONE.harmonics.forEach((harmonic, i) => {
    const harmonicConfig = harmonicConfigs[i];
    if (!harmonicConfig) return;
    scheduleTipTopFlapHarmonic(
      audioCtx,
      audioCtx.currentTime,
      baseHz,
      harmonicConfig,
      harmonic.semitones,
    );
  });
}

export function playTipTopHoleIn() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = TIPTOP_SOUND.holeIn;
  const t0 = audioCtx.currentTime + config.startTime;

  const roll = audioCtx.createBufferSource();
  roll.buffer = getNoise(audioCtx);
  const rollFilter = audioCtx.createBiquadFilter();
  rollFilter.type = "lowpass";
  rollFilter.frequency.setValueAtTime(900, t0);
  rollFilter.frequency.exponentialRampToValueAtTime(220, t0 + config.endTime * 0.85);
  const rollGain = audioCtx.createGain();
  roll.connect(rollFilter);
  rollFilter.connect(rollGain);
  rollGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, rollGain, {
    ...config,
    volume: config.volume * 0.45,
    endTime: config.endTime * 0.75,
  });

  const clink = audioCtx.createOscillator();
  const clinkGain = audioCtx.createGain();
  clink.type = "sine";
  const clinkAt = t0 + config.endTime * 0.72;
  clink.frequency.setValueAtTime(880, clinkAt);
  clink.frequency.exponentialRampToValueAtTime(520, clinkAt + 0.08);
  clink.connect(clinkGain);
  clinkGain.connect(audioCtx.destination);
  const clinkCfg: SoundTiming = {
    volume: config.volume * 0.7,
    startTime: config.endTime * 0.72,
    endTime: config.endTime * 0.72 + 0.1,
    duration: config.duration,
  };
  scheduleGainEnvelope(audioCtx, clinkGain, clinkCfg);

  roll.start(t0);
  roll.stop(t0 + config.duration);
  clink.start(clinkAt);
  clink.stop(t0 + config.duration);
}

export function playTipTopLaserZap() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = TIPTOP_SOUND.laserZap;
  const t0 = audioCtx.currentTime + config.startTime;

  const buzz = audioCtx.createOscillator();
  const buzzGain = audioCtx.createGain();
  buzzGain.gain.value = 0;
  buzz.type = "sawtooth";
  buzz.frequency.setValueAtTime(1400, t0);
  buzz.frequency.exponentialRampToValueAtTime(180, t0 + config.endTime);
  buzz.connect(buzzGain);
  buzzGain.connect(audioCtx.destination);
  const buzzStop = scheduleFadedGainEnvelope(audioCtx, buzzGain, {
    ...config,
    volume: config.volume * 0.7,
  });

  const spark = audioCtx.createBufferSource();
  spark.buffer = getNoise(audioCtx);
  const sparkFilter = audioCtx.createBiquadFilter();
  sparkFilter.type = "bandpass";
  sparkFilter.frequency.setValueAtTime(3200, t0);
  sparkFilter.frequency.exponentialRampToValueAtTime(900, t0 + config.endTime);
  sparkFilter.Q.value = 1.4;
  const sparkGain = audioCtx.createGain();
  sparkGain.gain.value = 0;
  spark.connect(sparkFilter);
  sparkFilter.connect(sparkGain);
  sparkGain.connect(audioCtx.destination);
  const sparkStop = scheduleFadedGainEnvelope(audioCtx, sparkGain, {
    ...config,
    volume: config.volume * 0.55,
  });

  buzz.start(t0);
  buzz.stop(buzzStop);
  spark.start(t0);
  spark.stop(sparkStop);
}

export function playTipTopSawSlice() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = TIPTOP_SOUND.sawSlice;
  const t0 = audioCtx.currentTime + config.startTime;

  const slice = audioCtx.createBufferSource();
  slice.buffer = getNoise(audioCtx);
  const sliceFilter = audioCtx.createBiquadFilter();
  sliceFilter.type = "bandpass";
  sliceFilter.frequency.setValueAtTime(2400, t0);
  sliceFilter.frequency.exponentialRampToValueAtTime(600, t0 + config.endTime);
  sliceFilter.Q.value = 2.2;
  const sliceGain = audioCtx.createGain();
  sliceGain.gain.value = 0;
  slice.connect(sliceFilter);
  sliceFilter.connect(sliceGain);
  sliceGain.connect(audioCtx.destination);
  const sliceStop = scheduleFadedGainEnvelope(audioCtx, sliceGain, {
    ...config,
    volume: config.volume * 0.75,
  });

  const ring = audioCtx.createOscillator();
  const ringGain = audioCtx.createGain();
  ringGain.gain.value = 0;
  ring.type = "triangle";
  ring.frequency.setValueAtTime(680, t0);
  ring.frequency.exponentialRampToValueAtTime(320, t0 + config.endTime * 0.7);
  ring.connect(ringGain);
  ringGain.connect(audioCtx.destination);
  const ringStop = scheduleFadedGainEnvelope(audioCtx, ringGain, {
    ...config,
    volume: config.volume * 0.35,
    duration: config.duration * 0.85,
    endTime: config.endTime * 0.85,
  });

  slice.start(t0);
  slice.stop(sliceStop);
  ring.start(t0);
  ring.stop(ringStop);
}

const sampleBuffers = new Map<string, AudioBuffer>();
let octaneSamplesReady: Promise<void> | null = null;

function clampClip(buffer: AudioBuffer, config: SampleClip) {
  const start = Math.min(Math.max(0, config.startTime), buffer.duration - 0.05);
  const end = Math.min(Math.max(start + 0.1, config.endTime), buffer.duration);
  return { start, end };
}

async function ensureOctaneSamples(audioCtx: AudioContext): Promise<void> {
  if (octaneSamplesReady) return octaneSamplesReady;
  octaneSamplesReady = (async () => {
    const urls = [...new Set(Object.values(OCTANE_SAMPLES).map((c) => c.src))];
    await Promise.all(
      urls.map(async (src) => {
        if (sampleBuffers.has(src)) return;
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to load ${src}`);
        const arr = await res.arrayBuffer();
        sampleBuffers.set(src, await audioCtx.decodeAudioData(arr));
      }),
    );
  })();
  return octaneSamplesReady;
}

function playClip(audioCtx: AudioContext, config: SampleClip, playbackRate = 1) {
  const buffer = sampleBuffers.get(config.src);
  if (!buffer) return;

  const { start: clipStart, end: clipEnd } = clampClip(buffer, config);
  const playLen = Math.min(config.duration, clipEnd - clipStart);
  if (playLen <= 0.02) return;

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  source.connect(gain);
  gain.connect(audioCtx.destination);

  const t0 = audioCtx.currentTime;
  const peak = Math.max(0.0001, config.volume);
  const fadeAt = t0 + Math.max(0.02, playLen - 0.14);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  gain.gain.setValueAtTime(peak, fadeAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + playLen);

  source.start(t0, clipStart, playLen);
  source.stop(t0 + playLen + 0.05);
}

function startSampleLoop(
  audioCtx: AudioContext,
  config: SampleClip,
): { source: AudioBufferSourceNode; gain: GainNode } | null {
  const buffer = sampleBuffers.get(config.src);
  if (!buffer) return null;

  const { start, end } = clampClip(buffer, config);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = start;
  source.loopEnd = end;
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(0, start);
  return { source, gain };
}

export function playOctaneRevShift(gear: number) {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = OCTANE_SOUND.revShift;
  const pitch = OCTANE_REV_GEAR_PITCH[Math.min(gear, OCTANE_REV_GEAR_PITCH.length - 1)] ?? 1;
  const t0 = audioCtx.currentTime;
  const base = 90 * pitch;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(base, t0);
  osc.frequency.exponentialRampToValueAtTime(base * 2.8, t0 + config.endTime * 0.55);
  osc.frequency.exponentialRampToValueAtTime(base * 1.1, t0 + config.endTime);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(600, t0);
  filter.frequency.exponentialRampToValueAtTime(2200, t0 + config.endTime * 0.5);
  filter.frequency.exponentialRampToValueAtTime(500, t0 + config.endTime);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, gain, config);
  osc.start(t0);
  osc.stop(t0 + config.duration);
}

export function playOctaneNitroPerfect() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const nitroCfg = OCTANE_SOUND.nitroPerfect;
  const sweepCfg = OCTANE_SOUND.nitroSweep;
  const t0 = audioCtx.currentTime;

  const burst = audioCtx.createOscillator();
  const burstGain = audioCtx.createGain();
  const burstFilter = audioCtx.createBiquadFilter();
  burst.type = "sawtooth";
  burst.frequency.setValueAtTime(160, t0);
  burst.frequency.exponentialRampToValueAtTime(680, t0 + nitroCfg.endTime * 0.45);
  burst.frequency.exponentialRampToValueAtTime(220, t0 + nitroCfg.endTime);
  burstFilter.type = "lowpass";
  burstFilter.frequency.setValueAtTime(900, t0);
  burstFilter.frequency.exponentialRampToValueAtTime(2800, t0 + nitroCfg.endTime * 0.4);
  burst.connect(burstFilter);
  burstFilter.connect(burstGain);
  burstGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, burstGain, nitroCfg);
  burst.start(t0);
  burst.stop(t0 + nitroCfg.duration);

  const whoosh = audioCtx.createBufferSource();
  whoosh.buffer = getNoise(audioCtx);
  const whooshFilter = audioCtx.createBiquadFilter();
  whooshFilter.type = "bandpass";
  const whooshT0 = t0 + sweepCfg.startTime;
  whooshFilter.frequency.setValueAtTime(400, whooshT0);
  whooshFilter.frequency.exponentialRampToValueAtTime(1800, whooshT0 + sweepCfg.endTime * 0.6);
  whooshFilter.Q.value = 1.2;
  const whooshGain = audioCtx.createGain();
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, whooshGain, sweepCfg);

  const sweep = audioCtx.createOscillator();
  const sweepGain = audioCtx.createGain();
  sweep.type = "square";
  sweep.frequency.setValueAtTime(120, whooshT0);
  sweep.frequency.exponentialRampToValueAtTime(520, whooshT0 + sweepCfg.endTime * 0.45);
  sweep.connect(sweepGain);
  sweepGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, sweepGain, sweepCfg);

  whoosh.start(whooshT0);
  whoosh.stop(whooshT0 + sweepCfg.duration);
  sweep.start(whooshT0);
  sweep.stop(whooshT0 + sweepCfg.duration);
}

export function playOctaneBadShift() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = OCTANE_SOUND.badShift;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + config.endTime);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, gain, config);
  osc.start(t0);
  osc.stop(t0 + config.duration);
}

export interface OctaneBrakeHandle {
  update: (brakeDown: boolean, mph: number) => void;
  stop: () => void;
}

/** Looping tire screech while the brake pedal is held. */
export function createOctaneBrakeSound(): OctaneBrakeHandle | null {
  const audioCtx = ctx();
  if (!audioCtx) return null;

  let stopped = false;
  const noise = audioCtx.createBufferSource();
  const noiseGain = audioCtx.createGain();
  const highpass = audioCtx.createBiquadFilter();
  const bandpass = audioCtx.createBiquadFilter();

  noise.buffer = getNoise(audioCtx);
  noise.loop = true;
  highpass.type = "highpass";
  highpass.frequency.value = 520;
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 2.2;
  noiseGain.gain.value = 0;

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start();

  return {
    update(brakeDown, mph) {
      if (stopped) return;
      const t = audioCtx.currentTime;
      const speedFactor = Math.min(1, mph / 130);
      const target =
        brakeDown && mph > 0.5
          ? OCTANE_SOUND.brake.volume * (0.18 + speedFactor * 0.82)
          : 0.0001;

      noiseGain.gain.setTargetAtTime(target, t, 0.045);
      bandpass.frequency.setTargetAtTime(850 + speedFactor * 2400, t, 0.05);
      bandpass.Q.setTargetAtTime(1.4 + speedFactor * 2.4, t, 0.05);
      highpass.frequency.setTargetAtTime(420 + speedFactor * 500, t, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = audioCtx.currentTime;
      noiseGain.gain.setTargetAtTime(0.0001, t, 0.04);
      noise.stop(t + 0.12);
    },
  };
}

export function playOctaneBrakeChirp(mph: number) {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = OCTANE_SOUND.brake;
  const speedFactor = Math.min(1, mph / 130);
  const t0 = audioCtx.currentTime;

  const noise = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  noise.buffer = getNoise(audioCtx);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(700 + speedFactor * 2600, t0);
  filter.Q.value = 2.8;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, gain, {
    ...config,
    volume: config.volume * (0.35 + speedFactor * 0.65),
  });
  noise.start(t0);
  noise.stop(t0 + config.duration);
}

/** Call on first user input so car samples are decoded before shifting. */
export function preloadOctaneAudio() {
  const audioCtx = ctx();
  if (audioCtx) void ensureOctaneSamples(audioCtx);
}

export interface OctaneEngineHandle {
  update: (rpm: number, gasDown: boolean, gear: number) => void;
  stop: () => void;
}

/** Continuous engine: CarIdle base + procedural rumble + CarRev at redline. */
export function createOctaneEngineSound(): OctaneEngineHandle | null {
  const audioCtx = ctx();
  if (!audioCtx) return null;

  let stopped = false;
  let idleGain: GainNode | null = null;
  let idleSource: AudioBufferSourceNode | null = null;
  let revGain: GainNode | null = null;
  let revSource: AudioBufferSourceNode | null = null;

  const rumble = audioCtx.createOscillator();
  const rumbleGain = audioCtx.createGain();
  const noise = audioCtx.createBufferSource();
  const noiseGain = audioCtx.createGain();
  const noiseFilter = audioCtx.createBiquadFilter();

  rumble.type = "sawtooth";
  rumble.frequency.value = 55;
  rumbleGain.gain.value = 0;

  noise.buffer = getNoise(audioCtx);
  noise.loop = true;
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 400;
  noiseGain.gain.value = 0;

  rumble.connect(rumbleGain);
  rumbleGain.connect(audioCtx.destination);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);

  rumble.start();
  noise.start();

  void ensureOctaneSamples(audioCtx).then(() => {
    if (stopped) return;

    playClip(audioCtx, OCTANE_SAMPLES.startup);

    const idle = startSampleLoop(audioCtx, OCTANE_SAMPLES.idle);
    const rev = startSampleLoop(audioCtx, OCTANE_SAMPLES.revLoop);
    if (!idle || !rev) return;

    idleSource = idle.source;
    idleGain = idle.gain;
    revSource = rev.source;
    revGain = rev.gain;

    const t = audioCtx.currentTime;
    idleGain.gain.setValueAtTime(OCTANE_SAMPLES.idle.volume * 0.4, t);
    revGain.gain.setValueAtTime(0, t);
  });

  return {
    update(rpm: number, gasDown: boolean, gear: number) {
      if (stopped) return;

      const rev = Math.min(1, rpm / OCTANE_REDLINE.end);
      const redlineT = Math.max(
        0,
        Math.min(1, (rpm - OCTANE_REDLINE.start) / (OCTANE_REDLINE.end - OCTANE_REDLINE.start)),
      );
      const gearBoost = 1 + (gear - 1) * 0.06;
      const t = audioCtx.currentTime;
      const isIdling = !gasDown;
      const synthMix = isIdling ? OCTANE_IDLE_MIX.synthOffGas : OCTANE_IDLE_MIX.synthOnGas;

      if (idleGain) {
        const idleMix = isIdling
          ? OCTANE_IDLE_MIX.idleOffGas
          : OCTANE_IDLE_MIX.idleOnGas * (0.55 + (1 - rev) * 0.35);
        idleGain.gain.setTargetAtTime(OCTANE_SAMPLES.idle.volume * idleMix, t, 0.06);
      }

      if (revGain && revSource) {
        const revCfg = OCTANE_SAMPLES.revLoop;
        const revMul = isIdling ? OCTANE_IDLE_MIX.revOffGas : 1;
        const revTarget = revCfg.volume * redlineT * revMul;
        revGain.gain.setTargetAtTime(revTarget, t, 0.05);
        const rate = 0.92 + redlineT * 0.12;
        revSource.playbackRate.setTargetAtTime(rate, t, 0.06);
      }

      const targetRumble =
        (gasDown ? OCTANE_SOUND.engine.volume : OCTANE_SOUND.engineIdle.volume) *
        (0.35 + rev * 0.85) *
        gearBoost *
        synthMix;
      const targetNoise =
        (gasDown ? OCTANE_SOUND.engine.volume : OCTANE_SOUND.engineIdle.volume) *
        (0.2 + rev * 0.55) *
        gearBoost *
        synthMix;
      const freq = 42 + rev * 110 + gear * 8;

      rumbleGain.gain.setTargetAtTime(targetRumble, t, 0.06);
      noiseGain.gain.setTargetAtTime(targetNoise, t, 0.06);
      rumble.frequency.setTargetAtTime(freq, t, 0.05);
      noiseFilter.frequency.setTargetAtTime(280 + rev * 1400, t, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = audioCtx.currentTime;
      idleGain?.gain.setTargetAtTime(0.0001, t, 0.05);
      revGain?.gain.setTargetAtTime(0.0001, t, 0.05);
      rumbleGain.gain.setTargetAtTime(0.0001, t, 0.04);
      noiseGain.gain.setTargetAtTime(0.0001, t, 0.04);
      idleSource?.stop(t + 0.2);
      revSource?.stop(t + 0.2);
      rumble.stop(t + 0.15);
      noise.stop(t + 0.15);
    },
  };
}
