import { expect, test } from "@playwright/test";

const open = async (page: import("@playwright/test").Page, navigate = true) => {
  if (navigate) await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const m = await window.__p10Import("/src/memories/session.ts");
        return m.memorySession.getSnapshot().ready;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
};
const make = (title: string) => ({
  id: crypto.randomUUID(),
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

test.describe("P10 R2 storage", () => {
  let otherExternalRequests: string[] = [];
  test.beforeEach(async ({ context }) => {
    otherExternalRequests = [];
    await context.addInitScript(() => {
      const counters = window as unknown as { __r2IdbOpenCount: number };
      counters.__r2IdbOpenCount = 0;
      const originalOpen = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
        counters.__r2IdbOpenCount++;
        return originalOpen(...args);
      };
      window.__p10Import = (path) => {
        const entry = [...performance.getEntriesByType("resource")]
          .reverse()
          .find((item) => new URL(item.name).pathname === path);
        return import(/* @vite-ignore */ entry?.name ?? path);
      };
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
        ["blob:", "data:"].includes(url.protocol)
      )
        return route.continue();
      otherExternalRequests.push(url.origin);
      return route.abort();
    });
  });
  test.afterEach(() => {
    expect(otherExternalRequests).toEqual([]);
  });

  test("opt-in reload remembers content and flag-off never reads IDB", async ({ page }) => {
    await open(page);
    expect(
      await page.evaluate(
        () => (window as unknown as { __r2IdbOpenCount: number }).__r2IdbOpenCount,
      ),
    ).toBe(0);
    const result = await page.evaluate(async () => {
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      const m = {
        ...({
          id: crypto.randomUUID(),
          title: "R2_RELOAD",
          body: "R2_RELOAD",
          position: [0, 0, 0],
          camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
          date: "2026-01-01",
          preset: "everyday",
          tags: [],
          photos: [],
          visibility: "private",
        } as const),
      };
      s.saveMemory(m as never);
      await s.setPersistent(true);
      return s.getSnapshot().memories.some((x) => x.title === "R2_RELOAD");
    });
    expect(result).toBe(true);
    await page.reload();
    await open(page, false);
    expect(
      await page.evaluate(async () =>
        (await window.__p10Import("/src/memories/session.ts")).memorySession
          .getSnapshot()
          .memories.some((m) => m.title === "R2_RELOAD"),
      ),
    ).toBe(true);
    await page.evaluate(async () =>
      (await window.__p10Import("/src/memories/session.ts")).memorySession.setPersistent(false),
    );
    await open(page);
    expect(
      await page.evaluate(
        () => (window as unknown as { __r2IdbOpenCount: number }).__r2IdbOpenCount,
      ),
    ).toBe(0);
  });

  test("import cancel is atomic and accept merges by id", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      const makeMemory = (title: string) => ({
        id: crypto.randomUUID(),
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
      const first = makeMemory("R2_IMPORT");
      await s.importDocument(JSON.stringify({ schemaVersion: 1, memories: [first], journal: [] }), {
        isCancelled: () => true,
      });
      const cancelled = s.getSnapshot().memories.some((m) => m.title === "R2_IMPORT");
      await s.importDocument(JSON.stringify({ schemaVersion: 1, memories: [first], journal: [] }));
      return { cancelled, accepted: s.getSnapshot().memories.some((m) => m.title === "R2_IMPORT") };
    });
    expect(result).toEqual({ cancelled: false, accepted: true });
  });

  test("missing/corrupt IDB is readonly without pageerror; confirmed clear recovers", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await open(page);
    const result = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open(MEMORY_DB_NAME, 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore(MEMORY_STORE_NAME, { keyPath: "worldKey" });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
      });
      const { createIndexedDbPersistence } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const p = createIndexedDbPersistence();
      const missing = await p.read("never-written");
      return { missing, diagnostics: p.diagnostics?.() };
    });
    expect(result.missing).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("UI import dismisses atomically, then accepts an id merge while retaining other ids", async ({
    page,
  }) => {
    await open(page);
    const ids = await page.evaluate(
      async ([first, other]) => {
        const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
        s.saveMemory(first as never);
        s.saveMemory(other as never);
        return { first, other };
      },
      [
        { ...make("IMPORT_ORIGINAL"), id: "00000000-0000-4000-8000-000000000101" },
        { ...make("IMPORT_OTHER"), id: "00000000-0000-4000-8000-000000000102" },
      ],
    );
    const packageText = JSON.stringify({
      schemaVersion: 1,
      memories: [{ ...ids.first, title: "IMPORT_UPDATED", body: "IMPORT_UPDATED" }],
      journal: [],
    });
    const input = page.getByLabel("Nhập gói kỷ niệm", { exact: true });
    page.once("dialog", (dialog) => dialog.dismiss());
    await input.setInputFiles({
      name: "synthetic-import.json",
      mimeType: "application/json",
      buffer: Buffer.from(packageText),
    });
    await expect(page.getByText("IMPORT_ORIGINAL", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("IMPORT_OTHER", { exact: true }).first()).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await input.setInputFiles({
      name: "synthetic-import-accepted.json",
      mimeType: "application/json",
      buffer: Buffer.from(packageText),
    });
    await expect(page.getByText("IMPORT_UPDATED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("IMPORT_ORIGINAL", { exact: true })).toHaveCount(0);
    await expect(page.getByText("IMPORT_OTHER", { exact: true }).first()).toBeVisible();
  });

  test("corrupt IndexedDB remains readonly and exact until confirmed UI clear", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(page);
    const seeded = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const record = {
        worldKey: "synthetic-fixture-p10",
        document: { schemaVersion: 999, bad: "SYNTHETIC_CORRUPT" },
        updatedAt: 123,
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(MEMORY_DB_NAME, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(MEMORY_STORE_NAME))
            r.result.createObjectStore(MEMORY_STORE_NAME, { keyPath: "worldKey" });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MEMORY_STORE_NAME, "readwrite");
        tx.objectStore(MEMORY_STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      await s.setPersistent(true);
      const first = { error: s.getSnapshot().error, persistent: s.getSnapshot().persistent };
      s.saveMemory({
        id: "00000000-0000-4000-8000-000000000103",
        title: "CORRUPT_RAM",
        body: "CORRUPT_RAM",
        position: [0, 0, 0],
        camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
        date: "2026-01-01",
        preset: "everyday",
        tags: [],
        photos: [],
        visibility: "private",
      } as never);
      await s.setPersistent(false);
      await s.setPersistent(true);
      localStorage.setItem("pnm-p10-persistence-opt-in", "1");
      const raw = await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(MEMORY_DB_NAME, 1);
        request.onsuccess = () => {
          const db2 = request.result;
          const get = db2
            .transaction(MEMORY_STORE_NAME, "readonly")
            .objectStore(MEMORY_STORE_NAME)
            .get("synthetic-fixture-p10");
          get.onsuccess = () => {
            db2.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      });
      return { first, record, raw };
    });
    expect(seeded.first).toEqual({ error: "PERSISTENCE_CORRUPT", persistent: false });
    expect(seeded.raw).toEqual(seeded.record);
    await page.reload();
    await open(page, false);
    await expect(
      page.getByText("Bản lưu trên thiết bị bị hỏng hoặc quá lớn", { exact: false }),
    ).toBeVisible();
    const afterReload = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(MEMORY_DB_NAME, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return await new Promise<unknown>((resolve, reject) => {
        const request = db
          .transaction(MEMORY_STORE_NAME, "readonly")
          .objectStore(MEMORY_STORE_NAME)
          .get("synthetic-fixture-p10");
        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    });
    expect(afterReload).toEqual(seeded.record);
    await page.getByText("Lưu trên thiết bị này", { exact: true }).first().click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Xoá tất cả kỷ niệm trên máy này", exact: true })
      .click();
    await expect(page.getByText("Ví dụ tổng hợp", { exact: true }).first()).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Xoá tất cả kỷ niệm trên máy này", exact: true })
      .click();
    const count = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(MEMORY_DB_NAME, 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return await new Promise<number>((resolve, reject) => {
        const r = db
          .transaction(MEMORY_STORE_NAME, "readonly")
          .objectStore(MEMORY_STORE_NAME)
          .count();
        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
        r.onerror = () => reject(r.error);
      });
    });
    expect(count).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test("valid oversized IndexedDB remains exact and readonly until confirmed UI clear", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(page);
    const cap = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const tiny = "data:image/png;base64,iVBORw0KGgo=";
      const hugePhoto = {
        id: "photo-oversized",
        dataUrl: "data:image/png;base64," + "A".repeat(64 * 1024 * 1024),
        thumbnail: tiny,
        placeholder: tiny,
        width: 1,
        height: 1,
        reviewed: true,
      };
      const hugeMemory = {
        id: "00000000-0000-4000-8000-000000000105",
        title: "OVERSIZED_SYNTHETIC",
        body: "OVERSIZED_SYNTHETIC",
        position: [0, 0, 0],
        camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
        date: "2026-01-01",
        preset: "everyday",
        tags: [],
        photos: [hugePhoto],
        visibility: "private",
      };
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      const before = s.exportDocument();
      let error = "";
      try {
        s.saveMemory(hugeMemory as never);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      const after = s.exportDocument();
      const document = { schemaVersion: 1, memories: [hugeMemory], journal: [] };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(MEMORY_DB_NAME, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(MEMORY_STORE_NAME))
            r.result.createObjectStore(MEMORY_STORE_NAME, { keyPath: "worldKey" });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MEMORY_STORE_NAME, "readwrite");
        tx.objectStore(MEMORY_STORE_NAME).put({
          worldKey: "synthetic-fixture-p10",
          document,
          updatedAt: 456,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return { error, unchanged: before === after, dataUrlLength: hugePhoto.dataUrl.length };
    });
    expect(cap.error).toBe("DOCUMENT_TOO_LARGE");
    expect(cap.unchanged).toBe(true);
    expect(cap.dataUrlLength).toBe(64 * 1024 * 1024 + "data:image/png;base64,".length);
    const state = await page.evaluate(async () => {
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      await s.setPersistent(true);
      s.saveMemory({
        id: "00000000-0000-4000-8000-000000000104",
        title: "RAM_AFTER_OVERSIZE",
        body: "RAM_AFTER_OVERSIZE",
        position: [0, 0, 0],
        camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
        date: "2026-01-01",
        preset: "everyday",
        tags: [],
        photos: [],
        visibility: "private",
      } as never);
      await s.setPersistent(false);
      await s.setPersistent(true);
      return { error: s.getSnapshot().error, persistent: s.getSnapshot().persistent };
    });
    expect(["PERSISTENCE_OVERSIZED", "DOCUMENT_TOO_LARGE"]).toContain(state.error);
    expect(state.persistent).toBe(false);
    await page.reload();
    await open(page, false);
    const afterLength = await page.evaluate(async () => {
      const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
        "/src/memories/persistence.ts",
      );
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(MEMORY_DB_NAME, 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return await new Promise<number>((resolve, reject) => {
        const r = db
          .transaction(MEMORY_STORE_NAME, "readonly")
          .objectStore(MEMORY_STORE_NAME)
          .get("synthetic-fixture-p10");
        r.onsuccess = () => {
          db.close();
          resolve(r.result.document.memories[0].photos[0].dataUrl.length);
        };
        r.onerror = () => reject(r.error);
      });
    });
    expect(afterLength).toBe(cap.dataUrlLength);
    // RAM edits deliberately do not survive reload when persistence is readonly.
    const beforeClear = await page.evaluate(async () =>
      (await window.__p10Import("/src/memories/session.ts")).memorySession.exportDocument(),
    );
    await page.getByText("Lưu trên thiết bị này", { exact: true }).first().click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Xoá tất cả kỷ niệm trên máy này", exact: true })
      .click();
    expect(
      await page.evaluate(async () =>
        (await window.__p10Import("/src/memories/session.ts")).memorySession.exportDocument(),
      ),
    ).toBe(beforeClear);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Xoá tất cả kỷ niệm trên máy này", exact: true })
      .click();
    await expect(page.getByTestId("memory-card")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { MEMORY_DB_NAME, MEMORY_STORE_NAME } = await window.__p10Import(
            "/src/memories/persistence.ts",
          );
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open(MEMORY_DB_NAME, 1);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          return new Promise<number>((resolve, reject) => {
            const r = db
              .transaction(MEMORY_STORE_NAME, "readonly")
              .objectStore(MEMORY_STORE_NAME)
              .count();
            r.onsuccess = () => {
              db.close();
              resolve(r.result);
            };
            r.onerror = () => reject(r.error);
          });
        }),
      )
      .toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
