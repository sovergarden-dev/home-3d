let capture: (() => string | null) | null = null;
export function bindCapture(callback: (() => string | null) | null) {
  capture = callback;
}
export function captureDemoFrame() {
  try {
    return capture?.() ?? null;
  } catch {
    return null;
  }
}
