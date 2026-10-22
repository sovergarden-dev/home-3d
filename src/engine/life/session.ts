/** Client-only commands: never persist world, files, sensor samples or positions in SSR state. */
export type LifeCommand =
  | { kind: "move"; forward: number; right: number }
  | { kind: "pause" }
  | { kind: "soundGesture" }
  | { kind: "orientation" }
  | { kind: "pointerLock" }
  | { kind: "audio"; file: File; manifest: File };
export interface LifeStatus {
  graphReady: boolean;
  reason: string | null;
  rideEnded: boolean;
  orientation: string;
  audio: "synthetic" | "local" | "error";
}
const initial: LifeStatus = {
  graphReady: false,
  reason: null,
  rideEnded: false,
  orientation: "off",
  audio: "synthetic",
};
let status = initial;
let handler: ((command: LifeCommand) => void) | null = null;
const listeners = new Set<() => void>();
export function bindLifeCommands(next: typeof handler) {
  handler = next;
}
export function sendLifeCommand(command: LifeCommand) {
  handler?.(command);
}
export function getLifeStatus() {
  return status;
}
export function getLifeServerStatus() {
  return initial;
}
export function subscribeLifeStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function updateLifeStatus(patch: Partial<LifeStatus>) {
  const next = { ...status, ...patch };
  if (
    Object.keys(next).every(
      (key) => next[key as keyof LifeStatus] === status[key as keyof LifeStatus],
    )
  )
    return;
  status = next;
  listeners.forEach((listener) => listener());
}
export function resetLifeSession() {
  handler = null;
  status = initial;
  listeners.forEach((listener) => listener());
}
