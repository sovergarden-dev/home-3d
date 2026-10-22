export interface ProcessedAudio {
  dataUrl: string;
  duration: number;
  mime: "audio/wav" | "audio/x-wav" | "audio/ogg" | "audio/mp4" | "audio/mpeg" | "audio/webm";
}
const AUDIO_MIMES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/webm",
]);
let active: HTMLAudioElement | null = null;
let removers: Array<() => void> = [];
const diagnostics = { listenersAdded: 0, listenersRemoved: 0 };
export function getAudioDiagnostics() {
  return { ...diagnostics };
}
function cleanup() {
  for (const remove of removers) {
    remove();
    diagnostics.listenersRemoved++;
  }
  removers = [];
  if (active) {
    active.pause();
    active.removeAttribute("src");
    active.load();
    active = null;
  }
}
function toDataUrl(blob: Blob) {
  return new Promise<string>((res, rej) => {
    if (typeof FileReader === "undefined") return rej(new Error("DATA_URL_UNAVAILABLE"));
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? res(r.result) : rej(new Error("READ_FAILED")));
    r.onerror = () => rej(r.error ?? new Error("READ_FAILED"));
    r.readAsDataURL(blob);
  });
}
function waitForMetadata(audio: HTMLAudioElement, timeoutMs = 5000) {
  return new Promise<number>((resolve, reject) => {
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", done);
      audio.removeEventListener("durationchange", done);
      audio.removeEventListener("error", fail);
      diagnostics.listenersRemoved += 3;
    };
    const done = () => {
      remove();
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) resolve(d);
      else reject(new Error("AUDIO_DURATION_UNVERIFIABLE"));
    };
    const fail = () => {
      remove();
      reject(new Error("AUDIO_DECODE_FAILED"));
    };
    const timer = setTimeout(() => {
      remove();
      reject(new Error("AUDIO_METADATA_TIMEOUT"));
    }, timeoutMs);
    audio.addEventListener("loadedmetadata", done);
    audio.addEventListener("durationchange", done);
    audio.addEventListener("error", fail);
    diagnostics.listenersAdded += 3;
    audio.load();
  });
}
export async function processAudio(file: Blob): Promise<ProcessedAudio> {
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new Error("AUDIO_TOO_LARGE");
  const mime = file.type.toLowerCase();
  if (!AUDIO_MIMES.has(mime)) throw new Error("UNSUPPORTED_AUDIO_TYPE");
  const typedMime = mime as ProcessedAudio["mime"];
  if (typeof Audio === "undefined" || typeof URL === "undefined")
    throw new Error("AUDIO_UNAVAILABLE");
  const url = URL.createObjectURL(file),
    audio = new Audio();
  audio.preload = "metadata";
  audio.src = url;
  try {
    const duration = await waitForMetadata(audio);
    if (duration > 60) throw new Error("AUDIO_TOO_LONG");
    return { dataUrl: await toDataUrl(file), duration, mime: typedMime };
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
export async function playMemoryAudio(source: string | ProcessedAudio): Promise<void> {
  cleanup();
  if (typeof Audio === "undefined") throw new Error("AUDIO_UNAVAILABLE");
  const audio = new Audio(typeof source === "string" ? source : source.dataUrl);
  audio.preload = "auto";
  active = audio;
  const stop = () => cleanup();
  const ended = () => cleanup();
  for (const [target, event, fn] of [
    [typeof document !== "undefined" ? document : null, "visibilitychange", stop],
    [typeof window !== "undefined" ? window : null, "pagehide", stop],
    [typeof window !== "undefined" ? window : null, "popstate", stop],
    [audio, "ended", ended],
  ] as const) {
    if (target) {
      target.addEventListener(event, fn);
      removers.push(() => target.removeEventListener(event, fn));
      diagnostics.listenersAdded++;
    }
  }
  try {
    await audio.play();
  } catch (e) {
    cleanup();
    throw e;
  }
}
export function stopMemoryAudio() {
  cleanup();
}
