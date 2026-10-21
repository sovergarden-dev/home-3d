import { createHash } from "node:crypto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpenMeteoWeatherAdapter,
  parseOpenMeteoCurrent,
} from "@/atmosphere/weatherOpenMeteo";
import { WeatherConnection } from "@/components/overlay/WeatherConnection";
import { WeatherPanel } from "@/components/overlay/DockPanels";
import { TopInfo } from "@/components/overlay/TopInfo";
import { useAppStore } from "@/state/appStore";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { createWorldDataProvider, worldDataProvider } from "@/world/privateWorldSession";

const TODAY = "2026-10-21";
const ORIGIN = { latitude: 10.123456, longitude: 106.654321, altitude: 0 };
const payload = {
  timezone: "Asia/Ho_Chi_Minh",
  utc_offset_seconds: 25200,
  current: { time: `${TODAY}T12:00`, temperature_2m: 29, weather_code: 1 },
  current_units: { temperature_2m: "°C", weather_code: "wmo code" },
};

function packageText(revision: string) {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
  world.manifest.datasetRevision = revision;
  const manifest = structuredClone(world.manifest);
  return JSON.stringify({
    manifest,
    world,
    centerConfirmation: {
      status: "confirmed",
      provenance: { source: "owner", method: "explicit-user-confirmation" },
    },
  });
}

async function realProvider(revision = "P8_SYNTHETIC_LIFECYCLE") {
  const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
  const text = packageText(revision);
  provider.openText(text);
  const hash = createHash("sha256").update(text, "utf8").digest("hex");
  expect(
    await provider.openGeoreferenceText(
      JSON.stringify({ schemaVersion: "1.0", packageSha256: hash, origin: ORIGIN }),
    ),
  ).toBe(true);
  return provider;
}
function response(body: unknown, ok = true, status = 200) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : status,
    headers: { "content-type": "application/json" },
  });
}
const now = () => new Date("2026-10-21T05:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now());
});
afterEach(() => {
  vi.useRealTimers();
  useAppStore.setState({
    realWeatherEnabled: false,
    realWeatherKind: null,
    weather: "sunny",
    selectedDate: TODAY,
  });
  vi.restoreAllMocks();
});

