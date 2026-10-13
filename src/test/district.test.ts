import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyDistrictOverrides,
  type DistrictData,
  type DistrictOverrides,
} from "@/engine/districtModel";
import { REALISTIC_DISTRICT_FIXTURE } from "@/engine/fixtures/realisticDistrict";
import {
  buildBuildingMeshes,
  buildRoadMeshes,
  buildEnvironmentProps,
} from "@/engine/polygonMeshBuilder";

describe("H6 District Architecture & Fixture", () => {
  it("enforces home lot emptiness and correct boundary in realistic district", () => {
    const { homeLot, buildings } = REALISTIC_DISTRICT_FIXTURE;
    expect(homeLot.empty).toBe(true);
    expect(homeLot.minX).toBe(-2.5);
    expect(homeLot.maxX).toBe(2.5);
    expect(homeLot.minZ).toBe(-9);
    expect(homeLot.maxZ).toBe(9);

    const homeBuilding = buildings.find((b) => b.isHomeLot);
    expect(homeBuilding).toBeDefined();
    expect(homeBuilding?.floors).toBe(0);
    expect(homeBuilding?.height).toBe(0);

    // No non-home building may intrude inside the home lot inner bounds
    const intruders = buildings.filter(
      (b) =>
        !b.isHomeLot &&
        b.polygon.some(
          ([x, z]) =>
            x > homeLot.minX + 0.05 &&
            x < homeLot.maxX - 0.05 &&
            z > homeLot.minZ &&
            z < homeLot.maxZ,
        ),
    );
    expect(intruders).toHaveLength(0);
  });

  it("includes verified adjacent neighbors and recognizable landmarks", () => {
    const leftNeighbor = REALISTIC_DISTRICT_FIXTURE.buildings.find(
      (b) => b.id === "b-neighbor-left",
    );
    const rightNeighbor = REALISTIC_DISTRICT_FIXTURE.buildings.find(
      (b) => b.id === "b-neighbor-right",
    );
    const cafeCorner = REALISTIC_DISTRICT_FIXTURE.buildings.find((b) => b.id === "b-cafe-corner");

    expect(leftNeighbor).toBeDefined();
    expect(leftNeighbor?.confidence).toBe("verified");
    expect(leftNeighbor?.floors).toBe(3);
    expect(leftNeighbor?.roofType).toBe("terrace_tum");

    expect(rightNeighbor).toBeDefined();
    expect(rightNeighbor?.confidence).toBe("verified");
    expect(rightNeighbor?.floors).toBe(4);
    expect(rightNeighbor?.shop).toBe(true);

    expect(cafeCorner).toBeDefined();
    expect(cafeCorner?.confidence).toBe("verified");
    expect(cafeCorner?.polygon.length).toBeGreaterThanOrEqual(4);
  });

  it("features a curved primary avenue, angled alleys and realistic road widths", () => {
    const mainStreet = REALISTIC_DISTRICT_FIXTURE.roads.find((r) => r.id === "road-main-street");
    const alley = REALISTIC_DISTRICT_FIXTURE.roads.find((r) => r.kind === "alley");

    expect(mainStreet).toBeDefined();
    expect(mainStreet?.width).toBeGreaterThanOrEqual(10);
    expect(mainStreet?.sidewalkWidth).toBeGreaterThan(1.5);
    // Non-collinear points showing curvature
    expect(mainStreet?.points.length).toBeGreaterThanOrEqual(4);

    expect(alley).toBeDefined();
    expect(alley?.width).toBeLessThan(5);
  });

  it("applies local overrides safely without mutating the base district", () => {
    const base: DistrictData = {
      ...REALISTIC_DISTRICT_FIXTURE,
      buildings: [
        {
          id: "test-b-1",
          polygon: [
            [0, 0],
            [4, 0],
            [4, 10],
            [0, 10],
          ],
          floors: 2,
          height: 7,
          roofType: "flat",
          wallColor: "#ffffff",
          shop: false,
          confidence: "source_only",
        },
      ],
    };

    const overrides: DistrictOverrides = {
      "test-b-1": {
        floors: 4,
        roofType: "terrace_tum",
        wallColor: "#f0e6d2",
        shop: true,
        confidence: "verified",
        notes: "Surveyed ground truth",
      },
    };

    const merged = applyDistrictOverrides(base, overrides);
    expect(merged.buildings[0]?.floors).toBe(4);
    expect(merged.buildings[0]?.roofType).toBe("terrace_tum");
    expect(merged.buildings[0]?.wallColor).toBe("#f0e6d2");
    expect(merged.buildings[0]?.shop).toBe(true);
    expect(merged.buildings[0]?.confidence).toBe("verified");

    // Base remains intact
    expect(base.buildings[0]?.floors).toBe(2);
    expect(base.buildings[0]?.confidence).toBe("source_only");
  });

  it("builds 3D meshes for buildings, roads and environment props with clean disposals", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const getMat = (c: string) => {
      let m = materials.get(c);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: c });
        materials.set(c, m);
      }
      return m;
    };

    const bMeshes = buildBuildingMeshes(REALISTIC_DISTRICT_FIXTURE.buildings, getMat);
    expect(bMeshes.group.children.length).toBeGreaterThan(10);
    expect(bMeshes.disposables.length).toBeGreaterThan(10);

    const rMeshes = buildRoadMeshes(REALISTIC_DISTRICT_FIXTURE.roads, getMat);
    expect(rMeshes.group.children.length).toBeGreaterThan(0);
    expect(rMeshes.disposables.length).toBeGreaterThan(0);

    const pMeshes = buildEnvironmentProps(
      REALISTIC_DISTRICT_FIXTURE.trees,
      REALISTIC_DISTRICT_FIXTURE.props,
      getMat,
    );
    expect(pMeshes.group.children.length).toBeGreaterThan(0);
    expect(pMeshes.disposables.length).toBeGreaterThan(0);

    // Verify disposables can be executed without error
    for (const d of [...bMeshes.disposables, ...rMeshes.disposables, ...pMeshes.disposables]) {
      expect(() => d.dispose()).not.toThrow();
    }
  });
});
