import type { SurfaceGeometry, WorldData } from "@/world/schema";
import { buildLifeGraph, type LifeEdge, type LifeGraph } from "./graph";
export type LifeTier = "low" | "mid" | "high" | "ultra";
export type LifeKind =
  | "motorbike"
  | "car"
  | "bus"
  | "tricycle"
  | "bicycle"
  | "pedestrian"
  | "vendor"
  | "dog"
  | "cat"
  | "chicken";
export interface LifeAgent {
  id: number;
  kind: LifeKind;
  x: number;
  z: number;
  y: number;
  rotation: number;
  speed: number;
  targetSpeed: number;
  edge: number;
  distance: number;
  fade: number;
  active: boolean;
  seed: number;
  direction: number;
  ending: boolean;
  transitions: number;
  junction: number;
}
export interface LifeSettings {
  speed?: 0 | 1 | 4;
  tier?: LifeTier;
  density?: number;
  visible?: boolean;
  fps?: number;
  hour?: number;
  weather?: "sunny" | "cloudy" | "rain" | "storm";
  festival?: string;
  floodLevel?: number;
}
export interface LifeDiagnostics {
  agentCount: number;
  simulatedSeconds: number;
  droppedCatchup: number;
  graphEnabled: boolean;
  disabledReason?: string;
  tier: LifeTier;
  fps: number;
  edgeTransitions?: number;
}
export interface LifeSimulation {
  readonly graph: LifeGraph;
  readonly agents: LifeAgent[];
  readonly clock: number;
  readonly diagnostics: LifeDiagnostics;
  update(dt: number, settings?: LifeSettings): void;
  dispose(): void;
}
const caps: Record<LifeTier, number> = { low: 60, mid: 200, high: 800, ultra: 2000 };
const fixed = 1 / 30;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isWalker = (kind: LifeKind) =>
  kind === "pedestrian" ||
  kind === "vendor" ||
  kind === "dog" ||
  kind === "cat" ||
  kind === "chicken";
const isAnimal = (kind: LifeKind) => kind === "dog" || kind === "cat" || kind === "chicken";
/** Conservative enclosing circles match the actual procedural render sizes, not road metadata. */
export const lifeRadius = (kind: LifeKind) =>
  kind === "bus"
    ? 1.6
    : kind === "car" || kind === "tricycle"
      ? 1.05
      : kind === "motorbike" || kind === "bicycle"
        ? 0.64
        : kind === "vendor"
          ? 0.75
          : 0.34;
