// Neutral synthetic fixture shared by the historical P8 QA and controls benchmark.
const provenance = { source: "synthetic", quality: "synthetic" };
const manifest = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-p8-atmosphere-v2",
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [{ localId: "p8-core", bounds: [-270, -270, 270, 270], tier: "core" }],
  assetHashes: {},
  licences: ["CC0-1.0 Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const buildings = Array.from({ length: 64 }, (_, i) => {
  const x = ((i % 8) - 3.5) * 26,
    z = (Math.floor(i / 8) - 3.5) * 26,
    s = 7;
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
const trees = [
  { localId: "p8-synthetic-tree-a", position: [-30, -10], height: 5, provenance },
  { localId: "p8-synthetic-tree-b", position: [30, -10], height: 5, provenance },
];
const props = [
  { localId: "p8-synthetic-light", position: [26, 0], kind: "street_light", provenance },
];
const fixture = { manifest, world: { manifest, roads, buildings, lots: [], trees, props } },
  text = JSON.stringify(fixture);
export { provenance, manifest, buildings, roads, trees, props, fixture, text };
