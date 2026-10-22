import type { AudioLifeSource, AudioWeather } from "./audioTypes";

export const AUDIO_PEAK_LIMIT = 0.9;
export const DEFAULT_LIFE_SOURCES: readonly AudioLifeSource[] = [
  { id: "fixture-bird-1", name: "Chim sẻ minh họa", kind: "bird", position: [12, 3, -8] },
  { id: "fixture-bicycle-1", name: "Xe đạp minh họa", kind: "bicycle", position: [-18, 1, 9] },
  { id: "fixture-scooter-1", name: "Xe máy minh họa", kind: "scooter", position: [26, 1, 16] },
];

/** A deterministic, periodic signal: its first and last sample are identical. */
export function createPeriodicNoise(length: number, seed = 0x9e3779b9): Float32Array {
  const output = new Float32Array(Math.max(2, Math.floor(length)));
  let state = seed >>> 0;
  for (let i = 0; i < output.length - 1; i += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    output[i] = ((state / 0xffffffff) * 2 - 1) * 0.42;
  }
  output[output.length - 1] = output[0] ?? 0;
  return output;
}

export function synthSample(time: number, weather: AudioWeather): number {
  const hum = Math.sin(time * Math.PI * 2 * 95) * 0.08;
  const breeze = Math.sin((time * Math.PI * 2) / 6) * 0.06;
  const rain =
    weather === "clear" || weather === "sunny" || weather === "cloudy"
      ? 0
      : Math.sin(time * Math.PI * 2 * 13.5) * 0.1;
  const storm = weather === "storm" ? Math.sin(time * Math.PI * 2 * 2) * 0.08 : 0;
  return Math.max(-AUDIO_PEAK_LIMIT, Math.min(AUDIO_PEAK_LIMIT, hum + breeze + rain + storm));
}

export function createSyntheticBuffer(
  context: AudioContext,
  weather: AudioWeather,
  minutes = 1,
): AudioBuffer {
  const seconds = Math.max(0.1, Math.min(60, minutes * 60));
  const length = Math.max(2, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const noise = createPeriodicNoise(
    length,
    weather === "clear" || weather === "sunny" ? 11 : weather === "rain" ? 23 : 37,
  );
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.max(
      -AUDIO_PEAK_LIMIT,
      Math.min(AUDIO_PEAK_LIMIT, synthSample(i / context.sampleRate, weather) + noise[i]! * 0.12),
    );
  }
  samples[samples.length - 1] = samples[0] ?? 0;
  return buffer;
}
