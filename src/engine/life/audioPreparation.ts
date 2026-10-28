import { AUDIO_PEAK_LIMIT, synthSample } from "./audioSynthesis";
import type { AudioWeather } from "./audioTypes";
const sampleRate = 48000;
const length = sampleRate * 6;
const ready = new Map<AudioWeather, Float32Array>();
const pending = new Map<AudioWeather, { samples: Float32Array; index: number; seed: number }>();
let owners = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const keyFor = (weather: AudioWeather): AudioWeather => (weather === "clear" ? "sunny" : weather);
function schedule() {
  if (!owners || timer !== undefined || !pending.size) return;
  timer = setTimeout(() => {
    timer = undefined;
    const entry = pending.entries().next().value;
    if (!entry) return;
    const [weather, job] = entry;
    // A bounded slice leaves input/render tasks a chance to run between chunks.
    const end = Math.min(length - 1, job.index + 2048);
    for (; job.index < end; job.index++) {
      job.seed = (1664525 * job.seed + 1013904223) >>> 0;
      const noise = ((job.seed / 0xffffffff) * 2 - 1) * 0.42;
      job.samples[job.index] = Math.max(
        -AUDIO_PEAK_LIMIT,
        Math.min(
          AUDIO_PEAK_LIMIT,
          synthSample(job.index / sampleRate, weather) + Math.fround(noise) * 0.12,
        ),
      );
    }
    if (job.index === length - 1) {
      job.samples[length - 1] = job.samples[0]!;
      ready.set(weather, job.samples);
      pending.delete(weather);
    }
    schedule();
  }, 0);
}
/** Bounded public synthetic PCM cache, shared across route mounts; never an AudioContext. */
export function acquireAudioPreparation() {
  owners++;
  let disposed = false;
  return {
    prepare(weather: AudioWeather) {
      if (disposed) return;
      for (const key of [keyFor(weather), "rain" as const]) {
        if (!ready.has(key) && !pending.has(key))
          pending.set(key, {
            samples: new Float32Array(length),
            index: 0,
            seed: key === "sunny" ? 11 : key === "rain" ? 23 : 37,
          });
      }
      schedule();
    },
    buffer(context: AudioContext, weather: AudioWeather): AudioBuffer | null {
      const samples = ready.get(keyFor(weather));
      if (disposed || !samples) return null;
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      return buffer;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      owners--;
      if (!owners) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
