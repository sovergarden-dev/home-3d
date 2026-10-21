import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WorldDataProvider } from "@/world/privateWorldSession";
import {
  createOpenMeteoWeatherAdapter,
  WEATHER_CACHE_TTL_MS,
  WEATHER_FUTURE_TOLERANCE_MS,
  WEATHER_MAX_READING_AGE_MS,
} from "@/atmosphere/weatherOpenMeteo";

const TODAY = "2026-10-21";
const ORIGIN = { latitude: 10, longitude: 106 };
const basePayload = (time: string) => ({
  timezone: "Asia/Ho_Chi_Minh",
  utc_offset_seconds: 25200,
  current: { time, temperature_2m: 29, weather_code: 1 },
  current_units: { temperature_2m: "°C", weather_code: "wmo code" },
});
const response = (body: unknown, ok = true) =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 503 });

function makeProvider() {
  let epoch = 1;
  let origin = ORIGIN;
  const listeners = new Set<() => void>();
  const provider = {
    getSnapshot: () => ({
      mode: "private",
      packageEpoch: epoch,
      georeferenceReady: true,
      world: { manifest: { isSynthetic: true } },
      centerConfirmation: {
        status: "confirmed",
        provenance: { source: "owner", method: "explicit-user-confirmation" },
      },
    }),
    getGeoreference: () => ({ origin }),
    getPackageEpoch: () => epoch,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    changePackage: () => {
      epoch += 1;
      listeners.forEach((listener) => listener());
    },
    changeReference: () => {
      origin = { latitude: 11, longitude: 107 };
      listeners.forEach((listener) => listener());
    },
  } as unknown as WorldDataProvider & {
    changePackage: () => void;
    changeReference: () => void;
  };
  return provider;
}

