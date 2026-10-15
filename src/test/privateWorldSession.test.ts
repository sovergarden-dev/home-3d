import { describe, expect, it } from "vitest";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { SurfaceGeometry, WorldData, WorldOverrideDocument } from "@/world/schema";

function testWorld(localId: string, wallHeight: number): WorldData {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.roads = [];
  world.buildings = [
    {
      localId,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight,
      levels: 2,
      roofType: "flat",
      provenance: { source: "survey", quality: "verified", sourceNamespace: "survey-a" },
      attributes: {
        wallHeight: { source: "survey", quality: "verified", sourceNamespace: "survey-a" },
        levels: { source: "survey", quality: "verified", sourceNamespace: "survey-a" },
      },
    },
  ];
  world.lots = [];
  world.trees = [];
  world.props = [];
  return world;
}

function packageText(world: WorldData, overrides?: WorldOverrideDocument) {
  return JSON.stringify({ manifest: world.manifest, world, ...(overrides ? { overrides } : {}) });
}

function buildingOverride(
  localId: string,
  revision: number,
  wallHeight: number,
): WorldOverrideDocument {
  return {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: `ov-${revision}`,
        revision,
        reason: "Synthetic session regression",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: { operation: "patch_building", featureId: localId, patch: { wallHeight } },
      },
    ],
  };
}

describe("local private world session", () => {
  it("opens a valid package in memory and reports malformed input without relabeling fixture data as private", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const world = testWorld("building-session", 6);
    provider.openText(packageText(world));
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private",
      world: { buildings: [{ localId: "building-session" }] },
    });

    provider.openText("{ malformed package");
    const failed = provider.getSnapshot();
    expect(failed.mode).toBe("private-error");
    expect("world" in failed).toBe(false);
  });

  it("separates package epoch from edit revisions and resets the base across same-ID packages", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const packageA = testWorld("building-same-id", 6);
    provider.openText(packageText(packageA, buildingOverride("building-same-id", 1, 9)));
    const first = provider.getSnapshot();
    expect(first.mode).toBe("private");
    if (first.mode !== "private") throw new Error("PACKAGE_A_NOT_OPEN");
    const firstEpoch = first.packageEpoch;
    expect(first.world.buildings[0]?.wallHeight).toBe(9);

    expect(provider.applyOverrides(buildingOverride("building-same-id", 2, 12))).toBe(true);
    const edited = provider.getSnapshot();
    expect(edited.packageEpoch).toBe(firstEpoch);
    if (edited.mode !== "private") throw new Error("PACKAGE_A_EDIT_FAILED");
    expect(edited.world.buildings[0]?.wallHeight).toBe(12);

    const packageB = testWorld("building-same-id", 20);
    provider.openText(packageText(packageB));
    const second = provider.getSnapshot();
    expect(second.mode).toBe("private");
    if (second.mode !== "private") throw new Error("PACKAGE_B_NOT_OPEN");
    expect(second.packageEpoch).toBeGreaterThan(firstEpoch);
    expect(second.world.buildings[0]?.wallHeight).toBe(20);
  });

  it("rejects failed mutations atomically and leaves the valid world and revision unchanged", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const world = testWorld("building-valid", 20);
    provider.openText(packageText(world));
    const before = provider.getSnapshot();
    if (before.mode !== "private") throw new Error("PACKAGE_NOT_OPEN");

    const invalid: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "ov-invalid",
          revision: 1,
          reason: "Synthetic invalid height",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building",
            featureId: "building-valid",
            patch: { wallHeight: -3 },
          },
        },
      ],
    };
    expect(provider.applyOverrides(invalid)).toBe(false);
    const after = provider.getSnapshot();
    if (after.mode !== "private") throw new Error("PRIVATE_MODE_LOST");
    expect(after.world.buildings[0]?.wallHeight).toBe(20);
    expect(after.revision).toBe(before.revision);
    expect(after.lastError).toBeTruthy();
  });
});

it("rejects a mutation that fills a valid courtyard hole over a confirmed empty lot", () => {
  const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
  const world = testWorld("building-courtyard-session", 8);
  const courtyard: SurfaceGeometry = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [1, 1],
        [9, 1],
        [9, 9],
        [1, 9],
        [1, 1],
      ],
    ],
  };
  world.buildings[0]!.geometry = courtyard;
  world.lots = [
    {
      localId: "lot-confirmed-inside-courtyard",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2, 2],
            [8, 2],
            [8, 8],
            [2, 8],
            [2, 2],
          ],
        ],
      },
      status: "empty",
      confirmed: true,
      provenance: { source: "survey", quality: "verified" },
    },
  ];
  provider.openText(packageText(world));
  const before = provider.getSnapshot();
  if (before.mode !== "private") throw new Error("COURTYARD_PACKAGE_INVALID");
  const revision = before.revision;

  expect(
    provider.applyOverrides({
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "ov-fill-courtyard",
          revision: 1,
          reason: "Synthetic courtyard fill regression",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "replace_building_geometry",
            featureId: "building-courtyard-session",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [10, 0],
                  [10, 10],
                  [0, 10],
                  [0, 0],
                ],
              ],
            },
          },
        },
      ],
    }),
  ).toBe(false);

  const after = provider.getSnapshot();
  if (after.mode !== "private") throw new Error("PRIVATE_MODE_LOST");
  expect(after.revision).toBe(revision);
  expect(after.world.buildings[0]?.geometry).toEqual(courtyard);
  expect(after.lastError).toBe("BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT");
});
