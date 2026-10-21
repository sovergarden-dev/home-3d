import { createHash } from "node:crypto";

export const P8_VIEWPORT = { width: 1440, height: 900 } as const;
export const P8_MOBILE_PORTRAIT = { width: 390, height: 844 } as const;
export const P8_MOBILE_LANDSCAPE = { width: 740, height: 390 } as const;
export const P8_DATE = "2026-06-21";
export const P8_SENTINEL = "P8_SYNTHETIC_ATMOSPHERE_ONLY";
const provenance = { source: "synthetic", quality: "synthetic" } as const;
const manifest = {
  schemaVersion: "1.0",
  datasetRevision: P8_SENTINEL,
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [{ localId: "p8-synthetic-core", bounds: [-270, -270, 270, 270], tier: "core" }],
  assetHashes: {},
  licences: ["CC0-1.0 Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const buildings = Array.from({ length: 64 }, (_, i) => {
  const x = ((i % 8) - 3.5) * 26;
  const z = (Math.floor(i / 8) - 3.5) * 26;
  const s = 7;
  return {
    localId: `p8-synthetic-building-${i}`,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x - s, z - s],
          [x + s, z - s],
          [x + s, z + s],
          [x - s, z + s],
          [x - s, z - s],
        ],
      ],
    },
    footprintKind: "footprint",
    wallHeight: 5 + (i % 5),
    levels: 1 + (i % 4),
    roofType: i % 3 === 0 ? "gabled" : "flat",
    provenance,
  };
});
const roads = Array.from({ length: 10 }, (_, i) => ({
  localId: `p8-synthetic-road-${i}`,
  polylineENU:
    i === 9
      ? [
          [0, -220],
          [0, 220],
        ]
      : [
          [-220, (i - 5) * 38],
          [220, (i - 5) * 38],
        ],
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: 7,
  sidewalkWidths: [1.5, 1.5],
  elevationLayer: i === 5 ? 1 : 0,
  direction: "both",
  surface: "asphalt",
  provenance,
}));

export const P8_FIXTURE = { manifest, world: { manifest, roads, buildings, lots: [] } };
export const P8_PACKAGE_TEXT = JSON.stringify(P8_FIXTURE);
export const P8_PACKAGE_SHA256 = createHash("sha256").update(P8_PACKAGE_TEXT, "utf8").digest("hex");
