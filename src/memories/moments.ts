import { worldDataProvider } from "@/world/privateWorldSession";

// Captures are tab-local Blobs, never contents of the shared/SSR UI store.
const blobs = new Map<number, { blob: Blob; url: string | null }>();
let sequence = 0;
export function keepMoment(dataUrl: string): number | null {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || dataUrl.length > 32 * 1024 * 1024) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
    const id = ++sequence;
    blobs.set(id, { blob: new Blob([bytes], { type: `image/${match[1]}` }), url: null });
    return id;
  } catch {
    return null;
  }
}
export function momentUrl(id: number): string {
  const entry = blobs.get(id);
  if (!entry) return "";
  entry.url ??= URL.createObjectURL(entry.blob);
  return entry.url;
}
export function releaseMoment(id: number) {
  const entry = blobs.get(id);
  if (entry?.url) URL.revokeObjectURL(entry.url);
  blobs.delete(id);
}
export function clearMomentBlobs() {
  for (const id of blobs.keys()) releaseMoment(id);
}
export function momentDiagnostics() {
  return { blobs: blobs.size, objectUrls: [...blobs.values()].filter((entry) => entry.url).length };
}
let users = 0;
let unsubscribe: (() => void) | null = null;
export function startMomentLifecycle(onClear: () => void) {
  if (++users === 1) {
    let epoch = worldDataProvider.getPackageEpoch();
    unsubscribe = worldDataProvider.subscribe((next) => {
      if (next.loading || next.mode === "private-error" || next.packageEpoch !== epoch) {
        epoch = next.packageEpoch;
        clearMomentBlobs();
        onClear();
      }
    });
  }
  return () => {
    if (--users === 0) {
      unsubscribe?.();
      unsubscribe = null;
      clearMomentBlobs();
      onClear();
    }
  };
}
