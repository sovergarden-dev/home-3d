import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createSurroundingsMeshes } from "@/engine/world/surroundingsMeshes";
import { HOME_ENRICHMENT } from "@/world/enrichment/homeEnrichment";
import {
  createPlacementContext,
  planSurroundings,
  rejectReason,
  roadWidth,
  type SurroundingsPlan,
} from "@/world/enrichment/planSurroundings";
import { SURROUNDINGS_TIER_CAPS, type DetailTier } from "@/world/enrichment/schema";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { WorldData } from "@/world/schema";

const layer = HOME_ENRICHMENT!;
const tiers: DetailTier[] = ["low", "mid", "high"];
const sha = (plan: SurroundingsPlan) =>
  createHash("sha256").update(JSON.stringify(plan)).digest("hex");

/** Per-tier goldens; regenerating them is an explicit, reviewed act (docs/SURROUNDINGS_GOLDEN.md). */
const GOLDEN: Record<DetailTier, { sha256: string; trees: number; props: number }> = {
  low: {
    sha256: "d8d3e66ee15ff1c902e027c01214afc44bc31307b087313bdd6405a0cf7e396f",
    trees: 150,
    props: 80,
  },
  mid: {
    sha256: "6e7a33f75d5d6223ba95a6bd7dc2e34bb99562ab1c7826d53f2858999e0f641f",
    trees: 353,
    props: 200,
  },
  high: {
    sha256: "c8cc7c3a33e62c1db56d929618c97f8852daaab9759a21c6d684bf3adf132613",
    trees: 353,
    props: 400,
  },
};

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const other = state % (index + 1);
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

