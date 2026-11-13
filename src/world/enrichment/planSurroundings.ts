/**
 * Seeded surroundings generator (ADR §5.3, PR-2 scope: street trees and street furniture).
 *
 * Pure and order-independent: every random draw is hash(seed | stable key | slot), where the
 * stable key is the OSM-derived localId (stable-local-id-v2 embeds the OSM way id). There is no
 * Math.random, no Date and no cross-feature accumulation; roads are visited in localId order and
 * the output is sorted by localId. Tier only takes a prefix of one fixed priority order, so
 * low ⊆ mid ⊆ high. The canonical world is never mutated and nothing produced here is a collider.
 */
import { pointInPolygon, polygonsOf, ringWithoutClosure, surfaceCentroid } from "../geometry";
import type {
  LandmarkProp,
  Position2,
  Provenance,
  RoadClass,
  RoadSegment,
  TreeFeature,
  WorldData,
} from "../schema";
import {
  SURROUNDINGS_TIER_CAPS,
  type DetailTier,
  type EnrichmentLayer,
  type TreeArchetype,
} from "./schema";

export type SurroundingsPropKind =
  Exclude<LandmarkProp["kind"], "unknown"> | "parked_motorbike" | "vendor_cart";

export interface PlannedTree extends TreeFeature {
  height: number;
  archetype: TreeArchetype;
  origin: "osm" | "estimated_procedural";
}

export interface PlannedProp extends Omit<LandmarkProp, "kind"> {
  kind: SurroundingsPropKind;
  /** Rotation about the vertical axis in radians (three.js Y). */
  heading: number;
  origin: "osm" | "estimated_procedural";
  /** Body colour index for vehicles and carts; renderers map it to a palette. */
  variant: number;
}

export interface SurroundingsPlan {
  tier: DetailTier;
  seed: number;
  trees: PlannedTree[];
  props: PlannedProp[];
}

/* ------------------------------------------------------------------ PRNG */