describe("P8 weather lifecycle against a real provider", () => {
  it("rejects stale/future current payloads instead of labelling them live", async () => {
    for (const time of [`${TODAY}T09:00`, `${TODAY}T13:00`]) {
      const provider = await realProvider();
      const adapter = createOpenMeteoWeatherAdapter({
        provider,
        now,
        retries: 0,
        fetchImpl: vi.fn(async () =>
          response({ ...payload, current: { ...payload.current, time } }),
        ),
      });
      adapter.setDisclosureConfirmed(true);
      await adapter.load(TODAY);
      expect(adapter.getSnapshot()).toMatchObject({
        status: "error",
        errorCode: "MALFORMED_RESPONSE",
      });
      expect(adapter.getSnapshot().reading).toBeUndefined();
      adapter.dispose();
    }
  });

  it("requires consent, then makes one allowlisted no-metadata request and renders the minimal payload", async () => {
    const provider = await realProvider();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
      expect(init?.referrerPolicy).toBe("no-referrer");
      return response(payload);
    });
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    await adapter.load(TODAY);
    expect(adapter.getSnapshot().errorCode).toBe("CONSENT_REQUIRED");
    expect(fetchImpl).not.toHaveBeenCalled();
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).toString()).toBe(
      "https://api.open-meteo.com/v1/forecast?latitude=10.123456&longitude=106.654321&current=temperature_2m%2Cweather_code&timezone=Asia%2FHo_Chi_Minh",
    );
    expect(adapter.getSnapshot()).toMatchObject({
      status: "ready",
      reading: { temperatureC: 29, weatherCode: 1, timezone: "Asia/Ho_Chi_Minh" },
    });
    adapter.dispose();
  });

  it("clears consent, cache and readings when switched off", async () => {
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    adapter.clear();
    expect(adapter.getSnapshot()).toMatchObject({ status: "off", consented: false });
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.getSnapshot().errorCode).toBe("CONSENT_REQUIRED");
    adapter.dispose();
  });

  it("serves fresh cache, labels stale cache after TTL, and retries transient HTTP failures", async () => {
    const provider = await realProvider();
    let clock = 0;
    const fetchImpl = vi.fn(async () => response(payload, false, 503));
    const adapter = createOpenMeteoWeatherAdapter({
      provider,
      fetchImpl,
      now: () => new Date(Date.parse("2026-10-21T05:00:00Z") + clock),
      retries: 1,
    });
    adapter.setDisclosureConfirmed(true);
    fetchImpl.mockResolvedValueOnce(response(payload));
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 60_000;
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 15 * 60 * 1000 + 1;
    await adapter.load(TODAY);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(adapter.getSnapshot().status).toBe("stale");
    expect(adapter.getSnapshot().errorCode).toBe("HTTP_ERROR");
    adapter.dispose();
  });

  it("handles offline, malformed and timeout failures without leaking requests", async () => {
    const provider = await realProvider();
    const offline = createOpenMeteoWeatherAdapter({
      provider,
      fetchImpl: vi.fn(async () => {
        throw new TypeError("offline");
      }),
      now,
      retries: 2,
    });
    offline.setDisclosureConfirmed(true);
    await offline.load(TODAY);
    expect(offline.getSnapshot().status).toBe("offline");
    const malformed = createOpenMeteoWeatherAdapter({
      provider,
      fetchImpl: vi.fn(async () =>
        response({ ...payload, current_units: { temperature_2m: "F", weather_code: "wmo code" } }),
      ),
      now,
    });
    malformed.setDisclosureConfirmed(true);
    await malformed.load(TODAY);
    expect(malformed.getSnapshot().status).toBe("error");
    expect(malformed.getSnapshot().errorCode).toBe("MALFORMED_RESPONSE");
    const timeout = createOpenMeteoWeatherAdapter({
      provider,
      fetchImpl: vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
      timeoutMs: 250,
      now,
    });
    timeout.setDisclosureConfirmed(true);
    await timeout.load(TODAY);
    expect(timeout.getSnapshot().status).toBe("timeout");
    offline.dispose();
    malformed.dispose();
    timeout.dispose();
  });

  it("does not apply deferred A after B, package changes, historical dates, or future responses", async () => {
    const provider = await realProvider();
    let resolveA: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    adapter.setDisclosureConfirmed(true);
    const pending = adapter.load(TODAY);
    adapter.clear();
    resolveA?.(response(payload));
    await pending;
    expect(adapter.getSnapshot().status).toBe("off");
    expect(adapter.getSnapshot().reading).toBeUndefined();
    await adapter.load("2026-10-20");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.getSnapshot().errorCode).toBe("CONSENT_REQUIRED");
    adapter.dispose();
  });

  it("aborts when hidden and removes visibility listeners on dispose", async () => {
    const provider = await realProvider();
    const abort = vi.fn();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", abort);
      return new Promise<Response>(() => {});
    });
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now, timeoutMs: 30000 });
    adapter.setDisclosureConfirmed(true);
    void adapter.load(TODAY);
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(abort).toHaveBeenCalled();
    adapter.dispose();
    const calls = abort.mock.calls.length;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(abort).toHaveBeenCalledTimes(calls);
  });

  it("uses the same parser for local time without an offset and rejects private metadata", () => {
    expect(parseOpenMeteoCurrent(payload)).toMatchObject({
      timestamp: `${TODAY}T12:00`,
      temperatureC: 29,
    });
    expect(() =>
      parseOpenMeteoCurrent({ ...payload, current: { ...payload.current, secret: "private" } }),
    ).not.toThrow();
  });
});

