import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { enuToGeodetic, geodeticToEnu } from "@/geo/enu";
import { buildGoogleMapsUrl, resolveRealStreetView } from "@/geo/realStreet";
import {
  PACKAGE_GEOREFERENCE_SCHEMA_VERSION,
  parsePackageGeoreference,
  sha256Text,
} from "@/world/packageGeoreference";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { WorldData } from "@/world/schema";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

const origin = { longitude: 106.7, latitude: 10.8, altitude: 4 };
const world = () => structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
const packageText = (value = world()) => JSON.stringify({ manifest: value.manifest, world: value });
const file = (text: string) =>
  new File([text], "synthetic-world.json", { type: "application/json" });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function georefText(packageSha256: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: PACKAGE_GEOREFERENCE_SCHEMA_VERSION,
    packageSha256,
    origin,
    ...extra,
  });
}

describe("P7 synthetic geo contracts", () => {
  it("uses ENU east/north/up axes and round-trips below 1cm within 2km", () => {
    const east = enuToGeodetic({ east: 1000, north: 0, up: 0 }, origin);
    const north = enuToGeodetic({ east: 0, north: 1000, up: 0 }, origin);
    const up = enuToGeodetic({ east: 0, north: 0, up: 25 }, origin);
    expect(geodeticToEnu(east, origin).east).toBeCloseTo(1000, 6);
    expect(geodeticToEnu(north, origin).north).toBeCloseTo(1000, 6);
    expect(geodeticToEnu(up, origin).up).toBeCloseTo(25, 6);
    const point = enuToGeodetic({ east: 1800, north: -1600, up: 37 }, origin);
    const restored = geodeticToEnu(point, origin);
    expect(Math.hypot(restored.east - 1800, restored.north + 1600, restored.up - 37)).toBeLessThan(
      0.01,
    );
  });

  it("normalizes negative and 360-degree headings and moves targets for all camera modes", () => {
    const views = [
      { mode: "diorama" as const, direction: { x: 1, y: 0, z: 0 }, expected: 90 },
      { mode: "walk" as const, direction: { x: -1, y: 0, z: 0 }, expected: 270 },
      { mode: "topdown" as const, direction: { x: 1, y: -1, z: 1 }, expected: 0 },
    ];
    for (const view of views) {
      const resolved = resolveRealStreetView({ target: { x: 120, y: 7, z: -80 }, ...view }, origin);
      expect(resolved).not.toBeNull();
      expect(resolved?.heading).toBe(view.expected);
      expect(resolved?.latitude).not.toBe(origin.latitude);
      expect(resolved?.longitude).not.toBe(origin.longitude);
      expect(resolved?.altitude).not.toBe(origin.altitude);
    }
    expect(
      resolveRealStreetView(
        { target: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 }, mode: "walk" },
        origin,
      )?.heading,
    ).toBe(0);
  });

  it("rejects invalid finite/range/kind/zoom inputs and emits only allowlisted URL shapes", () => {
    const valid = resolveRealStreetView(
      { target: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, mode: "walk", zoom: 17 },
      origin,
    )!;
    for (const bad of [
      { ...valid, latitude: Number.NaN },
      { ...valid, longitude: 181 },
      { ...valid, heading: -1 },
      { ...valid, zoom: 1.5 },
      { ...valid, zoom: 22 },
    ])
      expect(() => buildGoogleMapsUrl("streetview", bad)).toThrow("REAL_STREET_VIEW_INVALID");
    expect(() => buildGoogleMapsUrl("nope" as never, valid)).toThrow(
      "REAL_STREET_VIEW_KIND_INVALID",
    );
    expect(buildGoogleMapsUrl("streetview", valid)).toMatch(
      /^https:\/\/www\.google\.com\/maps\/@\?api=1&map_action=pano&viewpoint=/,
    );
    expect(buildGoogleMapsUrl("satellite", valid)).toMatch(
      /^https:\/\/www\.google\.com\/maps\/@\?api=1&map_action=map&center=.*&basemap=satellite&zoom=17$/,
    );
  });

  it("parses georeferences strictly, including extra keys, types, and hash format", () => {
    const hash = "a".repeat(64);
    expect(parsePackageGeoreference(georefText(hash))).toEqual({
      schemaVersion: "1.0",
      packageSha256: hash,
      origin,
    });
    for (const text of [
      georefText(hash, { extra: true }),
      georefText(hash, { packageSha256: 7 }),
      georefText("A".repeat(64)),
      georefText("f".repeat(63)),
      georefText(hash, { origin: { ...origin, latitude: "10.8" } }),
      JSON.stringify({ schemaVersion: "1.0", packageSha256: hash }),
    ])
      expect(parsePackageGeoreference(text)).toBeNull();
  });

  it("requires the exact package digest, so missing/wrong references and same-ID content changes fail", async () => {
    const text = packageText();
    const provider = createWorldDataProvider(world());
    provider.openText(text);
    expect(
      await provider.openGeoreferenceText(georefText(await sha256Text(text.slice(0, -1)))),
    ).toBe(false);
    expect(await provider.openGeoreferenceText(georefText("0".repeat(64)))).toBe(false);
    const changedValue = JSON.parse(text) as { manifest: WorldData["manifest"]; world: WorldData };
    changedValue.world.buildings[0]!.wallHeight += 0.25;
    const changed = JSON.stringify(changedValue);
    expect(await provider.openGeoreferenceText(georefText(await sha256Text(changed)))).toBe(false);
    expect(provider.getGeoreference()).toBeNull();
    expect(await provider.openGeoreferenceText(georefText(await sha256Text(text)))).toBe(true);
  });

  it("handles session A-to-B replacement, reload/error/reset, and clears references immediately while loading", async () => {
    const provider = createWorldDataProvider(world());
    const a = packageText();
    const b = packageText(world());
    provider.openText(a);
    expect(await provider.openGeoreferenceText(georefText(await sha256Text(a)))).toBe(true);
    const pending = deferred<string>();
    const slow = file("");
    Object.defineProperty(slow, "text", { value: () => pending.promise });
    const open = provider.openFile(slow);
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private",
      loading: true,
      georeferenceReady: false,
    });
    expect(provider.getGeoreference()).toBeNull();
    provider.openText(b);
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private",
      loading: false,
      georeferenceReady: false,
    });
    provider.openText("not json");
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private-error",
      loading: false,
      georeferenceReady: false,
    });
    provider.resetFixture();
    expect(provider.getSnapshot()).toMatchObject({
      mode: "fixture",
      loading: false,
      georeferenceReady: false,
    });
    pending.resolve(a);
    await open;
    expect(provider.getSnapshot().mode).toBe("fixture");
  });

  it("does not let a replaced failed read overwrite the successful package", async () => {
    const provider = createWorldDataProvider(world());
    const failed = deferred<string>();
    const fileA = file("");
    Object.defineProperty(fileA, "text", { value: () => failed.promise });
    const openA = provider.openFile(fileA);
    const fileB = file(packageText());
    await provider.openFile(fileB);
    expect(provider.getSnapshot().mode).toBe("private");
    failed.reject(new Error("synthetic read failure"));
    await openA;
    expect(provider.getSnapshot().mode).toBe("private");
    expect(provider.getSnapshot()).toMatchObject({ loading: false, georeferenceReady: false });
  });

  it("ignores stale digest promises and accepts only the replacement companion", async () => {
    const provider = createWorldDataProvider(world());
    const text = packageText();
    provider.openText(text);
    const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    const first = deferred<ArrayBuffer>();
    const second = deferred<ArrayBuffer>();
    let calls = 0;
    vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(((
      ...args: Parameters<SubtleCrypto["digest"]>
    ) => {
      calls += 1;
      return (calls === 1 ? first.promise : second.promise) as ReturnType<SubtleCrypto["digest"]>;
    }) as SubtleCrypto["digest"]);
    const hash = await original("SHA-256", new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
    const old = provider.openGeoreferenceText(georefText(hex));
    const replacement = provider.openGeoreferenceText(georefText(hex));
    second.resolve(hash);
    expect(await replacement).toBe(true);
    first.resolve(hash);
    expect(await old).toBe(false);
    expect(provider.getGeoreference()?.origin).toEqual(origin);
    vi.restoreAllMocks();
  });

  it("preserves a valid reference through same-session editor overrides but not while loading", async () => {
    const value = world();
    const text = packageText(value);
    const provider = createWorldDataProvider(value);
    provider.openText(text);
    expect(await provider.openGeoreferenceText(georefText(await sha256Text(text)))).toBe(true);
    const id = value.buildings[0]!.localId;
    expect(
      provider.applyOverrides({
        schemaVersion: "1.0",
        overrides: [
          {
            localId: "edit",
            revision: 1,
            reason: "synthetic",
            patch: {
              operation: "patch_building",
              featureId: id,
              patch: { wallHeight: value.buildings[0]!.wallHeight + 1 },
            },
          },
        ],
      }),
    ).toBe(true);
    expect(provider.getSnapshot()).toMatchObject({ georeferenceReady: true });
    expect(provider.getGeoreference()).not.toBeNull();
  });

  it("never adds origin or reference metadata to exported packages", async () => {
    const value = world();
    const text = packageText(value);
    const provider = createWorldDataProvider(value);
    provider.openText(text);
    await provider.openGeoreferenceText(georefText(await sha256Text(text)));
    const exported = provider.exportWorkingPackage();
    expect(exported).not.toHaveProperty("origin");
    expect(exported).not.toHaveProperty("georeference");
    expect(JSON.stringify(exported)).not.toContain("packageSha256");
  });
});

it("rejects finite inputs whose ENU conversion overflows before preview", () => {
  expect(
    resolveRealStreetView(
      {
        target: { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE },
        direction: { x: 1, y: 0, z: 0 },
        mode: "diorama",
      },
      { latitude: 0.4, longitude: 0.6, altitude: Number.MAX_VALUE },
    ),
  ).toBeNull();
});
