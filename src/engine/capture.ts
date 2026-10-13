let capture: (() => string) | null = null;
export function bindCapture(callback: (() => string) | null) {
  capture = callback;
}
export function captureDemoFrame() {
  try {
    return capture?.() ?? null;
  } catch {
    return null;
  }
}