function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One mulberry32 step seeded by FNV-1a of the key; returns [0, 1). */
export function hash01(key: string) {
  let t = (fnv1a(key) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------- geometry */

const CELL = 24;
const BUILDING_CLEARANCE = 0.6;
const JUNCTION_RADIUS = 6;
const CARRIAGEWAY_MARGIN = 0.4;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Same width inference as the life graph (engine/life/graph.ts) when OSM has no width. */
export function roadWidth(road: RoadSegment) {
  const raw = road.carriagewayWidth;
  const value =
    raw !== undefined && Number.isFinite(raw) && raw > 0
      ? raw
      : road.roadClass === "primary"
        ? 9
        : road.roadClass === "secondary"
          ? 7
          : road.roadClass === "alley"
            ? 3.2
            : 5.5;
  return Math.max(2, Math.min(30, value));
}

interface Segment {
  a: Position2;
  b: Position2;
  halfWidth: number;
  roadId: string;
}

function distanceToSegment(p: Position2, a: Position2, b: Position2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

class Grid<T> {
  private cells = new Map<string, T[]>();
  insert(minX: number, minZ: number, maxX: number, maxZ: number, item: T) {
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
      for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
        const key = `${x}:${z}`;
        const list = this.cells.get(key);
        if (list) list.push(item);
        else this.cells.set(key, [item]);
      }
  }
  near(p: Position2): readonly T[] {
    return this.cells.get(`${Math.floor(p[0] / CELL)}:${Math.floor(p[1] / CELL)}`) ?? [];
  }
}

interface BuildingShape {
  polygons: ReturnType<typeof polygonsOf>;
}

/** Static spatial context derived from the base world only (set semantics, order-free). */
export interface PlacementContext {
  homeCentre: Position2;
  buildings: Grid<BuildingShape>;
  segments: Grid<Segment>;
  junctions: Grid<Position2>;
}

export function surroundingsHomeCentre(world: WorldData): Position2 {
  const homeLot = world.lots.find((lot) => lot.confirmed && lot.status === "empty");
  return homeLot ? surfaceCentroid(homeLot.geometry) : [0, 0];
}

export function createPlacementContext(world: WorldData): PlacementContext {
  const buildings = new Grid<BuildingShape>();
  for (const building of world.buildings) {
    if (building.hidden) continue;
    const polygons = polygonsOf(building.geometry);
    const points = polygons.flatMap((polygon) => polygon.coordinates[0] ?? []);
    if (points.length === 0) continue;
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    buildings.insert(
      Math.min(...xs) - BUILDING_CLEARANCE,
      Math.min(...zs) - BUILDING_CLEARANCE,
      Math.max(...xs) + BUILDING_CLEARANCE,
      Math.max(...zs) + BUILDING_CLEARANCE,
      { polygons },
    );
  }
  const segments = new Grid<Segment>();
  for (const road of world.roads) {
    const halfWidth = roadWidth(road) / 2;
    for (let index = 0; index < road.polylineENU.length - 1; index++) {
      const a = road.polylineENU[index]!;
      const b = road.polylineENU[index + 1]!;
      const pad = halfWidth + CARRIAGEWAY_MARGIN;
      segments.insert(
        Math.min(a[0], b[0]) - pad,
        Math.min(a[1], b[1]) - pad,
        Math.max(a[0], b[0]) + pad,
        Math.max(a[1], b[1]) + pad,
        { a, b, halfWidth, roadId: road.localId },
      );
    }
  }
  // A junction is a road end shared by 3+ road ends, or a road end touching another road's body.
  const ends = world.roads.flatMap((road) =>
    road.polylineENU.length < 2
      ? []
      : [
          { p: road.polylineENU[0]!, roadId: road.localId },
          { p: road.polylineENU[road.polylineENU.length - 1]!, roadId: road.localId },
        ],
  );
  const junctions = new Grid<Position2>();
  for (const end of ends) {
    const shared = ends.filter(
      (other) => Math.hypot(other.p[0] - end.p[0], other.p[1] - end.p[1]) < 1,
    ).length;
    const touchesBody = segments
      .near(end.p)
      .some(
        (segment) =>
          segment.roadId !== end.roadId && distanceToSegment(end.p, segment.a, segment.b) < 1,
      );
    if (shared >= 3 || touchesBody) {
      const r = JUNCTION_RADIUS;
      junctions.insert(end.p[0] - r, end.p[1] - r, end.p[0] + r, end.p[1] + r, end.p);
    }
  }
  return { homeCentre: surroundingsHomeCentre(world), buildings, segments, junctions };
}

export type RejectReason = "home" | "building" | "carriageway" | "junction" | null;

/** Placement invariants shared by the generator and the tests (ADR §8.4). */
export function rejectReason(
  context: PlacementContext,
  p: Position2,
  homeExclusionRadius: number,
): RejectReason {
  if (Math.hypot(p[0] - context.homeCentre[0], p[1] - context.homeCentre[1]) < homeExclusionRadius)
    return "home";
  for (const building of context.buildings.near(p))
    for (const polygon of building.polygons) {
      if (pointInPolygon(p, polygon)) return "building";
      for (const ring of polygon.coordinates) {
        const points = ringWithoutClosure(ring);
        for (let index = 0; index < points.length; index++)
          if (
            distanceToSegment(p, points[index]!, points[(index + 1) % points.length]!) <
            BUILDING_CLEARANCE
          )
            return "building";
      }
    }
  for (const segment of context.segments.near(p))
    if (distanceToSegment(p, segment.a, segment.b) < segment.halfWidth + CARRIAGEWAY_MARGIN)
      return "carriageway";
  for (const junction of context.junctions.near(p))
    if (Math.hypot(p[0] - junction[0], p[1] - junction[1]) < JUNCTION_RADIUS) return "junction";
  return null;
}

/* ------------------------------------------------------------ generator */

interface Slot {
  key: string;
  position: Position2;
  /** Road direction at the slot (radians, atan2 in the x/z plane). */
  direction: number;
  distance: number;
}

/** Points every `spacing` metres along a road, offset to one side (+1 left / -1 right). */
function roadSlots(
  road: RoadSegment,
  spacing: number,
  side: 1 | -1,
  offset: number,
  kind: string,
  seed: number,
): Slot[] {
  const slots: Slot[] = [];
  const points = road.polylineENU;
  let travelled = 0;
  let next = spacing * (0.35 + 0.3 * hash01(`${seed}|${road.localId}|${kind}|${side}|phase`));
  let index = 0;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const a = points[segment]!;
    const b = points[segment + 1]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const ux = (b[0] - a[0]) / length;
    const uz = (b[1] - a[1]) / length;
    while (next <= travelled + length) {
      const t = next - travelled;
      const key = `${seed}|${road.localId}|${kind}|${side}|${index}`;
      const jitter = (hash01(`${key}|jitter`) - 0.5) * 0.3 * spacing;
      const along = Math.max(0, Math.min(length, t + jitter));
      const position: Position2 = [
        round2(a[0] + ux * along - uz * offset * side),
        round2(a[1] + uz * along + ux * offset * side),
      ];
      slots.push({ key, position, direction: Math.atan2(uz, ux), distance: 0 });
      index += 1;
      next += spacing;
    }
    travelled += length;
  }
  return slots;
}

function densityFactor(distance: number, layer: EnrichmentLayer) {
  const { denseRadius, midRadius, midFactor, farFactor } = layer.generator.density;
  if (distance <= denseRadius) return 1;
  if (distance <= midRadius) return midFactor;
  return farFactor;
}

const TREE_CLASSES: readonly RoadClass[] = [
  "primary",
  "secondary",
  "residential",
  "alley",
  "service",
  "unknown",
];
const POLE_CLASSES: ReadonlySet<RoadClass> = new Set([
  "primary",
  "secondary",
  "residential",
  "alley",
]);
const LIGHT_CLASSES: ReadonlySet<RoadClass> = new Set(["primary", "secondary"]);
const BIKE_CLASSES: ReadonlySet<RoadClass> = new Set([
  "primary",
  "secondary",
  "residential",
  "alley",
]);
const CART_CLASSES: ReadonlySet<RoadClass> = new Set(["primary", "secondary"]);
const ARCHETYPES: readonly TreeArchetype[] = [
  "broadleaf",
  "broadleaf",
  "round",
  "round",
  "flowering",
  "palm",
];

const SYNTHETIC: Provenance = { source: "synthetic", quality: "synthetic" };

interface Candidate<T> {
  item: T;
  priority: number;
}

function takeTier<T extends { localId: string }>(candidates: Candidate<T>[], cap: number): T[] {
  return candidates
    .slice()
    .sort((a, b) => a.priority - b.priority || a.item.localId.localeCompare(b.item.localId))
    .slice(0, cap)
    .map((candidate) => candidate.item)
    .sort((a, b) => a.localId.localeCompare(b.localId));
}

function generatedId(prefix: string, key: string) {
  return `${prefix}-gen-${fnv1a(key).toString(36)}-${fnv1a(`${key}|b`).toString(36)}`;
}

export function planSurroundings(
  world: WorldData,
  layer: EnrichmentLayer,
  tier: DetailTier,
  context: PlacementContext = createPlacementContext(world),
): SurroundingsPlan {
  const { generator } = layer;
  const seed = generator.seed;
  const home = context.homeCentre;
  const distanceFromHome = (p: Position2) => Math.hypot(p[0] - home[0], p[1] - home[1]);
  const source = layer.sources.find((entry) => entry.kind === "osm");
  const osmProvenance: Provenance = {
    source: "osm",
    quality: "source_only",
    licence: "ODbL-1.0",
    ...(source ? { sourceNamespace: source.namespace, sourceRevision: source.revision } : {}),
  };
  const trees: Candidate<PlannedTree>[] = [];
  const props: Candidate<PlannedProp>[] = [];
  const capTreeHeight = (p: Position2, height: number) =>
    distanceFromHome(p) < generator.homeDominanceRadius ? Math.min(height, 4.5) : height;

  // 1. Sourced OSM facts always come first (priority < 0) and are never thinned by density.
  for (const fact of layer.pointFacts) {
    if (fact.kind === "tree") {
      const height = round2(capTreeHeight(fact.position, fact.height?.value ?? 5.5));
      trees.push({
        priority: -1,
        item: {
          localId: fact.localId,
          position: [fact.position[0], fact.position[1]],
          height,
          archetype:
            fact.archetype ??
            ARCHETYPES[Math.floor(hash01(`${seed}|${fact.localId}|arch`) * ARCHETYPES.length)]!,
          origin: "osm",
          provenance: { ...osmProvenance },
        },
      });
    } else {
      props.push({
        priority: -1,
        item: {
          localId: fact.localId,
          position: [fact.position[0], fact.position[1]],
          kind: fact.kind,
          heading: round2(hash01(`${seed}|${fact.localId}|heading`) * Math.PI * 2),
          origin: "osm",
          variant: 0,
          provenance: { ...osmProvenance },
        },
      });
    }
  }

  // 2. Procedural candidates along roads, thinned by distance from the home centre.
  const accept = (slot: Slot, extra = "") => {
    const distance = distanceFromHome(slot.position);
    if (hash01(`${slot.key}|density${extra}`) >= densityFactor(distance, layer)) return false;
    return rejectReason(context, slot.position, generator.homeExclusionRadius) === null;
  };
  const roads = [...world.roads].sort((a, b) => a.localId.localeCompare(b.localId));
  for (const road of roads) {
    if (road.polylineENU.length < 2 || !TREE_CLASSES.includes(road.roadClass)) continue;
    const half = roadWidth(road) / 2;
    const treeSpacing = generator.streetTreeSpacing[road.roadClass] ?? 0;
    for (const side of [1, -1] as const) {
      if (treeSpacing > 0)
        for (const slot of roadSlots(road, treeSpacing, side, half + 1.5, "tree", seed)) {
          if (!accept(slot)) continue;
          const height = capTreeHeight(
            slot.position,
            4 + hash01(`${slot.key}|height`) * (road.roadClass === "primary" ? 4 : 3),
          );
          trees.push({
            priority: hash01(`${slot.key}|priority`),
            item: {
              localId: generatedId("tree", slot.key),
              position: slot.position,
              height: round2(height),
              archetype: ARCHETYPES[Math.floor(hash01(`${slot.key}|arch`) * ARCHETYPES.length)]!,
              origin: "estimated_procedural",
              provenance: { ...SYNTHETIC },
            },
          });
        }
      if (side === 1 && POLE_CLASSES.has(road.roadClass))
        for (const slot of roadSlots(road, generator.poleSpacing, side, half + 0.6, "pole", seed))
          if (accept(slot))
            props.push({
              priority: hash01(`${slot.key}|priority`),
              item: {
                localId: generatedId("pole", slot.key),
                position: slot.position,
                kind: "electric_pole",
                heading: round2(slot.direction),
                origin: "estimated_procedural",
                variant: 0,
                provenance: { ...SYNTHETIC },
              },
            });
      if (side === -1 && LIGHT_CLASSES.has(road.roadClass))
        for (const slot of roadSlots(road, generator.poleSpacing, side, half + 0.6, "light", seed))
          if (accept(slot))
            props.push({
              priority: hash01(`${slot.key}|priority`),
              item: {
                localId: generatedId("light", slot.key),
                position: slot.position,
                kind: "street_light",
                // Lamp arm points over the carriageway.
                heading: round2(slot.direction + (side === -1 ? Math.PI / 2 : -Math.PI / 2)),
                origin: "estimated_procedural",
                variant: 0,
                provenance: { ...SYNTHETIC },
              },
            });
      if (BIKE_CLASSES.has(road.roadClass) && generator.parkedMotorbikesPer100m > 0) {
        // Bikes park in short rows of 2–4, nose towards the buildings.
        const clusterSpacing = 300 / generator.parkedMotorbikesPer100m;
        for (const slot of roadSlots(road, clusterSpacing, side, half + 1.0, "bike", seed)) {
          const count = 2 + Math.floor(hash01(`${slot.key}|count`) * 3);
          const priority = hash01(`${slot.key}|priority`);
          for (let bike = 0; bike < count; bike++) {
            const along = (bike - (count - 1) / 2) * 0.85;
            const bikeSlot: Slot = {
              ...slot,
              key: `${slot.key}|${bike}`,
              position: [
                round2(slot.position[0] + Math.cos(slot.direction) * along),
                round2(slot.position[1] + Math.sin(slot.direction) * along),
              ],
            };
            if (bike === 0) {
              if (!accept(bikeSlot)) break;
            } else if (
              rejectReason(context, bikeSlot.position, generator.homeExclusionRadius) !== null
            )
              continue;
            const wobble = (hash01(`${bikeSlot.key}|wobble`) - 0.5) * 0.35;
            props.push({
              priority: priority + bike * 1e-6,
              item: {
                localId: generatedId("bike", bikeSlot.key),
                position: bikeSlot.position,
                kind: "parked_motorbike",
                heading: round2(slot.direction + (side * Math.PI) / 2 + wobble),
                origin: "estimated_procedural",
                variant: Math.floor(hash01(`${bikeSlot.key}|colour`) * 6),
                provenance: { ...SYNTHETIC },
              },
            });
          }
        }
      }
      if (CART_CLASSES.has(road.roadClass) && generator.vendorCartsPer100m > 0)
        for (const slot of roadSlots(
          road,
          100 / generator.vendorCartsPer100m,
          side,
          half + 1.3,
          "cart",
          seed,
        ))
          if (accept(slot))
            props.push({
              priority: hash01(`${slot.key}|priority`),
              item: {
                localId: generatedId("cart", slot.key),
                position: slot.position,
                kind: "vendor_cart",
                heading: round2(slot.direction),
                origin: "estimated_procedural",
                variant: Math.floor(hash01(`${slot.key}|colour`) * 4),
                provenance: { ...SYNTHETIC },
              },
            });
    }
  }

  const caps = SURROUNDINGS_TIER_CAPS[tier];
  return {
    tier,
    seed,
    trees: takeTier(trees, caps.trees),
    props: takeTier(props, caps.props),
  };
}
