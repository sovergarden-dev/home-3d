import { describe, expect, it } from "vitest";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { MAX_WORLD_PACKAGE_BYTES, parseWorldPackage } from "@/world/package";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { WorldData, WorldOverrideDocument } from "@/world/schema";

function packageText(world: WorldData, overrides?: WorldOverrideDocument) {
  return JSON.stringify({ manifest: world.manifest, world, ...(overrides ? { overrides } : {}) });
}
function fileWithText(text: string, size = new TextEncoder().encode(text).byteLength) {
  const file = new File([text], "synthetic-world.json", { type: "application/json" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function syntheticWorld(id = "fixture") {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.manifest.datasetRevision = `synthetic-${id}`;
  return world;
}
function heightOverride(world: WorldData, height: number): WorldOverrideDocument {
  return {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "h6-height",
        revision: 1,
        reason: "H6 synthetic edit",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_building",
          featureId: world.buildings[0]!.localId,
          patch: { wallHeight: height },
        },
      },
    ],
  };
}

describe("H6 private world session data contracts", () => {
  it.each(["resolve", "reject"] as const)(
    "latest request wins when old A later %ss",
    async (completion) => {
      const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
      const slow = deferred<string>(),
        fast = deferred<string>();
      const fileA = fileWithText(""),
        fileB = fileWithText("");
      Object.defineProperty(fileA, "text", { value: () => slow.promise });
      Object.defineProperty(fileB, "text", { value: () => fast.promise });
      const original = provider.getSnapshot();
      const openA = provider.openFile(fileA);
      expect(provider.getSnapshot()).toMatchObject({ loading: true, revision: original.revision });
      expect("world" in provider.getSnapshot() && provider.getSnapshot().mode).toBe("fixture");
      const openB = provider.openFile(fileB);
      fast.resolve(packageText(syntheticWorld("B")));
      await openB;
      const winner = provider.getSnapshot();
      expect(winner.mode).toBe("private");
      if (completion === "resolve") slow.resolve(packageText(syntheticWorld("A")));
      else slow.reject(new Error("synthetic-private-sentinel old failure"));
      await openA;
      expect(provider.getSnapshot()).toBe(winner);
    },
  );

  it("reset invalidates a pending read without resurrecting private data", async () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const pending = deferred<string>();
    const file = fileWithText("");
    Object.defineProperty(file, "text", { value: () => pending.promise });
    const task = provider.openFile(file);
    provider.resetFixture();
    const reset = provider.getSnapshot();
    pending.resolve(packageText(syntheticWorld("late")));
    await task;
    expect(provider.getSnapshot()).toBe(reset);
    expect(reset).toMatchObject({
      mode: "fixture",
      loading: false,
      temporaryLotIllustrationSelected: false,
    });
  });

  it("rejects empty, oversize, read, JSON, shape and schema errors with filtered codes", async () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    for (const [file, code] of [
      [fileWithText("   ", MAX_WORLD_PACKAGE_BYTES), "WORLD_PACKAGE_EMPTY"],
      [fileWithText("{}", MAX_WORLD_PACKAGE_BYTES + 1), "WORLD_PACKAGE_TOO_LARGE"],
      [fileWithText("{}", MAX_WORLD_PACKAGE_BYTES), "WORLD_PACKAGE_SHAPE_INVALID"],
      [fileWithText("{ synthetic-private-sentinel"), "WORLD_PACKAGE_JSON_INVALID"],
      [
        fileWithText(
          packageText({
            ...syntheticWorld(),
            manifest: { ...syntheticWorld().manifest, schemaVersion: "9.0" },
          } as unknown as WorldData),
        ),
        "WORLD_PACKAGE_SCHEMA_UNSUPPORTED",
      ],
    ] as const) {
      await provider.openFile(file);
      expect(provider.getSnapshot()).toMatchObject({
        mode: "private-error",
        errorCode: code,
        loading: false,
      });
      expect(JSON.stringify(provider.getSnapshot())).not.toContain("synthetic-private-sentinel");
    }
    const unreadable = fileWithText("");
    Object.defineProperty(unreadable, "text", {
      value: () => Promise.reject(new Error("synthetic-private-sentinel")),
    });
    await provider.openFile(unreadable);
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private-error",
      errorCode: "WORLD_PACKAGE_FILE_READ_FAILED",
    });
  });

  it("marker is UI-only, survives edits, and resets on new package/error/fixture", () => {
    const world = syntheticWorld();
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    provider.openText(packageText(world));
    const before = provider.getSnapshot();
    provider.toggleTemporaryLotIllustration();
    const selected = provider.getSnapshot();
    expect(selected.revision).toBe(before.revision);
    expect(selected.packageEpoch).toBe(before.packageEpoch);
    expect("world" in selected && JSON.stringify(selected.world)).toBe(JSON.stringify(world));
    provider.applyOverrides(heightOverride(world, world.buildings[0]!.wallHeight + 1));
    expect(provider.getSnapshot().temporaryLotIllustrationSelected).toBe(true);
    provider.openText(packageText(syntheticWorld("new")));
    expect(provider.getSnapshot().temporaryLotIllustrationSelected).toBe(false);
    provider.toggleTemporaryLotIllustration();
    provider.openText("bad");
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private-error",
      temporaryLotIllustrationSelected: false,
    });
    provider.resetFixture();
    expect(provider.getSnapshot().temporaryLotIllustrationSelected).toBe(false);
  });

  it("exports immutable base plus current overrides preserving metadata and confirmation", () => {
    const world = syntheticWorld();
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const imported = heightOverride(world, world.buildings[0]!.wallHeight + 1);
    const canonicalText = JSON.stringify({
      manifest: world.manifest,
      world,
      overrides: imported,
      centerConfirmation: {
        status: "provisionally-accepted",
        provenance: { source: "owner", method: "explicit-user-confirmation" },
      },
    });
    provider.openText(canonicalText);
    const parsedOriginal = JSON.parse(canonicalText);
    const edit = heightOverride(world, world.buildings[0]!.wallHeight + 2);
    expect(provider.applyOverrides(edit)).toBe(true);
    const active = provider.getSnapshot();
    provider.toggleTemporaryLotIllustration();
    const exported = provider.exportWorkingPackage();
    expect(exported?.world).toEqual(world);
    expect(exported?.overrides).toEqual(edit);
    expect(exported?.centerConfirmation).toEqual(parsedOriginal.centerConfirmation);
    expect(exported?.world.lots).toEqual(world.lots);
    const roundtrip = parseWorldPackage(JSON.stringify(exported));
    expect(roundtrip.ok).toBe(true);
    if (roundtrip.ok && "world" in active) expect(roundtrip.world).toEqual(active.world);
    expect(JSON.stringify(exported)).not.toContain("temporaryLotIllustrationSelected");
    provider.openText(JSON.stringify(exported));
    expect(provider.getSnapshot().temporaryLotIllustrationSelected).toBe(false);
    expect(JSON.parse(canonicalText)).toEqual(parsedOriginal);
  });

  it("dirty follows last exported document and undo to an unchanged package stays clean", () => {
    const world = syntheticWorld();
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    provider.openText(packageText(world));
    const edit = heightOverride(world, world.buildings[0]!.wallHeight + 1);
    provider.applyOverrides(edit);
    expect(provider.getSnapshot().dirty).toBe(true);
    provider.applyOverrides(undefined);
    expect(provider.getSnapshot().dirty).toBe(false);
    provider.applyOverrides(edit);
    expect(provider.markExported()).toBe(true);
    expect(provider.getSnapshot().dirty).toBe(false);
    provider.applyOverrides(undefined);
    expect(provider.getSnapshot().dirty).toBe(true);
    provider.applyOverrides(edit);
    expect(provider.getSnapshot().dirty).toBe(false);
    expect(provider.exportWorkingPackage()?.world).toEqual(world);
  });
});
