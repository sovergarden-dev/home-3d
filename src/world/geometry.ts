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

// Clip a subject polygon against a directed line p1 -> p2 (keeps left side: orientation >= -EPSILON)
function clipPolygonAgainstLine(poly: Position2[], p1: Position2, p2: Position2): Position2[] {
  if (poly.length === 0) return [];
  const out: Position2[] = [];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];

  const isLeft = (p: Position2) => dx * (p[1] - p1[1]) - dy * (p[0] - p1[0]) >= -1e-8;

  const lineIntersect = (a: Position2, b: Position2): Position2 => {
    const dpx = b[0] - a[0];
    const dpy = b[1] - a[1];
    const denom = dx * dpy - dy * dpx;
    if (Math.abs(denom) < 1e-10) return a;
    const t = ((a[0] - p1[0]) * dpy - (a[1] - p1[1]) * dpx) / denom;
    return [p1[0] + t * dx, p1[1] + t * dy];
  };

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i - 1 + poly.length) % poly.length]!;
    const curInside = isLeft(cur);
    const prevInside = isLeft(prev);

    if (curInside) {
      if (!prevInside) out.push(lineIntersect(prev, cur));
      out.push(cur);
    } else if (prevInside) {
      out.push(lineIntersect(prev, cur));
    }
  }
  return out;
}

// Compute the exact convex intersection of two convex polygons
function convexPolygonIntersection(convexA: Position2[], convexB: Position2[]): Position2[] {
  let result = convexA;
  const lenB = convexB.length;
  for (let i = 0; i < lenB; i++) {
    const p1 = convexB[i]!;
    const p2 = convexB[(i + 1) % lenB]!;
    result = clipPolygonAgainstLine(result, p1, p2);
    if (result.length < 3) return [];
  }
  return result;
}

// Triangulate any simple polygon (ear clipping)
export function triangulateSimplePolygon(ring: LinearRing): Position2[][] {
  let points = ringWithoutClosure(ring);
  if (points.length < 3) return [];
  // Ensure counter-clockwise orientation
  if (signedRingArea(points) < 0) {
    points = [...points].reverse();
  }

  const triangles: Position2[][] = [];
  const remaining = [...points];

  let iterations = 0;
  const maxIterations = remaining.length * remaining.length;

  while (remaining.length > 3 && iterations < maxIterations) {
    iterations++;
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length]!;
      const cur = remaining[i]!;
      const next = remaining[(i + 1) % remaining.length]!;

      // Check if angle is convex (left turn)
      const cross =
        (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
      if (cross <= 1e-9) continue; // Reflex angle

      // Check if any other point lies strictly inside triangle prev-cur-next
      let containsPoint = false;
      for (let j = 0; j < remaining.length; j++) {
        if (
          j === i ||
          j === (i - 1 + remaining.length) % remaining.length ||
          j === (i + 1) % remaining.length
        )
          continue;
        const pt = remaining[j]!;
        const c1 = (cur[0] - prev[0]) * (pt[1] - prev[1]) - (cur[1] - prev[1]) * (pt[0] - prev[0]);
        const c2 = (next[0] - cur[0]) * (pt[1] - cur[1]) - (next[1] - cur[1]) * (pt[0] - cur[0]);
        const c3 =
          (prev[0] - next[0]) * (pt[1] - next[1]) - (prev[1] - next[1]) * (pt[0] - next[0]);
        if (c1 > 1e-8 && c2 > 1e-8 && c3 > 1e-8) {
          containsPoint = true;
          break;
        }
      }

      if (!containsPoint) {
        triangles.push([prev, cur, next]);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      // Degenerate/nearly collinear: fan from remaining[0]
      for (let k = 1; k < remaining.length - 1; k++) {
        triangles.push([remaining[0]!, remaining[k]!, remaining[k + 1]!]);
      }
      break;
    }
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }

  return triangles;
}

// Compute the exact intersection area between two simple polygon rings (m²)
export function polygonRingIntersectionArea(ringA: LinearRing, ringB: LinearRing): number {
  const triA = triangulateSimplePolygon(ringA);
  const triB = triangulateSimplePolygon(ringB);

  let totalArea = 0;
  for (const tA of triA) {
    for (const tB of triB) {
      // Ensure tB is counter-clockwise for half-plane clipping
      const orderedTB = signedRingArea(tB) > 0 ? tB : [tB[0]!, tB[2]!, tB[1]!];
      const clipped = convexPolygonIntersection(tA, orderedTB);
      if (clipped.length >= 3) {
        totalArea += Math.abs(signedRingArea(clipped));
      }
    }
  }
  return totalArea;
}

function areaOfPolygonSurface(polygon: PolygonGeometry): number {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer) return 0;
  const area =
    Math.abs(signedRingArea(outer)) -
    holes.reduce((sum, hole) => sum + Math.abs(signedRingArea(hole)), 0);
  return Math.max(0, area);
}