describe("planSurroundings determinism", () => {
  it("is stable across runs, input order and tiers, and matches the recorded goldens", () => {
    expect(layer).not.toBeNull();
    const reordered: WorldData = {
      ...structuredClone(HOME_NEIGHBORHOOD),
      roads: shuffled(structuredClone(HOME_NEIGHBORHOOD.roads), 7),
      buildings: shuffled(structuredClone(HOME_NEIGHBORHOOD.buildings), 11),
    };
    const plans = Object.fromEntries(
      tiers.map((tier) => [tier, planSurroundings(HOME_NEIGHBORHOOD, layer, tier)]),
    ) as Record<DetailTier, SurroundingsPlan>;
    for (const tier of tiers) {
      const again = planSurroundings(HOME_NEIGHBORHOOD, layer, tier);
      expect(JSON.stringify(again)).toBe(JSON.stringify(plans[tier]));
      expect(JSON.stringify(planSurroundings(reordered, layer, tier))).toBe(
        JSON.stringify(plans[tier]),
      );
      expect({
        sha256: sha(plans[tier]),
        trees: plans[tier].trees.length,
        props: plans[tier].props.length,
      }).toEqual(GOLDEN[tier]);
    }
    // low ⊆ mid ⊆ high: tier only takes a prefix of one priority order, it never reseeds.
    const ids = (plan: SurroundingsPlan) =>
      new Set([...plan.trees, ...plan.props].map((item) => item.localId));
    const [low, mid, high] = [ids(plans.low), ids(plans.mid), ids(plans.high)];
    for (const id of low) expect(mid.has(id)).toBe(true);
    for (const id of mid) expect(high.has(id)).toBe(true);
    for (const tier of tiers) {
      expect(plans[tier].trees.length).toBeLessThanOrEqual(SURROUNDINGS_TIER_CAPS[tier].trees);
      expect(plans[tier].props.length).toBeLessThanOrEqual(SURROUNDINGS_TIER_CAPS[tier].props);
      expect(plans[tier].seed).toBe(layer.generator.seed);
    }
  });

  it("changes output when the seed changes and keeps stable ids keyed by OSM way ids", () => {
    const base = planSurroundings(HOME_NEIGHBORHOOD, layer, "mid");
    const reseeded = planSurroundings(
      HOME_NEIGHBORHOOD,
      { ...layer, generator: { ...layer.generator, seed: layer.generator.seed + 1 } },
      "mid",
    );
    expect(sha(reseeded)).not.toBe(sha(base));
    const ids = [...base.trees, ...base.props].map((item) => item.localId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids)
      expect(id).toMatch(/^(tree|pole|light|bench|bike|cart)-(osm-node|gen)-[a-z0-9-]+$/);
  });

  it("does not mutate the frozen canonical world and makes no network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const before = JSON.stringify(HOME_NEIGHBORHOOD);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD)).toBe(true);
    const plan = planSurroundings(HOME_NEIGHBORHOOD, layer, "high");
    const meshes = createSurroundingsMeshes(plan);
    meshes.dispose();
    expect(JSON.stringify(HOME_NEIGHBORHOOD)).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("planSurroundings density and placement", () => {
  const context = createPlacementContext(HOME_NEIGHBORHOOD);
  const plan = planSurroundings(HOME_NEIGHBORHOOD, layer, "high", context);

  /** Metres of road centreline inside each distance ring (sampled every metre). */
  function roadMetres(min: number, max: number) {
    let metres = 0;
    for (const road of HOME_NEIGHBORHOOD.roads)
      for (let index = 0; index < road.polylineENU.length - 1; index++) {
        const a = road.polylineENU[index]!;
        const b = road.polylineENU[index + 1]!;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0.5; t < length; t += 1) {
          const d = Math.hypot(
            a[0] + ((b[0] - a[0]) * t) / length,
            a[1] + ((b[1] - a[1]) * t) / length,
          );
          if (d >= min && d < max) metres += 1;
        }
      }
    return metres;
  }

  it("is dense within 150 m of the home centre and sparser outward", () => {
    const generated = [...plan.trees, ...plan.props].filter(
      (item) => item.origin === "estimated_procedural",
    );
    const inRing = (min: number, max: number) =>
      generated.filter((item) => {
        const d = Math.hypot(item.position[0], item.position[1]);
        return d >= min && d < max;
      }).length;
    const dense = inRing(0, 150) / roadMetres(0, 150);
    const middle = inRing(150, 300) / roadMetres(150, 300);
    const far = inRing(300, Infinity) / roadMetres(300, Infinity);
    expect(layer.generator.density.denseRadius).toBe(150);
    expect(dense).toBeGreaterThan(middle * 1.5);
    expect(middle).toBeGreaterThan(far * 1.5);
    expect(inRing(0, 150)).toBeGreaterThan(50);
  });

  it("keeps every generated item off buildings, carriageways, junctions and the home exclusion", () => {
    const generated = [...plan.trees, ...plan.props].filter(
      (item) => item.origin === "estimated_procedural",
    );
    expect(generated.length).toBeGreaterThan(100);
    for (const item of generated) {
      expect(rejectReason(context, item.position, layer.generator.homeExclusionRadius)).toBeNull();
      expect(Math.hypot(item.position[0], item.position[1])).toBeGreaterThanOrEqual(
        layer.generator.homeExclusionRadius,
      );
    }
    for (const tree of plan.trees)
      if (Math.hypot(tree.position[0], tree.position[1]) < layer.generator.homeDominanceRadius)
        expect(tree.height).toBeLessThanOrEqual(4.5);
    for (const road of HOME_NEIGHBORHOOD.roads) expect(roadWidth(road)).toBeGreaterThanOrEqual(2);
  });

  it("includes every sourced OSM fact with OSM provenance and marks the rest synthetic", () => {
    const ids = new Set([...plan.trees, ...plan.props].map((item) => item.localId));
    for (const fact of layer.pointFacts) expect(ids.has(fact.localId)).toBe(true);
    for (const item of [...plan.trees, ...plan.props]) {
      if (item.origin === "osm") {
        expect(item.provenance).toMatchObject({ source: "osm", licence: "ODbL-1.0" });
      } else {
        expect(item.provenance).toEqual({ source: "synthetic", quality: "synthetic" });
      }
    }
    const kinds = new Set(plan.props.map((prop) => prop.kind));
    for (const kind of ["electric_pole", "street_light", "parked_motorbike", "vendor_cart"])
      expect(kinds.has(kind as never)).toBe(true);
  });
  it("labels only sourced OSM point facts as osm; every generated item is estimated_procedural", () => {
    const factIds = new Set(layer.pointFacts.map((fact) => fact.localId));
    const items = [...plan.trees, ...plan.props];
    const osmItems = items.filter((item) => item.origin === "osm");
    expect(osmItems).toHaveLength(factIds.size);
    for (const item of osmItems) expect(factIds.has(item.localId)).toBe(true);
    for (const item of items) {
      if (factIds.has(item.localId)) continue;
      expect(item.origin).toBe("estimated_procedural");
      expect(item.provenance.source).not.toBe("osm");
    }
    expect(items.length - osmItems.length).toBeGreaterThan(osmItems.length);
  });
});

describe("surroundings meshes", () => {
  it("renders every tier with at most 7 instanced draws and disposes owned resources", () => {
    for (const tier of tiers) {
      const plan = planSurroundings(HOME_NEIGHBORHOOD, layer, tier);
      const meshes = createSurroundingsMeshes(plan);
      const drawables: THREE.Mesh[] = [];
      [meshes.trees, meshes.props].forEach((group) =>
        group.traverse((object) => {
          if (object instanceof THREE.Mesh) drawables.push(object);
        }),
      );
      expect(drawables.length).toBeLessThanOrEqual(7);
      expect(drawables.every((mesh) => mesh instanceof THREE.InstancedMesh)).toBe(true);
      expect(meshes.trees.children.length).toBeLessThanOrEqual(4);
      expect(meshes.props.children.length).toBeLessThanOrEqual(3);
      expect(meshes.instanceCount).toBeGreaterThanOrEqual(plan.trees.length + plan.props.length);
      for (const mesh of meshes.meshes) {
        expect(mesh.castShadow).toBe(false);
        expect(mesh.userData["nonPickable"]).toBe(true);
        const hits: THREE.Intersection[] = [];
        mesh.raycast(new THREE.Raycaster(), hits);
        expect(hits).toHaveLength(0);
      }
      const disposals = meshes.meshes.map((mesh) => vi.spyOn(mesh, "dispose"));
      meshes.dispose();
      meshes.dispose();
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
      expect(meshes.trees.children).toHaveLength(0);
      expect(meshes.props.children).toHaveLength(0);
    }
  });
});

describe("no external network access from runtime code (Aegis condition 3)", () => {
  const root = path.resolve(__dirname, "..");
  const runtimeFiles = [
    "world/enrichment/schema.ts",
    "world/enrichment/parse.ts",
    "world/enrichment/planSurroundings.ts",
    "world/enrichment/homeEnrichment.ts",
    "world/enrichment/defaults.ts",
    "engine/world/surroundingsMeshes.ts",
  ];

  it("keeps fetch/Overpass out of runtime modules and the snapshot converter out of the bundle", () => {
    for (const file of runtimeFiles) {
      const text = readFileSync(path.join(root, file), "utf8");
      expect(text, file).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|\bimport\s*\(|api\/interpreter|overpass[\w.-]*\.(de|systems|coffee|ru)/i,
      );
      expect(text, file).not.toMatch(/osmSnapshot/);
    }
    const scene = readFileSync(path.join(root, "engine/demoScene.ts"), "utf8");
    expect(scene).not.toMatch(/osmSnapshot|overpass/i);
    const converter = readFileSync(path.join(root, "world/enrichment/osmSnapshot.ts"), "utf8");
    expect(converter).not.toMatch(/\bfetch\s*\(/);
  });
});
