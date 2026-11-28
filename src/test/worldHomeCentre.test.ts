import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  deriveShadowCameraBounds,
  homeMarkerElevation,
  worldCameraCentre,
  worldCameraFrame,
  worldHomeCentre,
} from "@/engine/demoScene";
import { HOME_ENRICHMENT } from "@/world/enrichment/homeEnrichment";
import { planMassing } from "@/world/enrichment/planMassing";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
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

describe("fixed home camera frame", () => {
  it("fits the full OSM extent and preserves the home-origin marker at usable zoom", () => {
    const frame = worldCameraFrame(HOME_NEIGHBORHOOD);
    expect(frame.radius).toBeGreaterThan(800);
    expect(frame.groundSize / 2).toBeGreaterThan(frame.radius);
    expect(frame.maxDistance).toBeGreaterThan(380);
    expect(frame.farPlane).toBeGreaterThan(frame.maxDistance + frame.radius);
    expect(frame.span).toBeGreaterThan(1_000);
  });
});

describe("fixed home camera centre", () => {
  it("keeps offset source geometry framed on the configured ENU origin", () => {
    const centre = worldCameraCentre();
    expect([centre.x, centre.z]).toEqual([0, 0]);
  });
});

describe("private-world home centre", () => {
  it("uses the configured ENU origin when parcel geometry is not available", () => {
    const centre = worldHomeCentre(worldWithoutLot);
    expect([centre.x, centre.z]).toEqual([0, 0]);
  });

  it("raises the center marker above a verified building covering the origin while keeping empty sites at ground height", () => {
    expect(homeMarkerElevation(worldWithoutLot, [0, 0])).toBe(0.35);

    const occupiedWorld: WorldData = {
      ...worldWithoutLot,
      buildings: [
        {
          localId: "building-focal-test",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-2, -2],
                [6, -2],
                [6, 2],
                [-2, 2],
                [-2, -2],
              ],
            ],
          },
          footprintKind: "footprint",
          wallHeight: 7.4,
          levels: 2,
          roofType: "corrugated",
          roofHeight: 0.9,
          provenance: { source: "survey", quality: "verified" },
          attributes: { wallHeight: { source: "survey", quality: "verified" } },
          parts: [
            {
              localId: "building-focal-test-front",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-2, -2],
                    [2, -2],
                    [2, 2],
                    [-2, 2],
                    [-2, -2],
                  ],
                ],
              },
              wallHeight: 7.8,
              levels: 2,
              roofType: "flat",
              provenance: { source: "survey", quality: "verified" },
              attributes: { wallHeight: { source: "survey", quality: "verified" } },
            },
            {
              localId: "building-focal-test-rear",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [2, -2],
                    [6, -2],
                    [6, 2],
                    [2, 2],
                    [2, -2],
                  ],
                ],
              },
              wallHeight: 7.0,
              levels: 2,
              roofType: "corrugated",
              roofHeight: 0.9,
              provenance: { source: "survey", quality: "verified" },
              attributes: { wallHeight: { source: "survey", quality: "verified" } },
            },
          ],
        },
      ],
    };
    expect(homeMarkerElevation(occupiedWorld, [0, 0])).toBeCloseTo(8.6, 5);
  });
});

describe("shadow camera bounds", () => {
  it("derives orthographic shadow frustum from real building footprint and 4-storey massing bounds", () => {
    const massingPlan = planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT!);
    const bounds = deriveShadowCameraBounds(HOME_NEIGHBORHOOD, massingPlan);

    expect(bounds.centre).toEqual({ x: 0, z: 0 });
    expect(bounds.maxBuildingHeight).toBeGreaterThanOrEqual(
      4 * HOME_ENRICHMENT!.generator.massing.floorHeight,
    );
    expect(bounds.frustumHalfSize).toBeGreaterThan(bounds.horizontalRadius);
    expect(bounds.near).toBeGreaterThanOrEqual(1);
    expect(bounds.far).toBeGreaterThan(bounds.sunDistance + bounds.frustumHalfSize);

    const sun = new THREE.DirectionalLight("#ffffff", 1);
    Object.assign(sun.shadow.camera, {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      near: bounds.near,
      far: bounds.far,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(bounds.centre.x, 0, bounds.centre.z);
    sun.target.updateMatrixWorld();

    const point = new THREE.Vector3();
    for (const [azDeg, elDeg] of [
      [95, 22],
      [180, 68],
      [265, 20],
    ] as const) {
      const az = THREE.MathUtils.degToRad(azDeg);
      const el = THREE.MathUtils.degToRad(elDeg);
      sun.position.set(
        Math.sin(az) * Math.cos(el) * bounds.sunDistance,
        Math.sin(el) * bounds.sunDistance,
        -Math.cos(az) * Math.cos(el) * bounds.sunDistance,
      );
      sun.updateMatrixWorld();
      sun.shadow.camera.position.copy(sun.position);
      sun.shadow.camera.lookAt(sun.target.position);
      sun.shadow.camera.updateMatrixWorld();

      let maxAbsX = 0;
      let maxAbsY = 0;
      let maxAbsZ = 0;
      for (const item of massingPlan.items) {
        const rings =
          item.footprint.type === "Polygon"
            ? item.footprint.coordinates
            : item.footprint.coordinates.flat();
        for (const [x, z] of rings[0] ?? []) {
          for (const y of [0, item.wallHeight]) {
            point.set(x, y, z).project(sun.shadow.camera);
            maxAbsX = Math.max(maxAbsX, Math.abs(point.x));
            maxAbsY = Math.max(maxAbsY, Math.abs(point.y));
            maxAbsZ = Math.max(maxAbsZ, Math.abs(point.z));
          }
        }
      }
      expect(maxAbsX).toBeLessThanOrEqual(1);
      expect(maxAbsY).toBeLessThanOrEqual(1);
      expect(maxAbsZ).toBeLessThanOrEqual(1);
    }
  });
});
