import { createHash } from "node:crypto";

export type IdentityGeometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | null;

export interface IdentityFeature {
  id?: string | number;
  geometry: IdentityGeometry;
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function canonicalNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("GEOJSON_POSITION_INVALID");
  return Object.is(value, -0) ? "0" : value.toString();
}

function positionKey(position: number[]) {
  return position.map(canonicalNumber).join(",");
}

function canonicalSequence(points: number[][], reversible: boolean) {
  if (points.length === 0) return "[]";
  const minKey = points.reduce((min, point) => {
    const key = positionKey(point);
    return key < min ? key : min;
  }, positionKey(points[0]!));
  const candidates: string[] = [];
  for (const ordered of reversible ? [points, [...points].reverse()] : [points]) {
    for (let index = 0; index < ordered.length; index += 1) {
      if (positionKey(ordered[index]!) !== minKey) continue;
      const rotated = [...ordered.slice(index), ...ordered.slice(0, index)];
      candidates.push(JSON.stringify(rotated.map(positionKey)));
    }
  }
  return candidates.sort()[0] ?? "[]";
}

function canonicalRing(ring: number[][]) {
  const points =
    ring.length > 1 && positionKey(ring[0]!) === positionKey(ring.at(-1)!)
      ? ring.slice(0, -1)
      : [...ring];
  return canonicalSequence(points, true);
}

function canonicalOpenLine(points: number[][]) {
  const forward = JSON.stringify(points.map(positionKey));
  const reverse = JSON.stringify([...points].reverse().map(positionKey));
  return forward < reverse ? forward : reverse;
}

function canonicalPolygon(rings: number[][][]) {
  const [outer, ...holes] = rings;
  return JSON.stringify([outer ? canonicalRing(outer) : "[]", ...holes.map(canonicalRing).sort()]);
}

export function canonicalGeometryFingerprint(geometry: IdentityGeometry): string {
  if (!geometry) return "null";
  if (geometry.type === "Point") return `Point:${positionKey(geometry.coordinates)}`;
  if (geometry.type === "LineString") {
    return `LineString:${canonicalOpenLine(geometry.coordinates)}`;
  }
  if (geometry.type === "MultiLineString") {
    return `MultiLineString:${JSON.stringify(geometry.coordinates.map(canonicalOpenLine).sort())}`;
  }
  if (geometry.type === "Polygon") return `Polygon:${canonicalPolygon(geometry.coordinates)}`;
  return `MultiPolygon:${JSON.stringify(geometry.coordinates.map(canonicalPolygon).sort())}`;
}

export function sourceNamespaceToken(namespace: string) {
  const normalized = namespace.trim();
  if (!normalized) throw new Error("PIPELINE_SOURCE_NAMESPACE_REQUIRED");
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const readable = (slug || "source").slice(0, 32);
  return slug === normalized && normalized.length <= 32
    ? readable
    : `${readable}-${sha256(normalized).slice(0, 8)}`;
}

export function stableLocalId(
  prefix: string,
  feature: IdentityFeature,
  sourceKind: string,
  namespace = "primary",
  componentSuffix?: string,
) {
  const namespaceSuffix = namespace === "primary" ? "" : `-${sourceNamespaceToken(namespace)}`;
  const component = componentSuffix ? `-${componentSuffix}` : "";
  const rawId = feature.id === undefined || feature.id === null ? "" : String(feature.id).trim();
  let identity: string;
  if (rawId) {
    const sanitized = rawId.replace(/[/:]/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
    const clipped = sanitized.slice(0, 72);
    const needsHash = sanitized !== rawId || sanitized.length > 72;
    identity = needsHash ? `${clipped}-${sha256(rawId).slice(0, 10)}` : clipped;
  } else {
    const fingerprint = canonicalGeometryFingerprint(feature.geometry);
    identity = sha256(`${namespace}\0${sourceKind}\0${prefix}\0${fingerprint}`).slice(0, 24);
  }
  return `${prefix}${namespaceSuffix}-${identity}${component}`;
}

function fnv1aBase36(text: string) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function legacyGeometryFingerprint(geometry: IdentityGeometry): string {
  if (!geometry) return "null";
  if (geometry.type === "Point") {
    return `pt:${geometry.coordinates[0]?.toFixed(5)}_${geometry.coordinates[1]?.toFixed(5)}`;
  }
  if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    const start = coords[0] ? `${coords[0][0]?.toFixed(5)}_${coords[0][1]?.toFixed(5)}` : "";
    const end = coords.at(-1)
      ? `${coords.at(-1)![0]?.toFixed(5)}_${coords.at(-1)![1]?.toFixed(5)}`
      : "";
    return `ls:${coords.length}:${start}:${end}`;
  }
  if (geometry.type === "MultiLineString") {
    const lines = geometry.coordinates;
    const first = lines[0]?.[0]
      ? `${lines[0][0][0]?.toFixed(5)}_${lines[0][0][1]?.toFixed(5)}`
      : "";
    const last = lines.at(-1)?.at(-1)
      ? `${lines.at(-1)!.at(-1)![0]?.toFixed(5)}_${lines.at(-1)!.at(-1)![1]?.toFixed(5)}`
      : "";
    return `mls:${lines.length}:${first}:${last}`;
  }
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    const len = ring.length;
    const p0 = ring[0] ? `${ring[0][0]?.toFixed(5)}_${ring[0][1]?.toFixed(5)}` : "";
    const pMid = ring[Math.floor(len / 2)]
      ? `${ring[Math.floor(len / 2)]![0]?.toFixed(5)}_${ring[Math.floor(len / 2)]![1]?.toFixed(5)}`
      : "";
    return `poly:${len}:${p0}:${pMid}`;
  }
  const parts = geometry.coordinates.map((polygon) => {
    const ring = polygon[0] ?? [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let area = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const point = ring[index]!;
      const x = point[0] ?? 0;
      const y = point[1] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      if (index < ring.length - 1) {
        const next = ring[index + 1]!;
        area += x * (next[1] ?? 0) - y * (next[0] ?? 0);
      }
    }
    const count = ring.length || 1;
    return `${ring.length}:${(area * 0.5).toFixed(2)}:${(sumX / count).toFixed(5)}_${(sumY / count).toFixed(5)}:[${minX.toFixed(5)},${minY.toFixed(5)},${maxX.toFixed(5)},${maxY.toFixed(5)}]`;
  });
  return `mpoly:${geometry.coordinates.length}:${parts.join(";")}`;
}

export function legacyLocalId(
  prefix: string,
  feature: IdentityFeature,
  sourceKind: string,
  lineIndex?: number,
) {
  const suffix = lineIndex !== undefined ? `-${lineIndex}` : "";
  const rawId = feature.id === undefined || feature.id === null ? "" : String(feature.id).trim();
  if (rawId) {
    const sanitized = rawId.replace(/[/:]/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
    if (sanitized.length > 0) {
      return sanitized === rawId
        ? `${prefix}-${sanitized}${suffix}`
        : `${prefix}-${sanitized}-${fnv1aBase36(rawId)}${suffix}`;
    }
  }
  const input = `${prefix}:${sourceKind}:${feature.geometry?.type ?? "null"}:${legacyGeometryFingerprint(feature.geometry)}`;
  return `${prefix}-${fnv1aBase36(input)}${suffix}`;
}
