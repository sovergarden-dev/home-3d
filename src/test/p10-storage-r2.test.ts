import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMemorySession } from "@/memories/session";
import type { MemoryPersistence } from "@/memories/persistence";
import type { Memory, MemoryDocument } from "@/memories/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memory = (n: number, title = `m${n}`): Memory => ({
  id: id(n),
  title,
  body: title,
  position: [0, 0, 0],
  camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
  date: "2026-01-01",
  preset: "everyday",
  tags: [],
  photos: [],
  visibility: "private",
});
const doc = (...memories: Memory[]): MemoryDocument => ({
  schemaVersion: 1,
  memories,
  journal: [],
});
const persistence = (
  stored: MemoryDocument | null,
): MemoryPersistence & { value: MemoryDocument | null; reads: number } => {
  const state = { value: stored, reads: 0 };
  return {
    get value() {
      return state.value;
    },
    set value(v) {
      state.value = v;
    },
    get reads() {
      return state.reads;
    },
    read: async () => {
      state.reads++;
      return state.value;
    },
    write: async (_key, value) => {
      state.value = structuredClone(value);
    },
    remove: async () => {
      state.value = null;
    },
    clear: async () => {
      state.value = null;
    },
  };
};
const ready = async (session: ReturnType<typeof createMemorySession>) => {
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().ready).toBe(true));
};

describe("P10 R2 storage regressions", () => {
  beforeEach(() => localStorage.clear());

  it("remembers opt-in and reads IDB only when enabled", async () => {
    const store = persistence(doc(memory(1)));
    const first = createMemorySession({ persistence: store });
    await ready(first);
    first.saveMemory(memory(2));
    await first.setPersistent(true);
    expect(store.value?.memories.map((m) => m.id)).toContain(id(2));
    first.stop();
    const second = createMemorySession({ persistence: store });
    await ready(second);
    expect(second.getSnapshot().persistent).toBe(true);
    expect(second.getSnapshot().memories.map((m) => m.id)).toContain(id(2));
    await second.setPersistent(false);
    second.stop();
    const off = createMemorySession({ persistence: store });
    await ready(off);
    expect(store.reads).toBe(2);
    await off.setPersistent(false);
    expect(store.reads).toBe(2);
    off.stop();
  });

  it("merges RAM update/delete with persisted records without losing other ids", async () => {
    const store = persistence(doc(memory(1, "persisted-old"), memory(2), memory(3)));
    const s = createMemorySession({ persistence: store });
    await ready(s);
    s.saveMemory(memory(1, "ram-update"));
    s.deleteMemory(id(2));
    await s.setPersistent(true);
    expect(s.getSnapshot().memories.map((m) => [m.id, m.title])).toEqual([
      [id(1), "ram-update"],
      [id(3), "m3"],
    ]);
    s.stop();
  });

  it("cancelled import leaves state unchanged; accepted import merges and survives reload", async () => {
    const store = persistence(null);
    const s = createMemorySession({ persistence: store });
    await ready(s);
    const before = s.exportDocument();
    await s.importDocument(JSON.stringify(doc(memory(9))), { isCancelled: () => true });
    expect(s.exportDocument()).toBe(before);
    await s.importDocument(JSON.stringify(doc(memory(9))));
    await s.setPersistent(true);
    expect(store.value?.memories[0]?.id).toBe(id(9));
    await s.setPersistent(false);
    s.stop();
  });

  it("rejects an over-cap merge before assignment and stays readonly until explicit clear succeeds", async () => {
    const store = persistence(doc(memory(1)));
    store.read = async () => {
      throw new Error("PERSISTENCE_OVERSIZED");
    };
    const s = createMemorySession({ persistence: store });
    await ready(s);
    await s.setPersistent(true);
    expect(s.getSnapshot().persistent).toBe(false);
    expect(s.getSnapshot().error).toMatch(
      /PERSISTENCE_(OVERSIZED|CORRUPT|UNAVAILABLE)|DOCUMENT_TOO_LARGE/,
    );
    expect(store.value?.memories).toHaveLength(1);
    await s.setPersistent(true);
    expect(store.value?.memories).toHaveLength(1);
    await s.clearAll();
    expect(store.value).toBeNull();
    expect(s.getSnapshot().error).toBeNull();
    await s.setPersistent(false);
    s.stop();
  });
});
