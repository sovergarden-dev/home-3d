import type { CameraView } from "@/geo/realStreet";

let readView: (() => CameraView | null) | null = null;

/** Retains a reader, never a location or a serialized camera snapshot. */
export function bindRealStreetView(reader: (() => CameraView | null) | null) {
  readView = reader;
}

export function readRealStreetView() {
  return readView?.() ?? null;
}

/** Called synchronously by the final user gesture only. */
export function openRealStreetWindow(url: string): boolean {
  let popup: Window | null = null;
  try {
    // A handle is needed to distinguish a blocked popup. noopener/noreferrer on
    // window.open itself intentionally returns null even when opening succeeds.
    popup = window.open("about:blank", "_blank");
    if (!popup || popup.closed) return false;
    popup.opener = null;
    const policy = popup.document.createElement("meta");
    policy.name = "referrer";
    policy.content = "no-referrer";
    popup.document.head.appendChild(policy);
    // Navigation initiated via another window's Location can use the caller's
    // referrer policy. Set the policy on the actual navigation element as well.
    const link = popup.document.createElement("a");
    link.href = url;
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.target = "_self";
    popup.document.body.appendChild(link);
    link.click();
    return true;
  } catch {
    popup?.close();
    return false;
  }
}
