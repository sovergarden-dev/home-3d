import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemorySession } from "@/memories/session";
import {
  MAX_DOCUMENT_BYTES,
  serializeDocument,
  type Memory,
  type MemoryDocument,
  type Photo,
} from "@/memories/schema";
import type { MemoryPersistence } from "@/memories/persistence";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memory = (n: number, photos: Photo[] = []): Memory => ({
  id: id(n),
  title: "SYNTHETIC_CAP",
  body: "",
  position: [0, 0, 0],
  camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
  date: "2026-01-01",
  preset: "everyday",
  tags: [],
  photos,
  visibility: "private",
});
const photo = (bytes: number): Photo => ({
  id: "SYNTHETIC_PHOTO",
  dataUrl: `data:image/png;base64,${"A".repeat(bytes)}`,
  thumbnail: "data:image/png;base64,AA==",
  placeholder: "data:image/png;base64,AA==",
  width: 1,
  height: 1,
  reviewed: false,
});
const doc = (memories: Memory[]): MemoryDocument => ({ schemaVersion: 1, memories, journal: [] });
const store = (): MemoryPersistence & { writes: number; value: MemoryDocument | null } => ({
  writes: 0,
  value: null,
  async read() {
    return this.value;
  },
  async write(_key, value) {
    this.writes++;
    this.value = value;
  },
  async remove() {
    this.value = null;
  },
  async clear() {
    this.value = null;
  },
});
async function ready(s: ReturnType<typeof createMemorySession>) {
  s.start();
  await vi.waitFor(() => expect(s.getSnapshot().ready).toBe(true));
}

describe("P10 R2 total cap and readonly failure safety", () => {
  beforeEach(() => localStorage.clear());
  it("counts UTF-8 bytes, not JS UTF-16 code units", () => {
    const value = memory(1);
    value.body = "Đ".repeat(MAX_DOCUMENT_BYTES / 2);
    expect(() => serializeDocument(doc([value]))).toThrow("DOCUMENT_TOO_LARGE");
  }, 20000);
  it("rejects an oversized memory and journal before assignment or persistence", async () => {
    const p = store(),
      s = createMemorySession({ persistence: p });
    await ready(s);
    const old = s.getSnapshot();
    const huge = photo(MAX_DOCUMENT_BYTES);
    expect(() => s.saveMemory(memory(1, [huge]))).toThrow("DOCUMENT_TOO_LARGE");
    expect(() =>
      s.saveJournal({ id: id(2), date: "2026-01-01", stage: "land", body: "", photos: [huge] }),
    ).toThrow("DOCUMENT_TOO_LARGE");
    expect(s.getSnapshot()).toBe(old);
    expect(p.writes).toBe(0);
    s.stop();
  }, 20000);
  it("undo cannot restore a deleted photo over the total cap", async () => {
    const s = createMemorySession({ persistence: store() });
    await ready(s);
    const large = photo(36 * 1024 * 1024);
    s.saveMemory(memory(1, [large]));
    s.deleteMemory(id(1));
    s.saveMemory(memory(2, [large]));
    // saveMemory deliberately expires undo; delete another large item, fill the
    // space with a journal entry (which preserves undo), then attempt restore.
    s.deleteMemory(id(2));
    s.saveJournal({ id: id(3), date: "2026-01-01", stage: "land", body: "", photos: [large] });
    const before = s.exportDocument();
    expect(() => s.undoDelete()).toThrow("DOCUMENT_TOO_LARGE");
    expect(s.exportDocument()).toBe(before);
    s.stop();
  }, 20000);
  it("rejects an over-count import merge atomically", async () => {
    const s = createMemorySession({ persistence: store() });
    await ready(s);
    const before = s.exportDocument();
    await expect(
      s.importDocument(JSON.stringify(doc(Array.from({ length: 300 }, (_, i) => memory(i + 1))))),
    ).rejects.toThrow();
    expect(s.exportDocument()).toBe(before);
    s.stop();
  });
  it("a failed explicit clear never unlocks a corrupt persistence store", async () => {
    const p = store();
    p.read = async () => {
      throw new Error("PERSISTENCE_CORRUPT");
    };
    p.clear = async () => {
      throw new Error("SYNTHETIC_CLEAR_FAILURE");
    };
    const s = createMemorySession({ persistence: p });
    await ready(s);
    await s.setPersistent(true);
    expect(s.getSnapshot().error).toBe("PERSISTENCE_CORRUPT");
    s.saveMemory(memory(1));
    await s.clearAll();
    await s.setPersistent(true);
    s.saveMemory(memory(2));
    await Promise.resolve();
    expect(s.getSnapshot().persistent).toBe(false);
    expect(p.writes).toBe(0);
    s.stop();
  });
  it("an over-count RAM/persisted merge is readonly and preserves both sides", async () => {
    const p = store();
    const stored = doc(Array.from({ length: 300 }, (_, i) => memory(i + 1)));
    p.value = stored;
    const s = createMemorySession({ persistence: p });
    await ready(s);
    s.saveMemory(memory(999));
    await s.setPersistent(true);
    expect(s.getSnapshot().persistent).toBe(false);
    expect(s.getSnapshot().error).toBe("PERSISTENCE_CORRUPT");
    expect(s.getSnapshot().memories.some((m) => m.id === id(999))).toBe(true);
    expect(p.value).toBe(stored);
    expect(p.writes).toBe(0);
    s.stop();
  });
});
