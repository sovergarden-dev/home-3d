import type { WorldData, SurfaceGeometry } from "@/world/schema";

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}
export interface CollisionPoint {
  x: number;
  z: number;
}
export type DynamicObstacles = readonly CollisionBox[] | (() => readonly CollisionBox[]);
interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  box: CollisionBox;
}
interface Node {
  box: CollisionBox;
  items?: Segment[];
  left?: Node;
  right?: Node;
}
export interface CollisionBvh {
  root: Node | null;
  bounds: CollisionBox;
  segmentCount: number;
}

const boxFor = (a: CollisionPoint, b: CollisionPoint): CollisionBox => ({
  minX: Math.min(a.x, b.x),
  maxX: Math.max(a.x, b.x),
  minZ: Math.min(a.z, b.z),
  maxZ: Math.max(a.z, b.z),
});
function rings(geometry: SurfaceGeometry): number[][][] {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}
function extendBox(a: CollisionBox, b: CollisionBox): CollisionBox {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}
function makeNode(items: Segment[]): Node {
  const first = items[0];
  if (!first) throw new Error("Cannot build an empty collision node");
  let box = first.box;
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (item) box = extendBox(box, item.box);
  }
  if (items.length <= 8) return { box, items };
  const axis = box.maxX - box.minX >= box.maxZ - box.minZ ? "x" : "z";
  items.sort(
    (a, b) =>
      a.box[`min${axis.toUpperCase()}` as "minX" | "minZ"] +
      a.box[`max${axis.toUpperCase()}` as "maxX" | "maxZ"] -
      (b.box[`min${axis.toUpperCase()}` as "minX" | "minZ"] +
        b.box[`max${axis.toUpperCase()}` as "maxX" | "maxZ"]),
  );
  const mid = Math.floor(items.length / 2);
  return { box, left: makeNode(items.slice(0, mid)), right: makeNode(items.slice(mid)) };
}
function allPoints(world: WorldData): CollisionPoint[] {
  const out: CollisionPoint[] = [];
  const add = (geometry: SurfaceGeometry) =>
    rings(geometry).forEach((ring) =>
      ring.forEach(([x, z]) => {
        if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x: x as number, z: z as number });
      }),
    );
  world.buildings
    .filter((b) => !b.hidden)
    .forEach((b) => {
      add(b.geometry);
      b.parts?.forEach((p) => add(p.geometry));
    });
  return out;
}
export function buildCollisionBvh(world: WorldData, obstacles: CollisionBox[] = []): CollisionBvh {
  const segments: Segment[] = [];
  const add = (geometry: SurfaceGeometry) =>
    rings(geometry).forEach((ring) => {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i],
          q = ring[(i + 1) % ring.length];
        if (p && q && p.length >= 2 && q.length >= 2) {
          const a = { x: p[0] as number, z: p[1] as number },
            b = { x: q[0] as number, z: q[1] as number };
          if ([a.x, a.z, b.x, b.z].every(Number.isFinite) && (a.x !== b.x || a.z !== b.z))
            segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, box: boxFor(a, b) });
        }
      }
    });
  world.buildings
    .filter((b) => !b.hidden)
    .forEach((b) => {
      add(b.geometry);
      b.parts?.forEach((p) => add(p.geometry));
    });
  obstacles.forEach((o) => {
    const corners: [number, number][] = [
      [o.minX, o.minZ],
      [o.maxX, o.minZ],
      [o.maxX, o.maxZ],
      [o.minX, o.maxZ],
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!,
        b = corners[(i + 1) % 4]!;
      segments.push({
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        box: boxFor({ x: a[0], z: a[1] }, { x: b[0], z: b[1] }),
      });
    }
  });
  const points = allPoints(world).concat(
    obstacles.flatMap((o) => [
      { x: o.minX, z: o.minZ },
      { x: o.maxX, z: o.maxZ },
    ]),
  );
  let bounds: CollisionBox = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  if (points.length) {
    bounds = points.reduce(
      (b, p) => ({
        minX: Math.min(b.minX, p.x),
        maxX: Math.max(b.maxX, p.x),
        minZ: Math.min(b.minZ, p.z),
        maxZ: Math.max(b.maxZ, p.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
  }
  const chunks = world.manifest.chunks.filter((c) => c.bounds.every(Number.isFinite));
  if (chunks.length) {
    bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const chunk of chunks)
      bounds = extendBox(bounds, {
        minX: chunk.bounds[0],
        minZ: chunk.bounds[1],
        maxX: chunk.bounds[2],
        maxZ: chunk.bounds[3],
      });
  }

  return {
    root: segments.length ? makeNode(segments) : null,
    bounds,
    segmentCount: segments.length,
  };
}
function near(a: number, b: number, c: number) {
  return Math.max(a, Math.min(b, c));
}
export interface MovementResult {
  position: CollisionPoint;
  collisions: number;
}
function visit(node: Node | null, result: MovementResult, radius: number) {
  const x = result.position.x,
    z = result.position.z;
  if (
    !node ||
    x + radius < node.box.minX ||
    x - radius > node.box.maxX ||
    z + radius < node.box.minZ ||
    z - radius > node.box.maxZ
  )
    return;
  if (!node.items) {
    visit(node.left ?? null, result, radius);
    visit(node.right ?? null, result, radius);
    return;
  }
  for (const segment of node.items) {
    const dx = segment.bx - segment.ax,
      dz = segment.bz - segment.az;
    const t = near(
      0,
      1,
      ((result.position.x - segment.ax) * dx + (result.position.z - segment.az) * dz) /
        (dx * dx + dz * dz || 1),
    );
    const ox = result.position.x - segment.ax - t * dx,
      oz = result.position.z - segment.az - t * dz;
    const distance = Math.hypot(ox, oz);
    if (distance >= radius) continue;
    if (distance < 1e-7) {
      const length = Math.hypot(dx, dz) || 1;
      result.position.x -= (dz / length) * (radius + 1e-4);
      result.position.z += (dx / length) * (radius + 1e-4);
    } else {
      const factor = (radius - distance + 1e-4) / distance;
      result.position.x += ox * factor;
      result.position.z += oz * factor;
    }
    result.collisions++;
  }
}
export function resolveMovement(
  bvh: CollisionBvh,
  from: CollisionPoint,
  delta: CollisionPoint,
  radius = 0.35,
  dynamicObstacles?: DynamicObstacles,
  out: MovementResult = { position: { x: 0, z: 0 }, collisions: 0 },
): MovementResult {
  radius = Number.isFinite(radius) ? Math.max(0.05, radius) : 0.35;
  out.position.x = Number.isFinite(from.x) ? from.x : 0;
  out.position.z = Number.isFinite(from.z) ? from.z : 0;
  out.collisions = 0;
  const dx = Number.isFinite(delta.x) ? delta.x : 0,
    dz = Number.isFinite(delta.z) ? delta.z : 0;
  const length = Math.hypot(dx, dz);
  // Public API rejects enormous/nonfinite travel rather than unbounded substep work.
  const scale = length > 100 ? 100 / length : 1;
  const steps = Math.max(1, Math.ceil((length * scale) / Math.max(radius * 0.5, 0.05)));
  const sx = (dx * scale) / steps,
    sz = (dz * scale) / steps;
  const moving = typeof dynamicObstacles === "function" ? dynamicObstacles() : dynamicObstacles;
  for (let step = 0; step < steps; step++) {
    out.position.x += sx;
    out.position.z += sz;
    for (let pass = 0; pass < 3; pass++) {
      visit(bvh.root, out, radius);
      if (moving)
        for (const obstacle of moving) {
          const minX = obstacle.minX - radius,
            maxX = obstacle.maxX + radius,
            minZ = obstacle.minZ - radius,
            maxZ = obstacle.maxZ + radius;
          const x = out.position.x,
            z = out.position.z;
          if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
          const left = x - minX,
            right = maxX - x,
            top = z - minZ,
            bottom = maxZ - z;
          if (left <= right && left <= top && left <= bottom) out.position.x = minX - 1e-4;
          else if (right <= top && right <= bottom) out.position.x = maxX + 1e-4;
          else if (top <= bottom) out.position.z = minZ - 1e-4;
          else out.position.z = maxZ + 1e-4;
          out.collisions++;
        }
      out.position.x = Math.max(
        bvh.bounds.minX + radius,
        Math.min(bvh.bounds.maxX - radius, out.position.x),
      );
      out.position.z = Math.max(
        bvh.bounds.minZ + radius,
        Math.min(bvh.bounds.maxZ - radius, out.position.z),
      );
    }
  }
  return out;
}
