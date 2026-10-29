import type { Lot, Position2, RoadSegment, WorldData } from "@/world/schema";

const provenance = { source: "synthetic" as const, quality: "synthetic" as const };
const road = (id: string, points: Position2[], width = 8): RoadSegment => ({
  localId: id,
  polylineENU: points,
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: width,
  elevationLayer: 0,
  direction: "both",
  provenance,
});
const world = (roads: RoadSegment[], lots: Lot[] = []): WorldData => ({
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "p9-longrun",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [],
    assetHashes: {},
    licences: ["test"],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads,
  buildings: [],
  lots,
});

export { provenance, road, world };
