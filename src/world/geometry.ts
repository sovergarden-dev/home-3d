import type { LinearRing, PolygonGeometry, Position2, SurfaceGeometry } from "./schema";

const EPSILON = 1e-9;

export function samePosition(a: Position2, b: Position2, tolerance = EPSILON) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

export function ringWithoutClosure(ring: LinearRing) {
  if (ring.length > 1 && samePosition(ring[0]!, ring.at(-1)!)) return ring.slice(0, -1);
  return [...ring];
}

export function signedRingArea(ring: LinearRing) {
  const points = ringWithoutClosure(ring);
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function orientation(a: Position2, b: Position2, c: Position2) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: Position2, start: Position2, end: Position2) {
  return (
    Math.abs(orientation(start, end, point)) <= EPSILON &&
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  );
}

export function segmentsCrossProper(
  a: Position2,
  b: Position2,
  c: Position2,
  d: Position2,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (
    ((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON)) &&
    ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))
  );
}

export function segmentsIntersect(a: Position2, b: Position2, c: Position2, d: Position2) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (Math.abs(o1) <= EPSILON && pointOnSegment(c, a, b)) return true;
  if (Math.abs(o2) <= EPSILON && pointOnSegment(d, a, b)) return true;
  if (Math.abs(o3) <= EPSILON && pointOnSegment(a, c, d)) return true;
  if (Math.abs(o4) <= EPSILON && pointOnSegment(b, c, d)) return true;

  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

export function ringEdges(ring: LinearRing): [Position2, Position2][] {
  const points = ringWithoutClosure(ring);
  if (points.length < 2) return [];
  return points.map(
    (point, index) => [point, points[(index + 1) % points.length]!] as [Position2, Position2],
  );
}