function polygonSurfaceIntersectionArea(a: PolygonGeometry, b: PolygonGeometry): number {
  const [outerA, ...holesA] = a.coordinates;
  const [outerB, ...holesB] = b.coordinates;
  if (!outerA || !outerB) return 0;

  const outerIntersection = polygonRingIntersectionArea(outerA, outerB);
  const holeAOverlap = holesA.reduce(
    (sum, hole) => sum + polygonRingIntersectionArea(hole, outerB),
    0,
  );
  const holeBOverlap = holesB.reduce(
    (sum, hole) => sum + polygonRingIntersectionArea(outerA, hole),
    0,
  );
  // A point in both holes was subtracted once for each surface above; restore the
  // hole-hole intersection once (inclusion-exclusion) to avoid a negative result
  // for identical courtyards and to preserve partial courtyard overlaps.
  const sharedHoleOverlap = holesA.reduce(
    (sumA, holeA) =>
      sumA + holesB.reduce((sumB, holeB) => sumB + polygonRingIntersectionArea(holeA, holeB), 0),
    0,
  );
  return Math.max(0, outerIntersection - holeAOverlap - holeBOverlap + sharedHoleOverlap);
}

export function polygonSurfaceArea(polygon: PolygonGeometry): number {
  return areaOfPolygonSurface(polygon);
}

export function surfaceArea(geometry: SurfaceGeometry): number {
  return polygonsOf(geometry).reduce((sum, polygon) => sum + areaOfPolygonSurface(polygon), 0);
}

export function surfaceIntersectionArea(a: SurfaceGeometry, b: SurfaceGeometry): number {
  return polygonsOf(a).reduce(
    (sumA, polygonA) =>
      sumA +
      polygonsOf(b).reduce(
        (sumB, polygonB) => sumB + polygonSurfaceIntersectionArea(polygonA, polygonB),
        0,
      ),
    0,
  );
}

export function surfaceContains(
  container: SurfaceGeometry,
  candidate: SurfaceGeometry,
  tolerance = 1e-4,
): boolean {
  const candidateArea = surfaceArea(candidate);
  return (
    candidateArea > tolerance &&
    surfaceIntersectionArea(container, candidate) >= candidateArea - tolerance
  );
}

export function surfacePartitionCovers(
  parent: SurfaceGeometry,
  parts: SurfaceGeometry[],
  tolerance = 1e-4,
): boolean {
  if (parts.length === 0 || parts.some((part) => !surfaceContains(parent, part, tolerance)))
    return false;
  for (let first = 0; first < parts.length; first += 1) {
    for (let second = first + 1; second < parts.length; second += 1) {
      if (surfaceIntersectionArea(parts[first]!, parts[second]!) > tolerance) return false;
    }
  }
  const parentArea = surfaceArea(parent);
  const partsArea = parts.reduce((sum, part) => sum + surfaceArea(part), 0);
  return parentArea > tolerance && Math.abs(partsArea - parentArea) <= tolerance;
}

export function polygonsHaveAreaOverlap(a: PolygonGeometry, b: PolygonGeometry): boolean {
  return polygonSurfaceIntersectionArea(a, b) > 1e-4;
}

export function surfaceAreaIntersects(a: SurfaceGeometry, b: SurfaceGeometry): boolean {
  return surfaceIntersectionArea(a, b) > 1e-4;
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
  const ringCentroid = (ring: LinearRing): { centroid: Position2; area: number } => {
    const points = ringWithoutClosure(ring);
    let twiceArea = 0;
    let xWeighted = 0;
    let zWeighted = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      const cross = current[0] * next[1] - next[0] * current[1];
      twiceArea += cross;
      xWeighted += (current[0] + next[0]) * cross;
      zWeighted += (current[1] + next[1]) * cross;
    }
    const signedArea = twiceArea / 2;
    if (Math.abs(signedArea) <= EPSILON) return { centroid: [0, 0], area: 0 };
    return {
      centroid: [xWeighted / (6 * signedArea), zWeighted / (6 * signedArea)],
      area: Math.abs(signedArea),
    };
  };

  let totalArea = 0;
  let weightedX = 0;
  let weightedZ = 0;
  for (const polygon of polygonsOf(geometry)) {
    const [outer, ...holes] = polygon.coordinates;
    if (!outer) continue;
    const outerMass = ringCentroid(outer);
    let polygonArea = outerMass.area;
    let polygonX = outerMass.centroid[0] * outerMass.area;
    let polygonZ = outerMass.centroid[1] * outerMass.area;
    for (const hole of holes) {
      const holeMass = ringCentroid(hole);
      polygonArea -= holeMass.area;
      polygonX -= holeMass.centroid[0] * holeMass.area;
      polygonZ -= holeMass.centroid[1] * holeMass.area;
    }
    if (polygonArea <= EPSILON) continue;
    totalArea += polygonArea;
    weightedX += polygonX;
    weightedZ += polygonZ;
  }
  if (totalArea <= EPSILON) throw new Error("GEOMETRY_HAS_NO_POSITIVE_AREA");
  return [weightedX / totalArea, weightedZ / totalArea];
}
