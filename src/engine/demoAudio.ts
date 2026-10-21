import { importLocalAudioFile } from "./life/audioImport";
import {
  AUDIO_PEAK_LIMIT,
  createSyntheticBuffer,
  DEFAULT_LIFE_SOURCES,
} from "./life/audioSynthesis";
import type {
  AudioDiagnostics,
  AudioLifeSource,
  AudioManifest,
  AudioPassby,
  AudioWeather,
  DemoAudio,
  DemoAudioOptions,
  DemoAudioSetOptions,
} from "./life/audioTypes";

export type {
  AudioDiagnostics,
  AudioLifeSource,
  AudioManifest,
  AudioPassby,
  AudioImportResult,
  AudioWeather,
  DemoAudio,
  DemoAudioOptions,
  DemoAudioSetOptions,
} from "./life/audioTypes";
export { importLocalAudioFile } from "./life/audioImport";
export { AUDIO_PEAK_LIMIT, createPeriodicNoise, synthSample } from "./life/audioSynthesis";

const MAX_VOICES = 8;
const MAX_IMPORT_BYTES = 1_000_000;

/** Synthetic, fixture-only ambience. It never opens a microphone, fetches audio, or persists files. */
export function createDemoAudio(options: DemoAudioOptions = {}): DemoAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambience: AudioBufferSourceNode | null = null;
  let ambienceGain: GainNode | null = null;
  let rain: AudioBufferSourceNode | null = null;
  let rainGain: GainNode | null = null;
  let importedSource: AudioBufferSourceNode | null = null;
  let importedGain: GainNode | null = null;
  let enabled = false;
  let weather: AudioWeather = options.initialWeather ?? "clear";
  let gestureSeen = false;
  let disposed = false;
  let activeVoices = 0;
  let activeNodeCount = 0;
  let totalNodeCount = 0;
  let imported: AudioManifest | null = null;
  let importRevision = 0;
  let lifeSources = [...(options.lifeSources ?? DEFAULT_LIFE_SOURCES)];
  let fixtureOnly = true;
  const layerMinutes = 0.1; // Six-second, bounded synthetic loops; UI minutes are a clock, not buffer duration.
  let timeMinutes = 420;
  const voices = new Set<OscillatorNode>();
  const listeners: Array<readonly [EventTarget, string, EventListener]> = [];

  const addListener = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  };

  const stopVoices = () => {
    for (const voice of voices) {
      try {
        voice.stop();
      } catch {
        // Ended voices are harmless; cleanup is idempotent.
      }
    }
    voices.clear();
    activeVoices = 0;
  };
  const pause = () => {
    if (context && master) master.gain.setTargetAtTime(0, context.currentTime, 0.02);
    if (context && context.state === "running") void context.suspend().catch(() => {});
    stopVoices();
  };
  const onVisibility = () => {
    if (document.hidden) pause();
  };
  const onPageHide = () => pause();
  if (typeof document !== "undefined") addListener(document, "visibilitychange", onVisibility);
  if (typeof window !== "undefined") addListener(window, "pagehide", onPageHide);

  const track = <T>(node: T): T => {
    totalNodeCount += 1;
    activeNodeCount += 1;
    return node;
  };

  function ensureContext(): AudioContext | null {
    if (disposed || !gestureSeen || context) return context;
    try {
      const factory = options.audioContextFactory ?? (() => new AudioContext());
      context = factory();
      master = track(context.createGain());
      // Keep all synthetic layers well below the peak bound; the compressor is not used as a brickwall.
      master.gain.value = enabled ? 0.22 : 0;
      const compressor = track(context.createDynamicsCompressor());
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      master.connect(compressor);
      compressor.connect(context.destination);

      ambience = track(context.createBufferSource());
      ambience.buffer = createSyntheticBuffer(context, weather, layerMinutes);
      ambience.loop = true;
      ambienceGain = track(context.createGain());
      ambienceGain.gain.value = 0.32;
      ambience.connect(ambienceGain);
      ambienceGain.connect(master);
      ambience.start();

      rain = track(context.createBufferSource());
      rain.buffer = createSyntheticBuffer(context, "rain", layerMinutes);
      rain.loop = true;
      rainGain = track(context.createGain());
      rainGain.gain.value = rainLevel(weather);
      rain.connect(rainGain);
      rainGain.connect(master);
      rain.start();
      return context;
    } catch {
      if (context) void context.close().catch(() => {});
      context = null;
      master = null;
      return null;
    }
  }

  function rainLevel(value: AudioWeather): number {
    return value === "rain" ? 0.2 : value === "storm" ? 0.28 : 0;
  }
  function ambientLevel(value: AudioWeather): number {
    const hour = timeMinutes / 60;
    const schedule =
      hour < 5 || hour >= 23
        ? 0.25
        : hour >= 11 && hour < 14
          ? 0.6
          : (hour >= 6 && hour < 9) || (hour >= 16 && hour < 19)
            ? 1
            : 0.8;
    return (
      schedule *
      (value === "storm" ? 0.22 : value === "rain" ? 0.24 : value === "cloudy" ? 0.28 : 0.32)
    );
  }
  function updateWeather(next: AudioWeather) {
    weather = next;
    if (!context || !ambienceGain || !rainGain) return;
    const now = context.currentTime;
    ambienceGain.gain.setTargetAtTime(ambientLevel(next), now, 0.25);
    rainGain.gain.setTargetAtTime(rainLevel(next), now, 0.25);
  }

  function set(nextEnabled: boolean, rainRequested: boolean, setOptions: DemoAudioSetOptions = {}) {
    enabled = nextEnabled;
    if (setOptions.minutes !== undefined && Number.isFinite(setOptions.minutes))
      timeMinutes = ((setOptions.minutes % 1440) + 1440) % 1440;
    fixtureOnly = setOptions.fixture ?? fixtureOnly;
    const selected = setOptions.weather ?? (rainRequested ? "rain" : "sunny");
    updateWeather(selected);
    if (!enabled) {
      pause();
      return;
    }
    const current = ensureContext();
    if (current && !(typeof document !== "undefined" && document.hidden)) {
      master?.gain.setTargetAtTime(0.22, current.currentTime, 0.05);
      if (current.state !== "running") void current.resume().catch(() => {});
    }
  }

  function gesture(): boolean {
    if (disposed) return false;
    gestureSeen = true;
    const current = ensureContext();
    if (!current) return false;
    if (
      enabled &&
      !(typeof document !== "undefined" && document.hidden) &&
      current.state !== "running"
    )
      void current.resume().catch(() => {});
    return true;
  }

  function passby(event: AudioPassby): boolean {
    const current = ensureContext();
    if (
      !current ||
      !master ||
      !enabled ||
      (typeof document !== "undefined" && document.hidden) ||
      (fixtureOnly && !event.sourceId)
    )
      return false;
    if (voices.size >= MAX_VOICES) return false;
    const source = event.sourceId
      ? lifeSources.find((item) => item.id === event.sourceId)
      : undefined;
    if (fixtureOnly && event.sourceId && !source) return false;
    const distance = Math.hypot(event.position[0], event.position[1], event.position[2]);
    const radius = Math.max(1, source?.radius ?? 70);
    if (!Number.isFinite(distance) || distance > radius * 2) return false;
    const oscillator = track(current.createOscillator());
    oscillator.type = event.kind === "bird" ? "sine" : "triangle";
    oscillator.frequency.value =
      event.kind === "bird" ? 1250 : event.kind === "bicycle" ? 220 : 110;
    const gain = track(current.createGain());
    const panner = track(current.createStereoPanner());
    panner.pan.value = Math.max(-1, Math.min(1, event.position[0] / radius));
    const level =
      Math.min(0.12, Math.max(0, event.level ?? 0.06)) * Math.max(0, 1 - distance / (radius * 2));
    const duration = Math.max(0.05, Math.min(10, (event.durationMs ?? 700) / 1000));
    gain.gain.setValueAtTime(0.0001, current.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level),
      current.currentTime + Math.min(0.025, duration / 3),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, current.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    activeVoices += 1;
    voices.add(oscillator);
    const cleanup = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      activeNodeCount = Math.max(0, activeNodeCount - 3);
      voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    oscillator.addEventListener("ended", cleanup, { once: true });
    oscillator.start();
    oscillator.stop(current.currentTime + duration);
    return true;
  }

  return {
    set,
    gesture,
    soundGesture: gesture,
    passby,
    setLifeSources(sources) {
      lifeSources = [...sources];
    },
    async importFile(file, expectedManifest) {
      const revision = ++importRevision;
      if (importedSource) {
        try {
          importedSource.stop();
        } catch {
          /* Already ended. */
        }
        importedSource.disconnect();
        importedGain?.disconnect();
        activeNodeCount = Math.max(0, activeNodeCount - 2);
        importedSource = null;
        importedGain = null;
      }
      const result = await importLocalAudioFile(
        file,
        options.maxImportBytes ?? MAX_IMPORT_BYTES,
        expectedManifest,
      );
      if (disposed || revision !== importRevision)
        return { ok: false, status: "fallback", reason: "decode-error" };
      imported = result.ok ? (result.manifest ?? null) : null;
      if (!result.ok || !gestureSeen || !context || !master) return result;
      try {
        const bytes = await file.arrayBuffer();
        const decoded = await context.decodeAudioData(bytes.slice(0));
        if (disposed || revision !== importRevision || !context || !master)
          return { ok: false, status: "fallback", reason: "decode-error" };
        importedSource = track(context.createBufferSource());
        importedSource.buffer = decoded;
        importedSource.loop = true;
        importedGain = track(context.createGain());
        importedGain.gain.value = 0.16;
        importedSource.connect(importedGain);
        importedGain.connect(master);
        importedSource.start();
        return result;
      } catch {
        imported = null;
        return { ok: false, status: "fallback", reason: "decode-error" };
      }
    },
    notifyPackageReplaced() {
      importRevision++;
      enabled = false;
      pause();
      imported = null;
      if (importedSource) {
        try {
          importedSource.stop();
        } catch {
          // Already stopped.
        }
        importedSource.disconnect();
        importedGain?.disconnect();
        activeNodeCount = Math.max(0, activeNodeCount - 2);
        importedSource = null;
        importedGain = null;
      }
    },
    suspend: pause,
    getDiagnostics() {
      return {
        contextCreated: context !== null,
        contextState:
          context?.state ?? (typeof AudioContext === "undefined" ? "unavailable" : "suspended"),
        contextCount: context ? 1 : 0,
        enabled,
        weather,
        activeVoices,
        listenerCount: listeners.length,
        nodeCount: context ? activeNodeCount : 0,
        totalNodeCount,
        imported,
        fallback: imported === null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      importRevision++;
      pause();
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
      listeners.length = 0;
      for (const node of [ambience, rain, importedSource]) {
        try {
          node?.stop();
        } catch {
          /* Already ended. */
        }
        node?.disconnect();
      }
      for (const node of [ambienceGain, rainGain, importedGain, master]) node?.disconnect();
      activeNodeCount = 0;
      const old = context;
      context = null;
      master = null;
      ambience = null;
      ambienceGain = null;
      rain = null;
      rainGain = null;
      importedSource = null;
      importedGain = null;
      if (old && typeof old.close === "function") void old.close().catch(() => {});
    },
  };
}