function deferredFetch() {
  let resolve!: (value: Response) => void;
  let reject!: (error: unknown) => void;
  const fetchImpl = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((res, rej) => {
        resolve = res;
        reject = rej;
        init?.signal?.addEventListener("abort", () =>
          rej(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  return { fetchImpl, resolve, reject };
}

let nowMs: number;
const now = () => new Date(nowMs);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  nowMs = Date.parse("2026-10-21T05:00:00.000Z"); // 12:00 local
  vi.setSystemTime(nowMs);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

async function readyAt(
  adapter: ReturnType<typeof createOpenMeteoWeatherAdapter>,
  fetchImpl: ReturnType<typeof vi.fn>,
  payload = basePayload(`${TODAY}T12:00`),
) {
  adapter.setDisclosureConfirmed(true);
  fetchImpl.mockResolvedValueOnce(response(payload));
  await adapter.load(TODAY);
  expect(adapter.getSnapshot().status).toBe("ready");
}

describe("P8 weather freshness boundaries", () => {
  it.each([
    ["cache TTL exactly", WEATHER_CACHE_TTL_MS, "ready"],
    ["cache TTL plus one", WEATHER_CACHE_TTL_MS + 1, "stale"],
  ])("treats %s as %s", async (_label, elapsed, expected) => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T12:00`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    await readyAt(adapter, fetchImpl);
    nowMs += elapsed;
    if (expected === "ready") {
      await adapter.load(TODAY);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } else {
      fetchImpl.mockResolvedValueOnce(response(basePayload(`${TODAY}T12:00`), false));
      await adapter.load(TODAY);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(adapter.getSnapshot()).toMatchObject({ status: "stale", errorCode: "HTTP_ERROR" });
    }
    adapter.dispose();
  });

  it("keeps a reading fresh at exactly 90 minutes and rejects it one millisecond later", async () => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T10:30`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    expect(adapter.getSnapshot().status).toBe("ready");
    adapter.dispose();

    nowMs += 1;
    const lateProvider = makeProvider();
    const lateFetch = vi.fn(async () => response(basePayload(`${TODAY}T10:30`)));
    const late = createOpenMeteoWeatherAdapter({
      provider: lateProvider,
      fetchImpl: lateFetch,
      now,
      retries: 0,
    });
    late.setDisclosureConfirmed(true);
    await late.load(TODAY);
    expect(late.getSnapshot()).toMatchObject({ status: "error", errorCode: "MALFORMED_RESPONSE" });
    late.dispose();
  });

  it("accepts future readings at exactly 15 minutes and rejects them one millisecond later", async () => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T12:15`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    expect(adapter.getSnapshot().status).toBe("ready");
    adapter.dispose();

    nowMs -= 1;
    const lateProvider = makeProvider();
    const lateFetch = vi.fn(async () => response(basePayload(`${TODAY}T12:15`)));
    const late = createOpenMeteoWeatherAdapter({
      provider: lateProvider,
      fetchImpl: lateFetch,
      now,
      retries: 0,
    });
    late.setDisclosureConfirmed(true);
    await late.load(TODAY);
    expect(late.getSnapshot()).toMatchObject({ status: "error", errorCode: "MALFORMED_RESPONSE" });
    late.dispose();
  });

  it("does not auto-fetch from 12:00 to 15:00 and explicit load at 12:02 does not revive a stale-ready reading", async () => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T10:31`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    await readyAt(adapter, fetchImpl, basePayload(`${TODAY}T10:31`));
    nowMs = Date.parse("2026-10-21T05:02:00Z");
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(adapter.getSnapshot().status).toBe("stale");
    nowMs = Date.parse("2026-10-21T08:00:00Z");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    adapter.dispose();
  });

  it("turns stale at local midnight, while a cache hit does not refresh the original expiry", async () => {
    nowMs = Date.parse("2026-10-21T16:59:00Z"); // 23:59 local
    vi.setSystemTime(nowMs);
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T23:59`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    await readyAt(adapter, fetchImpl, basePayload(`${TODAY}T23:59`));
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    nowMs += 59_999;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(adapter.getSnapshot().status).toBe("ready");
    nowMs += 1;
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.getSnapshot().status).toBe("stale");
    adapter.dispose();
  });

  it("does not treat a clock rollback as a cache hit", async () => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T12:00`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    await readyAt(adapter, fetchImpl);
    nowMs -= 1;
    fetchImpl.mockResolvedValueOnce(response(basePayload(`${TODAY}T12:00`)));
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    adapter.dispose();
  });

  it.each([["off"], ["hidden"], ["package"], ["reference"], ["dispose"]])(
    "cleans expiry timers and cache on %s",
    async (_label) => {
      const provider = makeProvider();
      const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T12:00`)));
      const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
      await readyAt(adapter, fetchImpl);
      if (_label === "off") adapter.clear();
      if (_label === "hidden") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      }
      if (_label === "package") provider.changePackage();
      if (_label === "reference") provider.changeReference();
      if (_label === "dispose") adapter.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(adapter.getSnapshot().status).toBe("off");
      nowMs += WEATHER_CACHE_TTL_MS + 1;
      await vi.advanceTimersByTimeAsync(WEATHER_CACHE_TTL_MS + 1);
      if (_label !== "dispose") {
        adapter.setDisclosureConfirmed(true);
        await adapter.load(TODAY);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
      }
      adapter.dispose();
    },
  );

  it("replaces, rather than duplicates, the expiry timer on repeated cache hits", async () => {
    const provider = makeProvider();
    const fetchImpl = vi.fn(async () => response(basePayload(`${TODAY}T12:00`)));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    await readyAt(adapter, fetchImpl);
    await adapter.load(TODAY);
    await adapter.load(TODAY);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(WEATHER_CACHE_TTL_MS + 1);
    expect(adapter.getSnapshot().status).toBe("stale");
    adapter.dispose();
  });

  it("does not let a superseded pending response resurrect cached weather", async () => {
    const provider = makeProvider();
    const pendingFetch = deferredFetch();
    const fetchImpl = vi.fn(pendingFetch.fetchImpl);
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, retries: 0 });
    adapter.setDisclosureConfirmed(true);
    const pending = adapter.load(TODAY);
    await Promise.resolve();
    adapter.clear();
    await pending;
    expect(adapter.getSnapshot().status).toBe("off");
    expect(adapter.getSnapshot().reading).toBeUndefined();
    adapter.dispose();
  });
});
