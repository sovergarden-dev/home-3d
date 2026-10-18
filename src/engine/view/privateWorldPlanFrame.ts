import type { WorldData } from "@/world/schema";

export const PRIVATE_PLAN_CORE_RADIUS_METRES = 150;
export const PRIVATE_PLAN_CORE_SPAN_METRES = PRIVATE_PLAN_CORE_RADIUS_METRES * 2;

export interface PlanPanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PrivateWorldPlanFrame {
  centre: { x: 0; z: 0 };
  verticalSpanMetres: number;
  panBounds: PlanPanBounds;
}

function geometryVertices(geometry: WorldData["buildings"][number]["geometry"]) {
  return geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
}

export function derivePrivateWorldPlanFrame(world: WorldData): PrivateWorldPlanFrame {
  const positions = [
    ...world.roads.flatMap((road) => road.polylineENU),
    ...world.lots.flatMap((lot) => geometryVertices(lot.geometry)),
    ...world.buildings.flatMap((building) => [
      ...geometryVertices(building.geometry),
      ...(building.parts ?? []).flatMap((part) => geometryVertices(part.geometry)),
    ]),
  ];
  const minX = positions.length ? Math.min(...positions.map(([x]) => x)) : 0;
  const maxX = positions.length ? Math.max(...positions.map(([x]) => x)) : 0;
  const minZ = positions.length ? Math.min(...positions.map(([, z]) => z)) : 0;
  const maxZ = positions.length ? Math.max(...positions.map(([, z]) => z)) : 0;
  const padding = PRIVATE_PLAN_CORE_RADIUS_METRES;

  return {
    centre: { x: 0, z: 0 },
    verticalSpanMetres: PRIVATE_PLAN_CORE_SPAN_METRES,
    // Keep the supplied origin as the default focus, but permit panning past every
    // source vertex so a long way outside the initial core remains reachable.
    panBounds: {
      minX: Math.min(-padding, minX - padding),
      maxX: Math.max(padding, maxX + padding),
      minZ: Math.min(-padding, minZ - padding),
      maxZ: Math.max(padding, maxZ + padding),
    },
  };
}

export function clampPrivatePlanCentre(centre: { x: number; z: number }, bounds: PlanPanBounds) {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, centre.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, centre.z)),
  };
}
