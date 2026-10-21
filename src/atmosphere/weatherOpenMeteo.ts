import type { WorldDataProvider, WorldSessionSnapshot } from "@/world/privateWorldSession";
import type { PackageGeoreference } from "@/world/packageGeoreference";

export const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const WEATHER_TIMEZONE = "Asia/Ho_Chi_Minh";
export const WEATHER_UTC_OFFSET_SECONDS = 25200;
export const CURRENT_WEATHER_VARIABLES = ["temperature_2m", "weather_code"] as const;
export const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

export type WeatherKind = "sunny" | "cloudy" | "rain" | "storm";
export type WeatherStatus = "off" | "loading" | "ready" | "stale" | "error" | "timeout" | "offline";
export type WeatherErrorCode =
  | "BLOCKED_MISSING_GEOREFERENCE"
  | "REAL_WORLD_NOT_VERIFIED"
  | "CONSENT_REQUIRED"
  | "HISTORICAL_OR_FUTURE_NOT_SUPPORTED"
  | "MALFORMED_RESPONSE"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "OFFLINE"
  | "ABORTED";

export interface WeatherReading {
  kind: WeatherKind;
  timestamp: string;
  temperatureC: number;
  relativeHumidity?: number;
  apparentTemperatureC?: number;
  isDay?: boolean;
  precipitationMm?: number;
  rainMm?: number;
  showersMm?: number;
  snowfallCm?: number;
  weatherCode: number;
  cloudCover?: number;
  windSpeedKmh?: number;
  windDirection?: number;
  timezone: typeof WEATHER_TIMEZONE;
  source: "open-meteo";
}

export interface WeatherSnapshot {
  status: WeatherStatus;
  reading?: WeatherReading;
  errorCode?: WeatherErrorCode;
  packageEpoch: number;
  consented: boolean;
}

export interface WeatherAdapterOptions {
  provider: WorldDataProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  now?: () => Date;
}

const validWmo = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86,
  95, 96, 99,
]);
export function classifyWmoCode(code: number): WeatherKind | null {
  if (!Number.isInteger(code) || !validWmo.has(code)) return null;
  if (code <= 1) return "sunny";
  if (code <= 48) return "cloudy";
  if (code >= 95) return "storm";
  return "rain";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return finite(value) && value >= min && value <= max;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function localDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEATHER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function parseLocalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  const parts = value.split("T");
  const datePart = parts[0];
  const timePart = parts[1];
  if (!datePart || !timePart) return null;
  const dateValues = datePart.split("-").map(Number);
  const timeValues = timePart.split(":").map(Number);
  const year = dateValues[0];
  const month = dateValues[1];
  const day = dateValues[2];
  const hour = timeValues[0];
  const minute = timeValues[1];
  const second = timeValues[2] ?? 0;
  if (
    [year, month, day, hour, minute, second].some(
      (item) => item === undefined || !Number.isInteger(item),
    )
  )
    return null;
  const check = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month! - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  )
    return null;
  return value;
}

export function parseOpenMeteoCurrent(payload: unknown): WeatherReading {
  if (
    !record(payload) ||
    payload["timezone"] !== WEATHER_TIMEZONE ||
    payload["utc_offset_seconds"] !== WEATHER_UTC_OFFSET_SECONDS ||
    !record(payload["current"]) ||
    !record(payload["current_units"])
  )
    throw new Error("MALFORMED_RESPONSE");
  const current = payload["current"] as Record<string, unknown>;
  const units = payload["current_units"] as Record<string, unknown>;
  if (units["temperature_2m"] !== "°C" || units["weather_code"] !== "wmo code")
    throw new Error("MALFORMED_RESPONSE");
  const timestamp = parseLocalTimestamp(current["time"]);
  if (
    !timestamp ||
    !bounded(current["temperature_2m"], -100, 100) ||
    !finite(current["weather_code"]) ||
    !classifyWmoCode(current["weather_code"])
  )
    throw new Error("MALFORMED_RESPONSE");
  return {
    kind: classifyWmoCode(current["weather_code"])!,
    timestamp,
    temperatureC: current["temperature_2m"],
    weatherCode: current["weather_code"],
    timezone: WEATHER_TIMEZONE,
    source: "open-meteo",
  };
}

