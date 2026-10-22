import { describe, expect, it, vi } from "vitest";
import { createMemorySession } from "@/memories/session";
import { publicDocument, type Memory, type MemoryDocument, type Photo } from "@/memories/schema";
import type { MemoryPersistence } from "@/memories/persistence";
const photo: Photo = {
  id: "sample",
  dataUrl: "data:image/png;base64,AA==",
  thumbnail: "data:image/png;base64,AA==",
  placeholder: "data:image/png;base64,AA==",
  width: 1,
  height: 1,
  reviewed: false,
};
const memory = (): Memory => ({
  id: crypto.randomUUID(),
  title: "Ví dụ tổng hợp",
  body: "",
  position: [0, 0, 0],
  camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
  date: "2026-06-21",
  preset: "everyday",
  tags: [],
  photos: [],
  visibility: "private",
});
const ready = async (s: ReturnType<typeof createMemorySession>) => {
  s.start();
  await vi.waitFor(() => expect(s.getSnapshot().ready).toBe(true));
};
describe("P10 final review regressions", () => {
  it("aborts import between images when owner invalidates UI token", async () => {
    let cancelled = false;
    const processor = vi.fn(async () => {
      cancelled = true;
      return photo;
    });
    const s = createMemorySession({ photoProcessor: processor });
    await ready(s);
    const before = s.exportDocument();
    const m = { ...memory(), photos: [photo, photo] };
    await s.importDocument(JSON.stringify({ schemaVersion: 1, memories: [m], journal: [] }), {
      isCancelled: () => cancelled,
    });
    expect(processor).toHaveBeenCalledTimes(1);
    expect(s.exportDocument()).toBe(before);
    s.stop();
  });
  it("public projection drops entire public item with unreviewed photos", () => {
    const m = { ...memory(), visibility: "public" as const, photos: [photo] };
    expect(publicDocument({ schemaVersion: 1, memories: [m], journal: [] }).memories).toEqual([]);
  });
  it("normalizes unchecked persisted public item to private before guest reads", async () => {
    const doc: MemoryDocument = {
      schemaVersion: 1,
      memories: [{ ...memory(), visibility: "public", photos: [photo] }],
      journal: [],
    };
    const persistence: MemoryPersistence = {
      read: async () => doc,
      write: async () => {},
      remove: async () => {},
    };
    const s = createMemorySession({ persistence });
    await ready(s);
    await s.setPersistent(true);
    s.setGuest(true);
    expect(s.getSnapshot().memories[0]?.visibility).toBe("private");
    expect(JSON.parse(s.exportDocument()).memories).toEqual([]);
    s.stop();
  });
  it("queues clear behind pending writes and never resurrects the cleared document", async () => {
    const order: string[] = [];
    let block = false;
    let release = () => {};
    let saved: MemoryDocument | null = null;
    const persistence: MemoryPersistence = {
      read: async () => null,
      write: async (_k, doc) => {
        if (block)
          await new Promise<void>((r) => {
            release = r;
          });
        saved = doc;
        order.push("write");
      },
      remove: async () => {},
      clear: async () => {
        saved = null;
        order.push("clear");
      },
    };
    const s = createMemorySession({ persistence });
    await ready(s);
    await s.setPersistent(true);
    block = true;
    s.saveMemory(memory());
    await vi.waitFor(() => expect(order).toEqual(["write"]));
    await Promise.resolve();
    const clearing = s.clearAll();
    await Promise.resolve();
    expect(order).toEqual(["write"]);
    release();
    await clearing;
    expect(order).toEqual(["write", "write", "clear"]);
    expect(saved).toBeNull();
    s.stop();
  });
});

it("fuzzes strict deep-link parser with seeded synthetic inputs", async () => {
  const { parseMemoryHash } = await import("@/memories/deepLink");
  let seed = 1701;
  for (let i = 0; i < 500; i++) {
    let hash = i % 2 ? "#pnm=" : "#";
    for (let j = 0; j < i % 80; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      hash += String.fromCharCode(32 + (seed % 95));
    }
    expect(() => parseMemoryHash(hash)).not.toThrow();
    const parsed = parseMemoryHash(hash);
    if (parsed.state?.pose) expect(parsed.state.pose.target.every(Number.isFinite)).toBe(true);
  }
});
it("Catmull–Rom camera parameters stay finite and above ground across yaw seam", async () => {
  const { catmullCameraPose } = await import("@/memories/camera");
  const base = memory().camera;
  const poses = [
    { ...base, yaw: 3.1, target: [-20, 0, 10] as [number, number, number] },
    { ...base, yaw: -3.1, target: [0, 2, 0] as [number, number, number] },
    { ...base, yaw: 3.09, target: [25, 0, 12] as [number, number, number] },
    { ...base, yaw: -3.08, target: [30, 1, 20] as [number, number, number] },
  ];
  for (let i = 0; i <= 100; i++) {
    const p = catmullCameraPose(poses[0]!, poses[1]!, poses[2]!, poses[3]!, i / 100);
    expect(p.target.every(Number.isFinite)).toBe(true);
    expect(p.target[1]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.yaw + p.pitch + p.distance)).toBe(true);
  }
});
