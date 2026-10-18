import { WORLD_SCHEMA_VERSION, type Provenance, type WorldData } from "../schema";

const synthetic: Provenance = { source: "synthetic", quality: "synthetic" };

export const SYNTHETIC_NEIGHBORHOOD: WorldData = {
  manifest: {
    schemaVersion: WORLD_SCHEMA_VERSION,
    datasetRevision: "synthetic-neighborhood-v1",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [{ localId: "synthetic-core", bounds: [-80, -40, 80, 45], tier: "core" }],
    assetHashes: {},
    licences: ["Synthetic fixture"],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads: [
    {
      localId: "road-main",
      polylineENU: [
        [-76, -18],
        [-24, -15],
        [0, -13],
        [34, -10],
        [78, -8],
      ],
      connectorIds: ["road-alley", "road-deadend"],
      roadClass: "primary",
      carriagewayWidth: 10,
      sidewalkWidths: [2, 2],
      elevationLayer: 0,
      direction: "both",
      surface: "asphalt",
      provenance: synthetic,
    },
    {
      localId: "road-back",
      polylineENU: [
        [-70, 39],
        [-20, 36],
        [20, 34],
        [72, 31],
      ],
      connectorIds: ["road-alley"],
      roadClass: "secondary",
      carriagewayWidth: 7,
      sidewalkWidths: [1.5, 1.5],
      elevationLayer: 0,
      direction: "both",
      surface: "asphalt",
      provenance: synthetic,
    },
    {
      localId: "road-alley",
      polylineENU: [
        [24, -11],
        [22, 8],
        [18, 33],
      ],
      connectorIds: ["road-main", "road-back"],
      roadClass: "alley",
      carriagewayWidth: 4.2,
      sidewalkWidths: [0.5, 0.5],
      elevationLayer: 0,
      direction: "both",
      surface: "concrete",
      provenance: synthetic,
    },
    {
      localId: "road-deadend",
      polylineENU: [
        [-32, -15],
        [-34, 2],
        [-39, 20],
      ],
      connectorIds: ["road-main"],
      roadClass: "alley",
      carriagewayWidth: 3.5,
      sidewalkWidths: [0, 0],
      elevationLayer: 0,
      direction: "both",
      surface: "concrete",
      provenance: synthetic,
    },
  ],
  lots: [
    {
      localId: "lot-home-empty",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-3, -3],
            [3, -3],
            [3, 10],
            [-3, 10],
            [-3, -3],
          ],
        ],
      },
      status: "empty",
      confirmed: true,
      provenance: synthetic,
    },
  ],
  buildings: [
    {
      localId: "building-neighbour-west",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-12, -4],
            [-3.25, -3.5],
            [-3.25, 14],
            [-12, 13.5],
            [-12, -4],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 10.2,
      levels: 3,
      roofType: "terrace_tum",
      frontageCandidates: [{ ringIndex: 0, edgeIndex: 0, provenance: synthetic }],
      provenance: synthetic,
      attributes: { wallHeight: synthetic, roofType: synthetic },
    },
    {
      localId: "building-neighbour-east",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [3.25, -3.5],
            [12, -3],
            [12, 14.5],
            [3.25, 14],
            [3.25, -3.5],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 13.6,
      levels: 4,
      roofType: "flat",
      frontageCandidates: [{ ringIndex: 0, edgeIndex: 0, provenance: synthetic }],
      provenance: synthetic,
      attributes: { wallHeight: synthetic, roofType: synthetic },
    },
    {
      localId: "building-corner-oblique",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-29, -5],
            [-14, -4.3],
            [-14, 13],
            [-24, 12.5],
            [-29, 5],
            [-29, -5],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 9,
      levels: 2,
      roofType: "gabled",
      provenance: synthetic,
      attributes: { roofType: synthetic },
    },
    {
      localId: "building-courtyard",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [31, 2],
            [53, 4],
            [51, 25],
            [29, 22],
            [31, 2],
          ],
          [
            [37, 8],
            [45, 9],
            [44, 17],
            [36, 16],
            [37, 8],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 8.5,
      levels: 2,
      roofType: "flat",
      provenance: synthetic,
    },
    {
      localId: "building-multipolygon",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-59, 15],
              [-51, 16],
              [-52, 27],
              [-60, 26],
              [-59, 15],
            ],
          ],
          [
            [
              [-49, 18],
              [-43, 19],
              [-44, 27],
              [-50, 26],
              [-49, 18],
            ],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 7.2,
      levels: 2,
      roofType: "corrugated",
      provenance: synthetic,
    },
  ],
  trees: [
    { localId: "tree-a", position: [-18, -10], height: 5, provenance: synthetic },
    { localId: "tree-b", position: [18, -9], height: 6, provenance: synthetic },
    { localId: "tree-c", position: [25, 17], height: 4, provenance: synthetic },
  ],
  props: [
    { localId: "pole-a", position: [-16, -11], kind: "street_light", provenance: synthetic },
    { localId: "pole-b", position: [15, -10], kind: "electric_pole", provenance: synthetic },
  ],
};
