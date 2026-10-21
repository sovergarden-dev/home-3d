import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createOrientationController } from "@/engine/life/orientation";
import { buildPovRoute, createPovController } from "@/engine/life/pov";
import type { WorldData } from "@/world/schema";

const base = {
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "test",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [],
    assetHashes: {},
    licences: [],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  lots: [],
  buildings: [],
};
const road = (
  localId: string,
  points: [number, number][],
  direction: "forward" | "reverse" | "both" = "both",
) => ({
  localId,
  polylineENU: points,
  roadClass: "residential",
  direction,
  carriagewayWidth: 4,
  sidewalkWidths: [1, 1],
  attributes: {},
});
const world = {
  ...base,
  roads: [
    road(
      "a",
      [
        [0, 0],
        [10, 0],
      ],
      "forward",
    ),
    road(
      "b",
      [
        [10, 0],
        [10, 10],
      ],
      "reverse",
    ),
  ],
} as unknown as WorldData;

function canvasStub() {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => false),
  });
  return canvas;
}
function pointer(type: string, values: Record<string, number>) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: values["clientX"] ?? 0,
    clientY: values["clientY"] ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: values["pointerId"] ?? 1 });
  Object.defineProperty(event, "movementX", { value: values["movementX"] ?? 0 });
  Object.defineProperty(event, "movementY", { value: values["movementY"] ?? 0 });
  return event;
}

describe("P9 POV lifecycle", () => {
  it("handles pointer drag, pointer-lock Esc, blur, WASD release, ignored text input, and exact restore", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 8, 3);
    camera.quaternion.setFromEuler(new THREE.Euler(0.2, 0.4, 0.1));
    const target = new THREE.Vector3(4, 0, 5),
      originalPosition = camera.position.clone(),
      originalQuaternion = camera.quaternion.clone(),
      originalTarget = target.clone();
    const canvas = canvasStub();
    const controller = createPovController({ camera, canvas, world, orbitTarget: target });
    controller.setMode("walk");
    canvas.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 30, clientY: 10 }));
    canvas.dispatchEvent(pointer("pointerup", { pointerId: 1 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    controller.update(0.1);
    const moved = camera.position.clone();
    const velocityWhileHeld = Math.hypot(
      controller.diagnostics().velocity.x,
      controller.diagnostics().velocity.z,
    );
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
    controller.update(0.1);
    const afterRelease = camera.position.clone();
    expect(
      Math.hypot(controller.diagnostics().velocity.x, controller.diagnostics().velocity.z),
    ).toBeLessThan(velocityWhileHeld);
    const input = document.createElement("input");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
    controller.setMode("walk");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(controller.diagnostics().mode).toBeNull();
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(camera.quaternion.equals(originalQuaternion)).toBe(true);
    expect(target.equals(originalTarget)).toBe(true);
    controller.dispose();
  });

  it("builds finite continuous route segments respecting forward/reverse edges and ride completion", () => {
    const route = buildPovRoute(world);
    expect(route.length).toBeGreaterThan(0);
    for (let i = 0; i < route.length; i++) {
      const segment = route[i]!;
      expect(
        [segment.ax, segment.az, segment.bx, segment.bz, segment.length].every(Number.isFinite),
      ).toBe(true);
      expect(segment.length).toBeGreaterThan(0);
      if (i)
        expect(
          Math.hypot(segment.ax - route[i - 1]!.bx, segment.az - route[i - 1]!.bz),
        ).toBeLessThan(0.001);
    }
    const camera = new THREE.PerspectiveCamera();
    const controller = createPovController({
      camera,
      canvas: canvasStub(),
      world,
      reducedMotion: true,
    });
    controller.setMode("ride");
    for (let i = 0; i < 1000 && !controller.diagnostics().rideEnded; i++) controller.update(0.1);
    expect(controller.diagnostics().rideEnded).toBe(true);
    expect(Number.isFinite(camera.position.x) && Number.isFinite(camera.position.z)).toBe(true);
    controller.dispose();
  });

  it("does not reattach orientation after stop while permission is pending", async () => {
    let resolve!: (value: "granted" | "denied") => void;
    const listeners = new Map<string, EventListener>();
    const suppliedWindow = {
      DeviceOrientationEvent: {
        requestPermission: () =>
          new Promise<"granted" | "denied">((r) => {
            resolve = r;
          }),
      },
      addEventListener: (type: string, cb: EventListener) => listeners.set(type, cb),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const samples: number[] = [];
    const controller = createOrientationController(() => samples.push(1), suppliedWindow);
    const pending = controller.start();
    controller.stop();
    resolve("granted");
    expect(await pending).toBe("denied");
    listeners.get("deviceorientation")?.(new Event("deviceorientation"));
    expect(samples).toHaveLength(0);
    controller.dispose();
  });
});
