import { enuToGeodetic, type GeodeticPoint } from "./enu";

export interface CameraView {
  target: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  mode: "diorama" | "topdown" | "walk";
  zoom?: number;
}

export interface ResolvedStreetView {
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  zoom: number;
}

function finiteVector(value: { x: number; y: number; z: number }): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function validOrigin(origin: GeodeticPoint): boolean {
  return (
    Number.isFinite(origin.latitude) &&
    origin.latitude > -90 &&
    origin.latitude < 90 &&
    Number.isFinite(origin.longitude) &&
    origin.longitude >= -180 &&
    origin.longitude <= 180 &&
    (origin.altitude === undefined || Number.isFinite(origin.altitude))
  );
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function resolveRealStreetView(
  view: CameraView,
  origin: GeodeticPoint,
): ResolvedStreetView | null {
  if (
    !view ||
    !validOrigin(origin) ||
    !finiteVector(view.target) ||
    !finiteVector(view.direction)
  ) {
    return null;
  }
  if (!Number.isInteger(view.zoom) && view.zoom !== undefined) return null;
  if (view.zoom !== undefined && (view.zoom < 0 || view.zoom > 21)) return null;
  if (!["diorama", "topdown", "walk"].includes(view.mode)) return null;
  try {
    const target = enuToGeodetic(
      { east: view.target.x, up: view.target.y, north: -view.target.z },
      origin,
    );
    if (
      ![target.latitude, target.longitude, target.altitude].every(Number.isFinite) ||
      target.latitude < -90 ||
      target.latitude > 90 ||
      target.longitude < -180 ||
      target.longitude > 180
    )
      return null;
    const horizontal = Math.hypot(view.direction.x, view.direction.z);
    const heading =
      view.mode === "topdown" || horizontal < 1e-9
        ? 0
        : normalizeHeading((Math.atan2(view.direction.x, -view.direction.z) * 180) / Math.PI);
    return {
      latitude: target.latitude,
      longitude: target.longitude,
      altitude: target.altitude,
      heading,
      zoom: view.zoom ?? 19,
    };
  } catch {
    return null;
  }
}

export function buildGoogleMapsUrl(
  kind: "streetview" | "satellite",
  resolved: ResolvedStreetView,
): string {
  if (
    !resolved ||
    ![
      resolved.latitude,
      resolved.longitude,
      resolved.altitude,
      resolved.heading,
      resolved.zoom,
    ].every(Number.isFinite) ||
    resolved.latitude < -90 ||
    resolved.latitude > 90 ||
    resolved.longitude < -180 ||
    resolved.longitude > 180 ||
    resolved.heading < 0 ||
    resolved.heading >= 360 ||
    !Number.isInteger(resolved.zoom) ||
    resolved.zoom < 0 ||
    resolved.zoom > 21
  ) {
    throw new Error("REAL_STREET_VIEW_INVALID");
  }
  if (kind === "streetview") {
    const viewpoint = encodeURIComponent(`${resolved.latitude},${resolved.longitude}`);
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${viewpoint}&heading=${resolved.heading}`;
  }
  if (kind === "satellite") {
    const center = encodeURIComponent(`${resolved.latitude},${resolved.longitude}`);
    return `https://www.google.com/maps/@?api=1&map_action=map&center=${center}&basemap=satellite&zoom=${resolved.zoom}`;
  }
  throw new Error("REAL_STREET_VIEW_KIND_INVALID");
}
