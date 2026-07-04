import {
  DISSIADA_NOTE_HZ,
  DISSIADA_SOUND,
  OCTANE_REV_GEAR_PITCH,
  OCTANE_SOUND,
  TIPTOP_SOUND,
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

function makeNoiseBuffer(audioCtx: AudioContext, seconds = 1): AudioBuffer {
  const len = Math.ceil(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let noiseBuffer: AudioBuffer | null = null;

function getNoise(audioCtx: AudioContext): AudioBuffer {
  if (!noiseBuffer) noiseBuffer = makeNoiseBuffer(audioCtx);
  return noiseBuffer;
}

export function playDissiadaNote(lane: number, quality: "perfect" | "good" | "miss") {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = quality === "miss" ? DISSIADA_SOUND.noteMiss : DISSIADA_SOUND.note;
  const baseHz = DISSIADA_NOTE_HZ[Math.max(0, Math.min(3, lane))] ?? 261.63;
  const hz =
    quality === "perfect" ? baseHz * 1.02 : quality === "miss" ? baseHz * 0.82 : baseHz;

  const t0 = audioCtx.currentTime + config.startTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = quality === "miss" ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(hz, t0);
  if (quality === "perfect") {
    osc.frequency.exponentialRampToValueAtTime(hz * 0.998, t0 + config.endTime);
  } else if (quality !== "miss") {
    osc.frequency.exponentialRampToValueAtTime(hz * 0.55, t0 + config.endTime);
  }

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(quality === "perfect" ? 3200 : 2400, t0);
  filter.Q.value = 0.7;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, gain, config);

  osc.start(t0);
  osc.stop(t0 + config.duration);
}

export function playTipTopFlap() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = TIPTOP_SOUND.flap;
  const t0 = audioCtx.currentTime + config.startTime;

  const noise = audioCtx.createBufferSource();
  noise.buffer = getNoise(audioCtx);
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(420, t0);
  noiseFilter.Q.value = 0.9;
  const noiseGain = audioCtx.createGain();
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, noiseGain, {
    ...config,
    volume: config.volume * 0.85,
  });

  const thump = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(180, t0);
  thump.frequency.exponentialRampToValueAtTime(70, t0 + config.endTime);
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, thumpGain, {
    ...config,
    volume: config.volume * 0.55,
  });

  noise.start(t0);
  noise.stop(t0 + config.duration);
  thump.start(t0);
  thump.stop(t0 + config.duration);
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

export function playOctaneRevShift(gear: number) {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = OCTANE_SOUND.revShift;
  const pitch = OCTANE_REV_GEAR_PITCH[Math.min(gear, OCTANE_REV_GEAR_PITCH.length - 1)] ?? 1;
  const t0 = audioCtx.currentTime + config.startTime;
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

  const config = OCTANE_SOUND.nitroPerfect;
  const t0 = audioCtx.currentTime + config.startTime;

  const whoosh = audioCtx.createBufferSource();
  whoosh.buffer = getNoise(audioCtx);
  const whooshFilter = audioCtx.createBiquadFilter();
  whooshFilter.type = "bandpass";
  whooshFilter.frequency.setValueAtTime(400, t0);
  whooshFilter.frequency.exponentialRampToValueAtTime(1800, t0 + config.endTime * 0.6);
  whooshFilter.Q.value = 1.2;
  const whooshGain = audioCtx.createGain();
  whoosh.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, whooshGain, config);

  const sweep = audioCtx.createOscillator();
  const sweepGain = audioCtx.createGain();
  sweep.type = "square";
  sweep.frequency.setValueAtTime(120, t0);
  sweep.frequency.exponentialRampToValueAtTime(520, t0 + config.endTime * 0.45);
  sweep.connect(sweepGain);
  sweepGain.connect(audioCtx.destination);
  scheduleGainEnvelope(audioCtx, sweepGain, {
    ...config,
    volume: config.volume * 0.35,
  });

  whoosh.start(t0);
  whoosh.stop(t0 + config.duration);
  sweep.start(t0);
  sweep.stop(t0 + config.duration);
}

export function playOctaneBadShift() {
  const audioCtx = ctx();
  if (!audioCtx) return;

  const config = OCTANE_SOUND.badShift;
  const t0 = audioCtx.currentTime + config.startTime;
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

export interface OctaneEngineHandle {
  update: (rpm: number, gasDown: boolean, gear: number) => void;
  stop: () => void;
}

/** Continuous engine rumble — call `update` each frame, `stop` on unmount. */
export function createOctaneEngineSound(): OctaneEngineHandle | null {
  const audioCtx = ctx();
  if (!audioCtx) return null;

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

  let stopped = false;

  return {
    update(rpm: number, gasDown: boolean, gear: number) {
      if (stopped) return;
      const rev = Math.min(1, rpm / 9000);
      const gearBoost = 1 + (gear - 1) * 0.06;
      const targetRumble =
        (gasDown ? OCTANE_SOUND.engine.volume : OCTANE_SOUND.engineIdle.volume) *
        (0.35 + rev * 0.85) *
        gearBoost;
      const targetNoise =
        (gasDown ? OCTANE_SOUND.engine.volume : OCTANE_SOUND.engineIdle.volume) *
        (0.2 + rev * 0.55) *
        gearBoost;
      const freq = 42 + rev * 110 + gear * 8;

      const t = audioCtx.currentTime;
      rumbleGain.gain.setTargetAtTime(targetRumble, t, 0.06);
      noiseGain.gain.setTargetAtTime(targetNoise, t, 0.06);
      rumble.frequency.setTargetAtTime(freq, t, 0.05);
      noiseFilter.frequency.setTargetAtTime(280 + rev * 1400, t, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = audioCtx.currentTime;
      rumbleGain.gain.setTargetAtTime(0.0001, t, 0.04);
      noiseGain.gain.setTargetAtTime(0.0001, t, 0.04);
      rumble.stop(t + 0.15);
      noise.stop(t + 0.15);
    },
  };
}