export function isSimpleRing(ring: LinearRing) {
  const points = ringWithoutClosure(ring);
  if (points.length < 3) return false;
  if (ringEdges(ring).some(([start, end]) => samePosition(start, end))) return false;

  const edges = ringEdges(ring);
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      const adjacent =
        second === first + 1 ||
        (first === 0 && second === edges.length - 1) ||
        (second === 0 && first === edges.length - 1);
      if (adjacent) continue;
      const [a, b] = edges[first]!;
      const [c, d] = edges[second]!;
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

export function pointInRing(point: Position2, ring: LinearRing) {
  const points = ringWithoutClosure(ring);
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Position2, polygon: PolygonGeometry) {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

export function polygonsOf(geometry: SurfaceGeometry): PolygonGeometry[] {
  return geometry.type === "Polygon"
    ? [geometry]
    : geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}

function polygonsIntersect(a: PolygonGeometry, b: PolygonGeometry) {
  for (const ringA of a.coordinates) {
    for (const ringB of b.coordinates) {
      for (const [a1, a2] of ringEdges(ringA)) {
        for (const [b1, b2] of ringEdges(ringB)) {
          if (segmentsIntersect(a1, a2, b1, b2)) return true;
        }
      }
    }
  }

  const aProbe = ringWithoutClosure(a.coordinates[0] ?? [])[0];
  const bProbe = ringWithoutClosure(b.coordinates[0] ?? [])[0];
  return Boolean((aProbe && pointInPolygon(aProbe, b)) || (bProbe && pointInPolygon(bProbe, a)));
}

export function isPointStrictlyInsidePolygon(point: Position2, polygon: PolygonGeometry): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || !pointInRing(point, outer)) return false;
  // If point lies directly on any outer segment, it is NOT strictly inside
  const outerPoints = ringWithoutClosure(outer);
  for (let i = 0, prev = outerPoints.length - 1; i < outerPoints.length; prev = i++) {
    if (pointOnSegment(point, outerPoints[prev]!, outerPoints[i]!)) return false;
  }
  // Check holes
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

export function polygonsHaveAreaOverlap(a: PolygonGeometry, b: PolygonGeometry): boolean {
  // 1. Any edge of A properly crosses an edge of B (interior intersection)
  for (const ringA of a.coordinates) {
    for (const ringB of b.coordinates) {
      for (const [a1, a2] of ringEdges(ringA)) {
        for (const [b1, b2] of ringEdges(ringB)) {
          if (segmentsCrossProper(a1, a2, b1, b2)) return true;
        }
      }
    }
  }

  // 2. An interior point of A is strictly inside B
  const pointsA = ringWithoutClosure(a.coordinates[0] ?? []);
  if (pointsA.length >= 3) {
    // Try centroid of first triangle or interior midpoint
    const midA: Position2 = [
      (pointsA[0]![0] + pointsA[1]![0] + pointsA[2]![0]) / 3,
      (pointsA[0]![1] + pointsA[1]![1] + pointsA[2]![1]) / 3,
    ];
    if (isPointStrictlyInsidePolygon(midA, a) && isPointStrictlyInsidePolygon(midA, b)) {
      return true;
    }
    // Also test a few interior candidate points
    for (let i = 0; i < pointsA.length; i++) {
      const p1 = pointsA[i]!;
      const p2 = pointsA[(i + 1) % pointsA.length]!;
      const midEdge: Position2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const inward: Position2 = [
        midEdge[0] + (midA[0] - midEdge[0]) * 0.1,
        midEdge[1] + (midA[1] - midEdge[1]) * 0.1,
      ];
      if (isPointStrictlyInsidePolygon(inward, a) && isPointStrictlyInsidePolygon(inward, b)) {
        return true;
      }
    }
  }

  // 3. An interior point of B is strictly inside A
  const pointsB = ringWithoutClosure(b.coordinates[0] ?? []);
  if (pointsB.length >= 3) {
    const midB: Position2 = [
      (pointsB[0]![0] + pointsB[1]![0] + pointsB[2]![0]) / 3,
      (pointsB[0]![1] + pointsB[1]![1] + pointsB[2]![1]) / 3,
    ];
    if (isPointStrictlyInsidePolygon(midB, b) && isPointStrictlyInsidePolygon(midB, a)) {
      return true;
    }
    for (let i = 0; i < pointsB.length; i++) {
      const p1 = pointsB[i]!;
      const p2 = pointsB[(i + 1) % pointsB.length]!;
      const midEdge: Position2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const inward: Position2 = [
        midEdge[0] + (midB[0] - midEdge[0]) * 0.1,
        midEdge[1] + (midB[1] - midEdge[1]) * 0.1,
      ];
      if (isPointStrictlyInsidePolygon(inward, b) && isPointStrictlyInsidePolygon(inward, a)) {
        return true;
      }
    }
  }

  return false;
}

export function surfaceAreaIntersects(a: SurfaceGeometry, b: SurfaceGeometry): boolean {
  return polygonsOf(a).some((polygonA) =>
    polygonsOf(b).some((polygonB) => polygonsHaveAreaOverlap(polygonA, polygonB)),
  );
}

export function surfaceIntersects(a: SurfaceGeometry, b: SurfaceGeometry) {
  return polygonsOf(a).some((polygonA) =>
    polygonsOf(b).some((polygonB) => polygonsIntersect(polygonA, polygonB)),
  );
}

export function validateSurfaceGeometry(geometry: SurfaceGeometry) {
  const issues: string[] = [];
  const polygons = polygonsOf(geometry);
  if (polygons.length === 0) issues.push("GEOMETRY_EMPTY");

  polygons.forEach((polygon, polygonIndex) => {
    const [outer, ...holes] = polygon.coordinates;
    if (!outer || outer.length < 4 || !samePosition(outer[0]!, outer.at(-1)!)) {
      issues.push(`POLYGON_${polygonIndex}_OUTER_RING_NOT_CLOSED`);
      return;
    }
    if (!isSimpleRing(outer)) issues.push(`POLYGON_${polygonIndex}_OUTER_RING_SELF_INTERSECTS`);
    if (Math.abs(signedRingArea(outer)) <= EPSILON)
      issues.push(`POLYGON_${polygonIndex}_OUTER_RING_ZERO_AREA`);

    holes.forEach((hole, holeIndex) => {
      if (hole.length < 4 || !samePosition(hole[0]!, hole.at(-1)!)) {
        issues.push(`POLYGON_${polygonIndex}_HOLE_${holeIndex}_NOT_CLOSED`);
        return;
      }
      if (!isSimpleRing(hole))
        issues.push(`POLYGON_${polygonIndex}_HOLE_${holeIndex}_SELF_INTERSECTS`);

      const holePoints = ringWithoutClosure(hole);
      // Check that ALL vertices of the hole are contained inside or on boundary of outer ring
      const allPointsInside = holePoints.every((pt) => pointInRing(pt, outer));
      if (!allPointsInside) {
        issues.push(`POLYGON_${polygonIndex}_HOLE_${holeIndex}_OUTSIDE_OUTER_RING`);
      }

      // Check that hole edges do not properly cross outer ring edges
      const outerEdges = ringEdges(outer);
      const holeEdges = ringEdges(hole);
      let holeCrossesOuter = false;
      for (const [h1, h2] of holeEdges) {
        for (const [o1, o2] of outerEdges) {
          if (segmentsCrossProper(h1, h2, o1, o2)) {
            holeCrossesOuter = true;
            break;
          }
        }
        if (holeCrossesOuter) break;
      }
      if (holeCrossesOuter && allPointsInside) {
        issues.push(`POLYGON_${polygonIndex}_HOLE_${holeIndex}_OUTSIDE_OUTER_RING`);
      }
    });

    // Check that holes within the same polygon do not overlap each other
    for (let hA = 0; hA < holes.length; hA++) {
      for (let hB = hA + 1; hB < holes.length; hB++) {
        const polyA: PolygonGeometry = { type: "Polygon", coordinates: [holes[hA]!] };
        const polyB: PolygonGeometry = { type: "Polygon", coordinates: [holes[hB]!] };
        if (polygonsHaveAreaOverlap(polyA, polyB)) {
          issues.push(`POLYGON_${polygonIndex}_HOLES_OVERLAP`);
        }
      }
    }
  });

  // For MultiPolygon, check that component polygons do not overlap with positive area
  if (geometry.type === "MultiPolygon") {
    const polys = polygonsOf(geometry);
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        if (polygonsHaveAreaOverlap(polys[i]!, polys[j]!)) {
          issues.push(`MULTIPOLYGON_COMPONENTS_OVERLAP`);
        }
      }
    }
  }

  return issues;
}

export function cloneSurfaceGeometry(geometry: SurfaceGeometry): SurfaceGeometry {
  return geometry.type === "Polygon"
    ? {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) => ring.map(([x, z]) => [x, z])),
      }
    : {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(([x, z]) => [x, z])),
        ),
      };
}

export function surfaceBounds(geometry: SurfaceGeometry) {
  const positions = polygonsOf(geometry).flatMap((polygon) => polygon.coordinates.flat());
  if (positions.length === 0) throw new Error("GEOMETRY_HAS_NO_POSITIONS");
  return positions.reduce(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      minZ: Math.min(bounds.minZ, z),
      maxX: Math.max(bounds.maxX, x),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  );
}

export function surfaceCentroid(geometry: SurfaceGeometry): Position2 {
  const polygon = polygonsOf(geometry)[0];
  const outer = polygon?.coordinates[0];
  const positions = outer ? ringWithoutClosure(outer) : [];
  if (positions.length === 0) throw new Error("GEOMETRY_HAS_NO_POSITIONS");
  const total = positions.reduce<[number, number]>(
    (sum, [x, z]) => [sum[0] + x, sum[1] + z],
    [0, 0],
  );
  return [total[0] / positions.length, total[1] / positions.length];
}
