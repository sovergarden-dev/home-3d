export type AudioWeather = "sunny" | "cloudy" | "rain" | "storm" | "clear";

export interface AudioLifeSource {
  id: string;
  name: string;
  kind?: "bird" | "bicycle" | "scooter" | "car" | "ambient";
  position: readonly [number, number, number];
  radius?: number;
}

export interface AudioPassby {
  sourceId?: string;
  name?: string;
  kind?: AudioLifeSource["kind"];
  position: readonly [number, number, number];
  velocity?: readonly [number, number, number];
  durationMs?: number;
  level?: number;
}

export interface AudioManifest {
  name: string;
  size: number;
  type: string;
  sha256: string;
}

export interface AudioImportResult {
  ok: boolean;
  status: "imported" | "fallback";
  manifest?: AudioManifest;
  reason?:
    | "unsupported-type"
    | "too-large"
    | "read-error"
    | "hash-unavailable"
    | "manifest-mismatch"
    | "decode-error";
}

export interface AudioDiagnostics {
  contextCreated: boolean;
  contextState: AudioContextState | "unavailable";
  contextCount: number;
  enabled: boolean;
  weather: AudioWeather;
  activeVoices: number;
  listenerCount: number;
  nodeCount: number;
  totalNodeCount: number;
  imported: AudioManifest | null;
  fallback: boolean;
}

export interface DemoAudioOptions {
  audioContextFactory?: () => AudioContext;
  maxImportBytes?: number;
  lifeSources?: readonly AudioLifeSource[];
  initialWeather?: AudioWeather;
}

export interface DemoAudioSetOptions {
  minutes?: number;
  weather?: "sunny" | "cloudy" | "rain" | "storm";
  fixture?: boolean;
}

export interface DemoAudio {
  set(enabled: boolean, rain: boolean, options?: DemoAudioSetOptions): void;
  /** Call from a trusted user sound gesture (pointer/key/click). */
  gesture(): boolean;
  soundGesture(): boolean;
  passby(event: AudioPassby): boolean;
  setLifeSources(sources: readonly AudioLifeSource[]): void;
  importFile(file: File, expectedManifest?: unknown): Promise<AudioImportResult>;
  notifyPackageReplaced(): void;
  suspend(): void;
  getDiagnostics(): AudioDiagnostics;
  dispose(): void;
}
