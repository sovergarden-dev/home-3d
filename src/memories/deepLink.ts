import { clampCameraPose, DEFAULT_CAMERA_POSE, type CameraPose } from "./camera";
const KEYS = new Set(["v", "mode", "target", "yaw", "pitch", "distance", "zoom", "time", "id"]);
export interface DeepLinkState {
  pose?: CameraPose;
  time?: number;
  id?: string;
}
export interface DeepLinkResult {
  state: DeepLinkState | null;
  valid: boolean;
  reason?: "invalid" | "unsupported-version" | "unknown-key" | "invalid-value";
}
const finite = (value: string | null) =>
  value !== null && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
export function parseMemoryHash(hash: string): DeepLinkResult {
  const source = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!source) return { state: null, valid: true };
  if (source.length > 1024 || /%(?![0-9a-f]{2})/i.test(source))
    return { state: null, valid: false, reason: "invalid" };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(source);
  } catch {
    return { state: null, valid: false, reason: "invalid" };
  }
  for (const key of params.keys())
    if (!KEYS.has(key) || params.getAll(key).length !== 1)
      return { state: null, valid: false, reason: "unknown-key" };
  if (params.get("v") !== "1") return { state: null, valid: false, reason: "unsupported-version" };
  const mode = params.get("mode");
  const targetText = params.get("target");
  const target = targetText?.split(",").map((v) => Number(v));
  if (
    (mode !== "diorama" && mode !== "topdown") ||
    !target ||
    target.length !== 3 ||
    target.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000) ||
    targetText?.split(",").some((v) => !v.trim())
  )
    return { state: null, valid: false, reason: "invalid-value" };
  const vals = ["yaw", "pitch", "distance", "zoom"].map((key) => finite(params.get(key)));
  if (vals.some((v) => v === null)) return { state: null, valid: false, reason: "invalid-value" };
  const time = params.has("time") ? finite(params.get("time")) : null;
  const id = params.get("id") ?? undefined;
  if (params.has("time") && (time === null || time < 0 || time > 1439))
    return { state: null, valid: false, reason: "invalid-value" };
  if (
    id !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  )
    return { state: null, valid: false, reason: "invalid-value" };
  const [yaw, pitch, distance, zoom] = vals as [number, number, number, number];
  if (
    (target[1] ?? 0) < 0 ||
    Math.abs(yaw) > Math.PI * 2 ||
    pitch < 0.08 ||
    pitch > Math.PI / 2 - 0.02 ||
    distance < 4 ||
    distance > 800 ||
    zoom < 0.1 ||
    zoom > 8
  )
    return { state: null, valid: false, reason: "invalid-value" };
  return {
    state: {
      pose: clampCameraPose({
        mode,
        target: target as [number, number, number],
        yaw,
        pitch,
        distance,
        zoom,
      }),
      ...(time === null ? {} : { time }),
      ...(id === undefined ? {} : { id }),
    },
    valid: true,
  };
}
export function buildMemoryHash(state: DeepLinkState): string {
  const pose = clampCameraPose(state.pose ?? DEFAULT_CAMERA_POSE);
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("mode", pose.mode);
  params.set("target", pose.target.map((v) => Number(v.toFixed(6))).join(","));
  params.set("yaw", String(Number(pose.yaw.toFixed(6))));
  params.set("pitch", String(Number(pose.pitch.toFixed(6))));
  params.set("distance", String(Number(pose.distance.toFixed(6))));
  params.set("zoom", String(Number(pose.zoom.toFixed(6))));
  if (state.time !== undefined && Number.isFinite(state.time))
    params.set("time", String(Math.round(Math.max(0, Math.min(1439, state.time)))));
  if (
    state.id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.id)
  )
    params.set("id", state.id);
  return `#${params.toString()}`;
}