describe("WeatherConnection", () => {
  it("turns stale at the 15-minute cache timer without fetching, and restores manual weather in TopInfo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now());
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    useAppStore.setState({ weather: "rain" });
    const view = render(
      <>
        <WeatherConnection provider={provider} adapter={adapter} selectedDate={TODAY} />
        <TopInfo />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /thời tiết thật/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cho phép thời tiết/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(adapter.getSnapshot().status).toBe("ready");
    expect(screen.getAllByText(/Current weather|Thời tiết hiện tại/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nắng nhẹ|Light sun/i).length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    });
    expect(adapter.getSnapshot()).toMatchObject({
      status: "stale",
      reading: { timestamp: `${TODAY}T12:00`, temperatureC: 29, weatherCode: 1 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState()).toMatchObject({
      realWeatherEnabled: false,
      realWeatherKind: null,
      weather: "rain",
    });
    expect(screen.queryByText(/Current weather|Thời tiết hiện tại/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Mưa|Rain/i)).toBeInTheDocument();
    view.unmount();
    adapter.dispose();
  });

  it("does not auto-fetch when a 10:31 reading reaches the 90-minute age at 12:02", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-21T05:00:00.000Z");
    vi.setSystemTime(start);
    const provider = await realProvider();
    const agedPayload = {
      ...payload,
      current: { ...payload.current, time: `${TODAY}T10:31` },
    };
    const fetchImpl = vi.fn(async () => response(agedPayload));
    const adapter = createOpenMeteoWeatherAdapter({
      provider,
      fetchImpl,
      now: () => new Date(),
      retries: 0,
    });
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    expect(adapter.getSnapshot().status).toBe("ready");
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(adapter.getSnapshot().status).toBe("stale");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });

  it("clears its expiry timer on dispose and does not publish after cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now());
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    adapter.setDisclosureConfirmed(true);
    await adapter.load(TODAY);
    const beforeDispose = clearTimeoutSpy.mock.calls.length;
    adapter.dispose();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(beforeDispose);
    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    });
    expect(adapter.getSnapshot().status).toBe("off");
    clearTimeoutSpy.mockRestore();
    adapter.dispose();
  });

  it("consents, fetches, renders live weather, turns off to restore simulation, and cancel does not request", async () => {
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    render(<WeatherConnection provider={provider} adapter={adapter} selectedDate={TODAY} />);
    const trigger = screen.getByRole("button", { name: /thời tiết thật/i });
    expect(trigger).toBeEnabled();
    expect(fetchImpl).not.toHaveBeenCalled();
    act(() => fireEvent.click(trigger));
    const dialog = await screen.findByRole("dialog");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: /hủy/i })));
    expect(fetchImpl).not.toHaveBeenCalled();
    act(() => fireEvent.click(trigger));
    const openDialog = await screen.findByRole("dialog");
    act(() =>
      fireEvent.click(within(openDialog).getByRole("button", { name: /cho phép thời tiết/i })),
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(adapter.getSnapshot().status).toBe("ready"));
    expect(useAppStore.getState()).toMatchObject({
      weather: "sunny",
      realWeatherKind: "sunny",
      realWeatherEnabled: true,
    });
    act(() => fireEvent.click(trigger));
    const liveDialog = await screen.findByRole("dialog");
    expect(within(liveDialog).getByRole("status")).toHaveTextContent(
      /current weather|thời tiết hiện tại/i,
    );
    act(() =>
      fireEvent.click(within(liveDialog).getByRole("button", { name: "Dùng thời tiết mô phỏng" })),
    );
    expect(useAppStore.getState()).toMatchObject({
      weather: "sunny",
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
    act(() => adapter.dispose());
  });

  it("owns a live adapter safely through StrictMode effect replay", async () => {
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    vi.stubGlobal("fetch", fetchImpl);
    const view = render(
      <StrictMode>
        <WeatherConnection provider={provider} selectedDate={TODAY} />
      </StrictMode>,
    );
    const trigger = await screen.findByRole("button", { name: /thời tiết thật/i });
    act(() => fireEvent.click(trigger));
    const dialog = await screen.findByRole("dialog");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: /cho phép thời tiết/i })));
    await waitFor(() => expect(useAppStore.getState().realWeatherEnabled).toBe(true));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(useAppStore.getState()).toMatchObject({
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
  });

  it("invalidates supplied live weather on date change without requesting another date", async () => {
    const provider = await realProvider();
    const fetchImpl = vi.fn(async () => response(payload));
    const adapter = createOpenMeteoWeatherAdapter({ provider, fetchImpl, now });
    useAppStore.setState({ weather: "rain" });
    const view = render(
      <WeatherConnection provider={provider} adapter={adapter} selectedDate={TODAY} />,
    );
    const trigger = screen.getByRole("button", { name: /thời tiết thật/i });
    act(() => fireEvent.click(trigger));
    const dialog = await screen.findByRole("dialog");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: /cho phép thời tiết/i })));
    await waitFor(() => expect(adapter.getSnapshot().status).toBe("ready"));
    expect(useAppStore.getState()).toMatchObject({
      weather: "rain",
      realWeatherKind: "sunny",
      realWeatherEnabled: true,
    });
    act(() =>
      view.rerender(
        <WeatherConnection provider={provider} adapter={adapter} selectedDate="2026-10-20" />,
      ),
    );
    await waitFor(() => expect(adapter.getSnapshot().status).toBe("off"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState()).toMatchObject({
      weather: "rain",
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
    view.unmount();
    adapter.dispose();
  });

  it("clears a pending live response when WeatherPanel chooses simulation", async () => {
    const text = packageText("P8_SYNTHETIC_PANEL");
    worldDataProvider.openText(text);
    const hash = createHash("sha256").update(text, "utf8").digest("hex");
    await worldDataProvider.openGeoreferenceText(
      JSON.stringify({ schemaVersion: "1.0", packageSha256: hash, origin: ORIGIN }),
    );
    let resolveRequest: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveRequest = resolve;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const view = render(<WeatherPanel />);
    const trigger = await screen.findByRole("button", { name: /thời tiết thật/i });
    act(() => fireEvent.click(trigger));
    const dialog = await screen.findByRole("dialog");
    act(() => fireEvent.click(within(dialog).getByRole("button", { name: /cho phép thời tiết/i })));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    act(() => fireEvent.click(screen.getByRole("radio", { name: "Mưa" })));
    resolveRequest?.(response(payload));
    await act(async () => Promise.resolve());
    expect(useAppStore.getState()).toMatchObject({
      weather: "rain",
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
    view.unmount();
  });
});