const kinds: LifeKind[] = [
  "motorbike",
  "motorbike",
  "motorbike",
  "motorbike",
  "motorbike",
  "car",
  "car",
  "bus",
  "tricycle",
  "bicycle",
  "pedestrian",
  "pedestrian",
  "vendor",
  "dog",
  "cat",
  "chicken",
];
function inRing(x: number, z: number, ring: readonly (readonly number[])[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (a[1]! > z !== b[1]! > z && x < ((b[0]! - a[0]!) * (z - a[1]!)) / (b[1]! - a[1]!) + a[0]!)
      inside = !inside;
  }
  return inside;
}
function inGeometry(x: number, z: number, geometry: SurfaceGeometry) {
  if (geometry.type === "Polygon") {
    if (!geometry.coordinates[0] || !inRing(x, z, geometry.coordinates[0])) return false;
    for (let i = 1; i < geometry.coordinates.length; i++)
      if (inRing(x, z, geometry.coordinates[i]!)) return false;
    return true;
  }
  for (const polygon of geometry.coordinates) {
    if (!polygon[0] || !inRing(x, z, polygon[0])) continue;
    let hole = false;
    for (let i = 1; i < polygon.length; i++)
      if (inRing(x, z, polygon[i]!)) {
        hole = true;
        break;
      }
    if (!hole) return true;
  }
  return false;
}
const pointOnEdge = (
  edge: LifeEdge,
  distance: number,
  out: { x: number; z: number; angle: number },
  direction: number,
  kind: LifeKind,
) => {
  const d = clamp(distance, 0, edge.length);
  let i = 1;
  while (i < edge.cumulative.length - 1 && edge.cumulative[i]! < d) i++;
  const previous = i - 1,
    length = edge.cumulative[i]! - edge.cumulative[previous]! || 1;
  const t = (d - edge.cumulative[previous]!) / length;
  const ax = edge.points[previous * 2]!,
    az = edge.points[previous * 2 + 1]!,
    bx = edge.points[i * 2]!,
    bz = edge.points[i * 2 + 1]!;
  const angle = Math.atan2(bz - az, bx - ax);
  // Vehicles converge smoothly to the node before changing edge; sidewalks cross only at graph nodes.
  const taper = Math.min(1, d / 5, (edge.length - d) / 5);
  const offset =
    (isWalker(kind) ? edge.width / 2 + Math.max(0.35, edge.sidewalkWidth / 2) : edge.width / 4) *
    direction *
    Math.max(0, taper);
  out.x = ax + (bx - ax) * t - Math.sin(angle) * offset;
  out.z = az + (bz - az) * t + Math.cos(angle) * offset;
  out.angle = direction < 0 ? angle + Math.PI : angle;
};
export function createLifeSimulation(world: WorldData, seed = 1): LifeSimulation {
  const graph = buildLifeGraph(world),
    agents: LifeAgent[] = [];
  const solids: SurfaceGeometry[] = [];
  for (const building of world.buildings)
    if (!building.hidden) {
      solids.push(building.geometry);
      for (const part of building.parts ?? []) solids.push(part.geometry);
    }
  // Even an empty lot remains completely free of agents and simulated constructions.
  for (const lot of world.lots) solids.push(lot.geometry);
  const point = { x: 0, z: 0, angle: 0 };
  const safeAt = (x: number, z: number, radius: number) => {
    for (const geometry of solids)
      if (
        inGeometry(x, z, geometry) ||
        inGeometry(x + radius, z, geometry) ||
        inGeometry(x - radius, z, geometry) ||
        inGeometry(x, z + radius, geometry) ||
        inGeometry(x, z - radius, geometry)
      )
        return false;
    return true;
  };
  // Footprint checks and topology are prepared once, not reconstructed each frame.
  const clearances = new Map<string, boolean>();
  const suitable = (edgeIndex: number, kind: LifeKind, direction: number) => {
    const edge = graph.edges[edgeIndex]!;
    if (
      !edge ||
      edge.length < lifeRadius(kind) * 2 + 0.5 ||
      (kind === "bus" &&
        (edge.width < 7 || edge.roadClass === "alley" || edge.roadClass === "service"))
    )
      return false;
    if (
      (direction > 0 && edge.direction === "reverse") ||
      (direction < 0 && edge.direction === "forward")
    )
      return false;
    const key = `${edgeIndex}:${kind}:${direction}`;
    const known = clearances.get(key);
    if (known !== undefined) return known;
    let safe = true;
    for (let d = 0; d <= edge.length; d += Math.min(1, edge.length)) {
      pointOnEdge(edge, d, point, direction, kind);
      if (!safeAt(point.x, point.z, lifeRadius(kind))) {
        safe = false;
        break;
      }
    }
    clearances.set(key, safe);
    return safe;
  };
  for (let i = 0; i < graph.edges.length; i++)
    for (const kind of kinds) {
      suitable(i, kind, 1);
      suitable(i, kind, -1);
    }
  const outgoing: number[][] = Array.from({ length: graph.nodes.length }, () => []);
  for (const edge of graph.edges) {
    if (edge.direction !== "reverse") outgoing[edge.from]!.push(edge.id * 2);
    if (edge.direction !== "forward") outgoing[edge.to]!.push(edge.id * 2 + 1);
  }
  const junctionOwners = new Int32Array(graph.nodes.length).fill(-1);
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let accumulator = 0,
    clock = 0,
    disposed = false,
    density = 1,
    requestedTier: LifeTier = "mid",
    populatedTier: LifeTier | null = null,
    fps = 60;
  const diagnostics: LifeDiagnostics = {
    agentCount: 0,
    simulatedSeconds: 0,
    droppedCatchup: 0,
    graphEnabled: graph.enabled,
    tier: "mid",
    fps: 60,
    edgeTransitions: 0,
  };
  if (graph.disabledReason) diagnostics.disabledReason = graph.disabledReason;
  const roomAt = (agent: LifeAgent | null, kind: LifeKind, x: number, z: number) => {
    const radius = lifeRadius(kind);
    for (const other of agents) {
      if (other === agent || !other.active) continue;
      const gap = radius + lifeRadius(other.kind) + 0.12;
      const dx = other.x - x,
        dz = other.z - z;
      if (dx * dx + dz * dz < gap * gap) return false;
    }
    return true;
  };
  const place = (agent: LifeAgent, initial: boolean) => {
    const n = graph.edges.length;
    for (let tries = 0; tries < Math.max(32, n * 4); tries++) {
      const index = Math.floor(random() * n),
        edge = graph.edges[index]!;
      const direction =
        edge.direction === "reverse"
          ? -1
          : edge.direction === "forward"
            ? 1
            : random() < 0.5
              ? -1
              : 1;
      if (!suitable(index, agent.kind, direction)) continue;
      const distance = Math.min(edge.length - 0.1, Math.max(0.1, random() * edge.length));
      if (
        (outgoing[edge.from]!.length > 1 && distance < 6) ||
        (outgoing[edge.to]!.length > 1 && edge.length - distance < 6)
      )
        continue;
      pointOnEdge(edge, distance, point, direction, agent.kind);
      if (!roomAt(agent, agent.kind, point.x, point.z)) continue;
      agent.edge = index;
      agent.direction = direction;
      agent.distance = distance;
      agent.x = point.x;
      agent.z = point.z;
      agent.rotation = point.angle;
      agent.speed = 0;
      agent.targetSpeed = 0;
      agent.ending = false;
      if (agent.junction >= 0 && junctionOwners[agent.junction] === agent.id)
        junctionOwners[agent.junction] = -1;
      agent.junction = -1;
      agent.active = true;
      agent.fade = initial ? 1 : 0;
      return true;
    }
    agent.active = false;
    agent.fade = 0;
    agent.speed = 0;
    return false;
  };
  const populate = (tier: LifeTier) => {
    agents.length = 0;
    junctionOwners.fill(-1);
    populatedTier = tier;
    if (!graph.enabled || density === 0) return;
    let totalRoad = 0;
    for (const edge of graph.edges) totalRoad += edge.length;
    const count = Math.min(caps[tier], Math.max(8, Math.round(totalRoad / 16)));
    for (let i = 0; i < count; i++) {
      let kind = kinds[i % kinds.length]!;
      if (tier === "low" && isAnimal(kind)) kind = "pedestrian";
      const agent: LifeAgent = {
        id: i,
        kind,
        x: 0,
        z: 0,
        y: 0.05,
        rotation: 0,
        speed: 0,
        targetSpeed: 0,
        edge: 0,
        distance: 0,
        fade: 1,
        active: false,
        seed: Math.floor(random() * 0xffffffff),
        direction: 1,
        ending: false,
        transitions: 0,
        junction: -1,
      };
      if (place(agent, true)) agents.push(agent);
    }
  };
  populate("mid");
  const schedule = (agent: LifeAgent, hour: number) =>
    agent.kind === "vendor"
      ? hour >= 6 && hour < 20
      : agent.kind === "chicken"
        ? hour >= 5 && hour < 18
        : !isAnimal(agent.kind) || (hour >= 5 && hour < 21);
  const step = (dt: number, settings: LifeSettings) => {
    const hour = Number.isFinite(settings.hour) ? clamp(settings.hour!, 0, 24) : 12;
    const timeDensity =
      hour < 5 || hour >= 23
        ? 0.3
        : (hour >= 6 && hour < 9) || (hour >= 16 && hour < 19)
          ? 1
          : 0.75;
    const wet = settings.weather === "rain" || settings.weather === "storm";
    const desired = Math.ceil(agents.length * density * timeDensity * (wet ? 0.85 : 1));
    for (const agent of agents) {
      if (agent.junction >= 0) {
        const node = graph.nodes[agent.junction]!;
        if (!agent.active || Math.hypot(agent.x - node.x, agent.z - node.z) > 6.5) {
          junctionOwners[agent.junction] = -1;
          agent.junction = -1;
        }
      }
      const eligible = agent.id < desired && schedule(agent, hour);
      if (!eligible || agent.ending) {
        agent.targetSpeed = 0;
        agent.speed = Math.max(0, agent.speed - 4 * dt);
        agent.fade = Math.max(0, agent.fade - 5 * dt);
        if (agent.fade === 0) {
          agent.active = false;
          if (agent.junction >= 0) {
            junctionOwners[agent.junction] = -1;
            agent.junction = -1;
          }
          if (agent.ending && eligible) place(agent, false);
        }
        continue;
      }
      if (!agent.active) {
        place(agent, false);
        continue;
      }
      // A dormant scheduled agent may only become visible when its reserved position is clear.
      if (agent.fade < 0.01 && !roomAt(agent, agent.kind, agent.x, agent.z)) continue;
      agent.fade = Math.min(1, agent.fade + dt * 3);
      const edge = graph.edges[agent.edge]!;
      const base =
        agent.kind === "vendor"
          ? 0
          : isWalker(agent.kind)
            ? 1.15
            : agent.kind === "bicycle"
              ? 3
              : agent.kind === "bus"
                ? 4.5
                : agent.kind === "car"
                  ? 6
                  : 7;
      const waitAtCrossing =
        agent.kind === "pedestrian" && Math.floor(clock + (agent.seed % 17)) % 15 < 3;
      agent.targetSpeed = waitAtCrossing
        ? 0
        : base * (wet ? 0.78 : 1) * clamp(1 - (settings.floodLevel ?? 0) * 0.55, 0.2, 1);
      const nextNode = agent.direction > 0 ? edge.to : edge.from;
      const remaining = agent.direction > 0 ? edge.length - agent.distance : agent.distance;
      let mustYield = false;
      if (remaining < 7 && outgoing[nextNode]!.length > 1 && agent.kind !== "vendor") {
        if (junctionOwners[nextNode] === -1) {
          junctionOwners[nextNode] = agent.id;
          agent.junction = nextNode;
        } else if (junctionOwners[nextNode] !== agent.id) {
          agent.targetSpeed = 0;
          mustYield = true;
        }
      }
      agent.speed += clamp(agent.targetSpeed - agent.speed, -5 * dt, 2 * dt);
      if (mustYield && remaining < 6.5) {
        agent.speed = 0;
        continue;
      }
      let distance = agent.distance + agent.speed * dt * agent.direction;
      let nextEdge = agent.edge,
        nextDirection = agent.direction;
      if (distance >= edge.length || distance <= 0) {
        const node = agent.direction > 0 ? edge.to : edge.from;
        const choices = outgoing[node]!;
        let chosen = -1;
        // Deterministic rotating priority; no disconnected jump and no U-turn into a following queue.
        for (let j = 0; j < choices.length; j++) {
          const encoded = choices[(j + agent.id + agent.transitions) % choices.length]!;
          const index = Math.floor(encoded / 2),
            direction = encoded % 2 ? -1 : 1;
          if (index !== agent.edge && suitable(index, agent.kind, direction)) {
            chosen = encoded;
            break;
          }
        }
        if (chosen < 0) {
          agent.ending = true;
          agent.speed = 0;
          continue;
        }
        nextEdge = Math.floor(chosen / 2);
        nextDirection = chosen % 2 ? -1 : 1;
        distance = nextDirection > 0 ? 0.001 : graph.edges[nextEdge]!.length - 0.001;
      }
      pointOnEdge(graph.edges[nextEdge]!, distance, point, nextDirection, agent.kind);
      if (
        !safeAt(point.x, point.z, lifeRadius(agent.kind)) ||
        !roomAt(agent, agent.kind, point.x, point.z)
      ) {
        agent.speed = 0;
        continue;
      }
      if (nextEdge !== agent.edge) {
        agent.transitions++;
        diagnostics.edgeTransitions!++;
      }
      agent.edge = nextEdge;
      agent.direction = nextDirection;
      agent.distance = distance;
      agent.x = point.x;
      agent.z = point.z;
      agent.rotation = point.angle;
    }
  };
  return {
    graph,
    agents,
    get clock() {
      return clock;
    },
    get diagnostics() {
      return diagnostics;
    },
    update(dt, settings = {}) {
      if (disposed) return;
      if (Number.isFinite(settings.density)) density = clamp(settings.density!, 0, 1);
      requestedTier = settings.tier ?? requestedTier;
      fps = Number.isFinite(settings.fps) ? clamp(settings.fps!, 1, 240) : fps;
      const tier =
        fps < 24
          ? "low"
          : requestedTier === "ultra" && fps < 40
            ? "high"
            : requestedTier === "high" && fps < 40
              ? "mid"
              : requestedTier;
      if (tier !== populatedTier || (density > 0 && agents.length === 0)) {
        diagnostics.tier = tier;
        populate(tier);
      }
      if (density === 0) agents.length = 0;
      diagnostics.agentCount = agents.length;
      diagnostics.fps = fps;
      if (settings.visible === false) {
        accumulator = 0;
        return;
      }
      if (settings.speed === 0) return;
      const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
      accumulator += safeDt * (settings.speed === 4 ? 4 : 1);
      let steps = 0;
      while (accumulator + 1e-10 >= fixed && steps < 12) {
        step(fixed, settings);
        accumulator = Math.max(0, accumulator - fixed);
        clock += fixed;
        steps++;
      }
      diagnostics.simulatedSeconds = clock;
      if (accumulator >= fixed) {
        diagnostics.droppedCatchup += accumulator;
        accumulator = 0;
      }
    },
    dispose() {
      disposed = true;
      agents.length = 0;
      clearances.clear();
      diagnostics.agentCount = 0;
    },
  };
}
