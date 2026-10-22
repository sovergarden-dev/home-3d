import type { Position2, RoadSegment, WorldData } from "@/world/schema";

export type LifeDirection = "forward" | "reverse" | "both";
export interface LifeNode {
  id: number;
  x: number;
  z: number;
  elevationLayer?: number;
  structure?: RoadSegment["structure"];
}
export interface LifeEdge {
  id: number;
  roadId: string;
  from: number;
  to: number;
  points: Float32Array;
  cumulative: Float32Array;
  length: number;
  width: number;
  lanes: number;
  sidewalkWidth: number;
  roadClass: RoadSegment["roadClass"];
  direction: LifeDirection;
  inferredWidth: boolean;
  inferredLanes: boolean;
  inferredSidewalk: boolean;
}
export interface LifeGraph {
  enabled: boolean;
  disabledReason?: string;
  nodes: LifeNode[];
  edges: LifeEdge[];
  bounds: [number, number, number, number];
}
const finite = (n: number) => Number.isFinite(n);
const dist = (a: Position2, b: Position2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const widthFor = (road: RoadSegment) => {
  const inferred = !finite(road.carriagewayWidth ?? NaN) || (road.carriagewayWidth ?? 0) <= 0;
  const value = inferred
    ? road.roadClass === "primary"
      ? 9
      : road.roadClass === "secondary"
        ? 7
        : road.roadClass === "alley"
          ? 3.2
          : 5.5
    : road.carriagewayWidth!;
  return { width: Math.max(2, Math.min(30, value)), inferred };
};
type Prepared = { road: RoadSegment; points: Position2[]; cuts: number[][]; length: number[] };
function intersection(
  a: Position2,
  b: Position2,
  c: Position2,
  d: Position2,
): [number, number] | undefined {
  const rX = b[0] - a[0],
    rZ = b[1] - a[1],
    sX = d[0] - c[0],
    sZ = d[1] - c[1];
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return undefined;
  const qX = c[0] - a[0],
    qZ = c[1] - a[1];
  const t = (qX * sZ - qZ * sX) / den,
    u = (qX * rZ - qZ * rX) / den;
  return t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7
    ? [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))]
    : undefined;
}
export function buildLifeGraph(world: WorldData): LifeGraph {
  const prepared: Prepared[] = [];
  for (const road of world.roads ?? []) {
    const points: Position2[] = [];
    for (const p of road.polylineENU ?? [])
      if (
        p &&
        finite(p[0]) &&
        finite(p[1]) &&
        (!points.length || dist(points[points.length - 1]!, p) > 0.01)
      )
        points.push([p[0], p[1]]);
    if (points.length < 2) continue;
    const length: number[] = [0];
    for (let i = 1; i < points.length; i++)
      length.push(length[i - 1]! + dist(points[i - 1]!, points[i]!));
    if (!(length[length.length - 1]! > 0.01)) continue;
    prepared.push({ road, points, length, cuts: points.map(() => []) });
  }
  for (let i = 0; i < prepared.length; i++)
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]!,
        b = prepared[j]!;
      if (
        a.road.elevationLayer !== b.road.elevationLayer ||
        (a.road.structure ?? "surface") !== (b.road.structure ?? "surface")
      )
        continue;
      for (let ai = 1; ai < a.points.length; ai++)
        for (let bi = 1; bi < b.points.length; bi++) {
          const hit = intersection(
            a.points[ai - 1]!,
            a.points[ai]!,
            b.points[bi - 1]!,
            b.points[bi]!,
          );
          if (!hit) continue;
          const at = a.length[ai - 1]! + (a.length[ai]! - a.length[ai - 1]!) * hit[0];
          const bt = b.length[bi - 1]! + (b.length[bi]! - b.length[bi - 1]!) * hit[1];
          a.cuts[ai - 1]!.push(at);
          b.cuts[bi - 1]!.push(bt);
        }
    }
  const nodes: LifeNode[] = [],
    edges: LifeEdge[] = [];
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  const findNode = (x: number, z: number, road: RoadSegment) => {
    for (const n of nodes)
      if (
        n.elevationLayer === road.elevationLayer &&
        n.structure === (road.structure ?? "surface") &&
        Math.hypot(n.x - x, n.z - z) <= 0.75
      )
        return n.id;
    const id = nodes.length;
    nodes.push({
      id,
      x,
      z,
      elevationLayer: road.elevationLayer,
      structure: road.structure ?? "surface",
    });
    return id;
  };
  for (const item of prepared) {
    const { road, points, length, cuts } = item;
    const total = length[length.length - 1]!;
    const dimensions = widthFor(road);
    const rawLanes = road.attributes?.["lanes"];
    const lanesNumber = rawLanes && typeof rawLanes !== "object" ? Number(rawLanes) : NaN;
    const inferredLanes = !finite(lanesNumber) || lanesNumber < 1;
    const lanes = inferredLanes
      ? Math.max(1, Math.round(dimensions.width / 3))
      : Math.max(1, Math.min(8, Math.round(lanesNumber)));
    const side = road.sidewalkWidths,
      inferredSidewalk = !side || !finite(side[0]) || !finite(side[1]);
    const sidewalkWidth = inferredSidewalk
      ? dimensions.width >= 5
        ? 1.4
        : 0.8
      : Math.max(0, (side[0] + side[1]) / 2);
    const breaks = [0, total];
    for (const segment of cuts)
      for (const d of segment) if (d > 0.01 && d < total - 0.01) breaks.push(d);
    breaks.sort((x, y) => x - y);
    const unique: number[] = [];
    for (const d of breaks)
      if (!unique.length || d - unique[unique.length - 1]! > 0.01) unique.push(d);
    const sample = (d: number): Position2 => {
      let i = 1;
      while (i < length.length && length[i]! < d) i++;
      const span = length[i]! - length[i - 1]! || 1,
        t = (d - length[i - 1]!) / span;
      return [
        points[i - 1]![0] + (points[i]![0] - points[i - 1]![0]) * t,
        points[i - 1]![1] + (points[i]![1] - points[i - 1]![1]) * t,
      ];
    };
    for (let k = 1; k < unique.length; k++) {
      const a = sample(unique[k - 1]!),
        b = sample(unique[k]!);
      const from = findNode(a[0], a[1], road),
        to = findNode(b[0], b[1], road);
      const p0 = unique[k - 1]!,
        p1 = unique[k]!;
      const pts: Position2[] = [a];
      for (let i = 1; i < points.length - 1; i++)
        if (length[i]! > p0 && length[i]! < p1) pts.push(points[i]!);
      pts.push(b);
      const flat = new Float32Array(pts.length * 2),
        cumulative = new Float32Array(pts.length);
      let segLength = 0;
      for (let i = 0; i < pts.length; i++) {
        flat[i * 2] = pts[i]![0];
        flat[i * 2 + 1] = pts[i]![1];
        if (i) segLength += dist(pts[i - 1]!, pts[i]!);
        cumulative[i] = segLength;
        minX = Math.min(minX, pts[i]![0]);
        minZ = Math.min(minZ, pts[i]![1]);
        maxX = Math.max(maxX, pts[i]![0]);
        maxZ = Math.max(maxZ, pts[i]![1]);
      }
      if (segLength > 0.01)
        edges.push({
          id: edges.length,
          roadId: road.localId,
          from,
          to,
          points: flat,
          cumulative,
          length: segLength,
          width: dimensions.width,
          lanes,
          sidewalkWidth,
          roadClass: road.roadClass,
          direction:
            road.direction === "forward" || road.direction === "reverse" ? road.direction : "both",
          inferredWidth: dimensions.inferred,
          inferredLanes,
          inferredSidewalk,
        });
    }
  }
  if (!edges.length)
    return {
      enabled: false,
      disabledReason: "No usable road segments",
      nodes,
      edges,
      bounds: [0, 0, 0, 0],
    };
  return { enabled: true, nodes, edges, bounds: [minX, minZ, maxX, maxZ] };
}
