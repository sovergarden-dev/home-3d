/** Invented metre-space layout. Never generated from a map, photograph or real location. */
export const HOME_LOT = { minX: -3, maxX: 3, minZ: -4.5, maxZ: 4.5 };
export interface DemoBuilding {
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  color: string;
  front: 1 | -1;
  shop: boolean;
}
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export function overlapsHome(building: DemoBuilding) {
  return (
    building.x - building.width / 2 < HOME_LOT.maxX &&
    building.x + building.width / 2 > HOME_LOT.minX &&
    building.z - building.depth / 2 < HOME_LOT.maxZ &&
    building.z + building.depth / 2 > HOME_LOT.minZ
  );
}
export function createDemoLayout(seed = 20261013): DemoBuilding[] {
  const random = seededRandom(seed);
  const colors = ["#ded2b6", "#d8a27b", "#a9c2b0", "#e4c77e", "#b2bfcc", "#c2b5be", "#efe3cc"];
  const buildings: DemoBuilding[] = [];
  for (const row of [
    { z: 0, front: 1 },
    { z: 23, front: -1 },
    { z: -32, front: 1 },
    { z: -10, front: -1 },
  ] as const) {
    for (let x = -54; x <= 54; x += 6) {
      if (Math.abs(Math.abs(x) - 30) < 3 || Math.abs(Math.abs(x) - 36) < 3) continue;
      const building: DemoBuilding = {
        x,
        z: row.z,
        front: row.front,
        width: 5.3,
        depth: 8,
        floors: 1 + Math.floor(random() * 4),
        color: colors[Math.floor(random() * colors.length)]!,
        shop: row.z === 0 || row.z === 23,
      };
      if (!overlapsHome(building)) buildings.push(building);
    }
  }
  return buildings;
}
export function daylightAt(minutes: number) {
  return Math.max(0, Math.sin(((minutes - 360) / 720) * Math.PI));
}