function bindingError(
  snapshot: WorldSessionSnapshot,
  georeference: ReturnType<WorldDataProvider["getGeoreference"]>,
): WeatherErrorCode | null {
  if (snapshot.mode !== "private" || !georeference || !snapshot.georeferenceReady)
    return "BLOCKED_MISSING_GEOREFERENCE";
  if (!snapshot.centerConfirmation || snapshot.centerConfirmation.status !== "confirmed")
    return "REAL_WORLD_NOT_VERIFIED";
  // A confirmed center is not evidence that a real-world package is verified.
  // Only explicitly synthetic packages may exercise the intercepted software path.
  if (!("world" in snapshot) || snapshot.world.manifest.isSynthetic !== true)
    return "REAL_WORLD_NOT_VERIFIED";
  return null;
}
function referenceKey(ref: ReturnType<WorldDataProvider["getGeoreference"]>): string {
  return ref ? `${ref.origin.latitude},${ref.origin.longitude}` : "none";
}

type CacheEntry = { reading: WeatherReading; fetchedAt: number };

export class OpenMeteoWeatherAdapter {
  private readonly options: Required<Pick<WeatherAdapterOptions, "timeoutMs" | "retries" | "now">> &
    WeatherAdapterOptions;
  private snapshot: WeatherSnapshot;
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private cache = new Map<string, CacheEntry>();
  private consent = false;
  private requestId = 0;
  private disposed = false;
  private readonly epoch: number;
  private readonly refKey: string;
  private unsubscribe: () => void;
  constructor(options: WeatherAdapterOptions) {
    this.options = {
      ...options,
      timeoutMs: Math.max(250, Math.min(options.timeoutMs ?? 8000, 30000)),
      retries: Math.max(0, Math.min(options.retries ?? 1, 2)),
      now: options.now ?? (() => new Date()),
    };
    this.epoch = options.provider.getPackageEpoch();
    this.refKey = referenceKey(options.provider.getGeoreference());
    this.snapshot = { status: "off", packageEpoch: this.epoch, consented: false };
    this.unsubscribe = options.provider.subscribe(() => {
      const changed =
        options.provider.getPackageEpoch() !== this.epoch ||
        referenceKey(options.provider.getGeoreference()) !== this.refKey;
      if (changed) this.invalidate();
    });
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.onVisibilityChange);
  }
  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.clear();
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(next: WeatherSnapshot) {
    if (this.disposed) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
  private invalidate() {
    this.requestId += 1;
    this.controller?.abort();
    this.controller = null;
    this.cache.clear();
    this.consent = false;
    this.publish({
      status: "off",
      packageEpoch: this.options.provider.getPackageEpoch(),
      consented: false,
    });
  }
  clear() {
    this.invalidate();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.requestId += 1;
    this.controller?.abort();
    this.controller = null;
    this.cache.clear();
    this.consent = false;
    this.unsubscribe();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.snapshot = {
      status: "off",
      packageEpoch: this.options.provider.getPackageEpoch(),
      consented: false,
    };
    this.listeners.forEach((listener) => listener());
  }
  setDisclosureConfirmed(confirmed: boolean) {
    if (!confirmed) {
      this.clear();
      return;
    }
    this.consent = true;
    this.publish({
      status: this.snapshot.status,
      ...(this.snapshot.reading ? { reading: this.snapshot.reading } : {}),
      packageEpoch: this.snapshot.packageEpoch,
      consented: true,
    });
  }
  private url(origin: PackageGeoreference["origin"]) {
    const params = new URLSearchParams({
      latitude: String(origin.latitude),
      longitude: String(origin.longitude),
      current: CURRENT_WEATHER_VARIABLES.join(","),
      timezone: WEATHER_TIMEZONE,
    });
    return `${OPEN_METEO_ENDPOINT}?${params.toString()}`;
  }
  async load(selectedDate?: string): Promise<WeatherSnapshot> {
    const provider = this.options.provider;
    const binding = provider.getSnapshot();
    const reference = provider.getGeoreference();
    const blocked = bindingError(binding, reference);
    if (blocked) {
      this.publish({
        status: "error",
        errorCode: blocked,
        packageEpoch: provider.getPackageEpoch(),
        consented: this.consent,
      });
      return this.snapshot;
    }
    if (!this.consent) {
      this.publish({
        status: "error",
        errorCode: "CONSENT_REQUIRED",
        packageEpoch: provider.getPackageEpoch(),
        consented: false,
      });
      return this.snapshot;
    }
    const today = localDate(this.options.now());
    if (selectedDate && selectedDate !== today) {
      this.publish({
        status: "error",
        errorCode: "HISTORICAL_OR_FUTURE_NOT_SUPPORTED",
        packageEpoch: provider.getPackageEpoch(),
        consented: true,
      });
      return this.snapshot;
    }
    const cacheKey = `${provider.getPackageEpoch()}:${referenceKey(reference)}:${today}`;
    const cached = this.cache.get(cacheKey);
    const nowMs = this.options.now().getTime();
    if (cached && nowMs - cached.fetchedAt <= WEATHER_CACHE_TTL_MS) {
      this.publish({
        status: "ready",
        reading: cached.reading,
        packageEpoch: provider.getPackageEpoch(),
        consented: true,
      });
      return this.snapshot;
    }
    const id = ++this.requestId;
    this.controller?.abort();
    this.publish({
      status: "loading",
      packageEpoch: provider.getPackageEpoch(),
      consented: true,
      ...(cached ? { reading: cached.reading } : {}),
    });
    let lastError: WeatherErrorCode = "HTTP_ERROR";
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      if (id !== this.requestId || this.disposed) return this.snapshot;
      const controller = new AbortController();
      this.controller = controller;
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await (this.options.fetchImpl ?? fetch)(this.url(reference!.origin), {
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
        });
        if (!response.ok) throw new Error("HTTP_ERROR");
        const reading = parseOpenMeteoCurrent(await response.json());
        if (
          localDate(
            new Date(
              `${reading.timestamp.length === 16 ? `${reading.timestamp}:00` : reading.timestamp}+07:00`,
            ),
          ) !== today
        )
          throw new Error("MALFORMED_RESPONSE");
        const readingMs = new Date(
          `${reading.timestamp.length === 16 ? `${reading.timestamp}:00` : reading.timestamp}+07:00`,
        ).getTime();
        const age = this.options.now().getTime() - readingMs;
        if (age > 90 * 60000 || age < -15 * 60000) throw new Error("MALFORMED_RESPONSE");
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (
          id !== this.requestId ||
          provider.getPackageEpoch() !== binding.packageEpoch ||
          referenceKey(provider.getGeoreference()) !== referenceKey(reference)
        )
          return this.snapshot;
        this.cache.set(cacheKey, { reading, fetchedAt: this.options.now().getTime() });
        this.publish({
          status: "ready",
          reading,
          packageEpoch: binding.packageEpoch,
          consented: true,
        });
        return this.snapshot;
      } catch (error) {
        if (id !== this.requestId || this.disposed) return this.snapshot;
        lastError =
          error instanceof DOMException && error.name === "AbortError"
            ? "TIMEOUT"
            : error instanceof TypeError
              ? "OFFLINE"
              : error instanceof Error && error.message === "MALFORMED_RESPONSE"
                ? "MALFORMED_RESPONSE"
                : "HTTP_ERROR";
        if (lastError === "MALFORMED_RESPONSE" || lastError === "OFFLINE") break;
      } finally {
        clearTimeout(timeout);
        if (this.controller === controller) this.controller = null;
      }
    }
    if (cached) {
      this.publish({
        status: "stale",
        reading: cached.reading,
        errorCode: lastError,
        packageEpoch: provider.getPackageEpoch(),
        consented: true,
      });
      return this.snapshot;
    }
    this.publish({
      status: lastError === "TIMEOUT" ? "timeout" : lastError === "OFFLINE" ? "offline" : "error",
      errorCode: lastError,
      packageEpoch: provider.getPackageEpoch(),
      consented: true,
    });
    return this.snapshot;
  }
}
export function createOpenMeteoWeatherAdapter(options: WeatherAdapterOptions) {
  return new OpenMeteoWeatherAdapter(options);
}
