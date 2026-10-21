import { describe, expect, it } from "vitest";
import { worldHomeCentre } from "@/engine/demoScene";
import type { WorldData } from "@/world/schema";

const worldWithoutLot: WorldData = {
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "synthetic-home-centre-regression",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: false,
    chunks: [],
    assetHashes: {},
    licences: ["ODbL-1.0"],
    coverage: { quality: "source_only", sourceCount: 1 },
  },
  roads: [
    {
      localId: "road-away-from-origin",
      polylineENU: [
        [100, 50],
        [140, 50],
      ],
      connectorIds: [],
      roadClass: "residential",
      carriagewayWidth: 6,
      elevationLayer: 0,
      direction: "unknown",
      surface: "unknown",
      provenance: { source: "osm", quality: "source_only" },
    },
  ],
  buildings: [],
  lots: [],
};

describe("private-world home centre", () => {
  it("uses the configured ENU origin when parcel geometry is not available", () => {
    const centre = worldHomeCentre(worldWithoutLot);
    expect([centre.x, centre.z]).toEqual([0, 0]);
  });
});
