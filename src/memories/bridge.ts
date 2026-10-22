import { buildMemoryHash, parseMemoryHash, type DeepLinkState } from "./deepLink";
import { DEFAULT_CAMERA_POSE, type CameraPose } from "./camera";
import type { MemoryPin } from "./pins";
export interface MemoryCameraSnapshot {
  active: boolean;
  paused: boolean;
  index: number;
  memoryId: string | null;
  error?: string;
}
export interface MemoryCameraBinding {
  getPose: () => CameraPose;
  flyTo: (memory: MemoryPin) => void;
  startTour: (memories: readonly MemoryPin[]) => void;
  previous: () => void;
  next: () => void;
  pause: () => void;
  exit: () => void;
  selectPosition?: (position: readonly [number, number, number]) => void;
  getSnapshot?: () => MemoryCameraSnapshot;
  subscribe?: (listener: () => void) => () => void;
}
let binding: MemoryCameraBinding | null = null;
let refs = 0;
let snapshot: MemoryCameraSnapshot = { active: false, paused: false, index: -1, memoryId: null };
const listeners = new Set<() => void>();
let replaceTimer: number | null = null;
let bindingOff: (() => void) | undefined;
function equal(a: MemoryCameraSnapshot, b: MemoryCameraSnapshot) {
  return (
    a.active === b.active &&
    a.paused === b.paused &&
    a.index === b.index &&
    a.memoryId === b.memoryId &&
    a.error === b.error
  );
}
function publish() {
  const next = binding?.getSnapshot?.() ?? snapshot;
  if (equal(snapshot, next)) return;
  snapshot = { ...next };
  listeners.forEach((listener) => listener());
}
export function bindMemoryCamera(next: MemoryCameraBinding | null) {
  if (replaceTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(replaceTimer);
    replaceTimer = null;
  }
  bindingOff?.();
  bindingOff = undefined;
  binding = next;
  snapshot = next?.getSnapshot
    ? { ...next.getSnapshot() }
    : { active: false, paused: false, index: -1, memoryId: null };
  bindingOff = next?.subscribe?.(publish);
  listeners.forEach((listener) => listener());
  return () => {
    if (binding === next) {
      if (replaceTimer !== null && typeof window !== "undefined") {
        window.clearTimeout(replaceTimer);
        replaceTimer = null;
      }
      bindingOff?.();
      bindingOff = undefined;
      binding = null;
      snapshot = { active: false, paused: false, index: -1, memoryId: null };
      listeners.forEach((listener) => listener());
    }
  };
}
export function acquireMemoryCamera() {
  refs += 1;
  return () => {
    refs = Math.max(0, refs - 1);
  };
}
export function memoryCameraRefCount() {
  return refs;
}
export const memoryCamera = {
  getPose: () => binding?.getPose() ?? DEFAULT_CAMERA_POSE,
  flyTo(memory: MemoryPin) {
    binding?.flyTo(memory);
    publish();
  },
  startTour(memories: readonly MemoryPin[]) {
    binding?.startTour(memories);
    publish();
  },
  previous() {
    binding?.previous();
    publish();
  },
  next() {
    binding?.next();
    publish();
  },
  pause() {
    binding?.pause();
    publish();
  },
  exit() {
    binding?.exit();
    publish();
  },
  selectPosition(position: readonly [number, number, number]) {
    binding?.selectPosition?.(position);
    publish();
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  copyLink: async (extra: Partial<DeepLinkState> = {}) => {
    const state: DeepLinkState = { pose: extra.pose ?? memoryCamera.getPose() };
    if (extra.time !== undefined) state.time = extra.time;
    if (extra.id !== undefined) state.id = extra.id;
    const hash = buildMemoryHash(state);
    if (typeof window === "undefined") return hash;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (replaceTimer !== null) window.clearTimeout(replaceTimer);
    replaceTimer = window.setTimeout(() => {
      window.history.replaceState(null, "", url);
      replaceTimer = null;
    }, 80);
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
    return `${window.location.origin}${url}`;
  },
  parseInitialLink: () =>
    typeof window === "undefined"
      ? { state: null, valid: true }
      : parseMemoryHash(window.location.hash),
};
export type MemoryCameraApi = typeof memoryCamera;
export function subscribeMemoryCamera(listener: () => void) {
  return memoryCamera.subscribe(listener);
}
