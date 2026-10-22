import { DocumentSchema, MAX_DOCUMENT_BYTES, type MemoryDocument } from "./schema";
export const MEMORY_DB_NAME = "pnm-p10";
export const MEMORY_STORE_NAME = "worlds";
const DB_VERSION = 1;
type WorldRecord = { worldKey: string; document: MemoryDocument; updatedAt: number };
function validDocument(value: unknown): MemoryDocument | null {
  const result = DocumentSchema.safeParse(value);
  return result.success && JSON.stringify(result.data).length <= MAX_DOCUMENT_BYTES
    ? result.data
    : null;
}
export interface MemoryPersistence {
  read(worldKey: string): Promise<MemoryDocument | null>;
  write(worldKey: string, document: MemoryDocument): Promise<void>;
  remove(worldKey: string): Promise<void>;
  clear?(): Promise<void>;
  diagnostics?(): { connections: number; opens: number };
}
export function createIndexedDbPersistence(): MemoryPersistence {
  let connections = 0;
  let opens = 0;
  const counted = new WeakSet<IDBDatabase>();
  const closed = new WeakSet<IDBDatabase>();
  const close = (db: IDBDatabase) => {
    if (closed.has(db)) return;
    closed.add(db);
    if (counted.has(db)) connections = Math.max(0, connections - 1);
    db.close();
  };
  const getDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("INDEXEDDB_UNAVAILABLE"));
      opens++;
      let settled = false;
      const fail = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      const request = indexedDB.open(MEMORY_DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(MEMORY_STORE_NAME)
          ? request.transaction?.objectStore(MEMORY_STORE_NAME)
          : db.createObjectStore(MEMORY_STORE_NAME, { keyPath: "worldKey" });
        if (store && !store.indexNames.contains("updatedAt"))
          store.createIndex("updatedAt", "updatedAt");
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          close(db);
          return;
        }
        settled = true;
        counted.add(db);
        connections++;
        db.onclose = () => close(db);
        db.onversionchange = () => close(db);
        resolve(db);
      };
      request.onerror = () => fail(new Error("INDEXEDDB_OPEN_FAILED"));
      request.onblocked = () => fail(new Error("INDEXEDDB_BLOCKED"));
    });
  const transaction = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore, set: (value: T) => void) => void,
  ): Promise<T | undefined> => {
    const db = await getDb();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        let value: T | undefined;
        const tx = db.transaction(MEMORY_STORE_NAME, mode);
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(new Error("INDEXEDDB_TRANSACTION_FAILED"));
        tx.onabort = () => reject(new Error("INDEXEDDB_TRANSACTION_ABORTED"));
        try {
          action(tx.objectStore(MEMORY_STORE_NAME), (v) => {
            value = v;
          });
        } catch {
          tx.abort();
          reject(new Error("INDEXEDDB_ACTION_FAILED"));
        }
      });
    } finally {
      close(db);
    }
  };
  return {
    async read(worldKey) {
      return (
        (await transaction<MemoryDocument | null>("readonly", (store, set) => {
          const request = store.get(worldKey);
          request.onsuccess = () =>
            set(validDocument((request.result as WorldRecord | undefined)?.document));
        })) ?? null
      );
    },
    async write(worldKey, document) {
      await transaction("readwrite", (store) => {
        store.put({ worldKey, document, updatedAt: Date.now() } satisfies WorldRecord);
      });
    },
    async remove(worldKey) {
      await transaction("readwrite", (store) => {
        store.delete(worldKey);
      });
    },
    async clear() {
      await transaction("readwrite", (store) => {
        store.clear();
      });
    },
    diagnostics: () => ({ connections, opens }),
  };
}
export const unavailablePersistence: MemoryPersistence = {
  read: async () => null,
  write: async () => {
    throw new Error("INDEXEDDB_UNAVAILABLE");
  },
  remove: async () => {
    throw new Error("INDEXEDDB_UNAVAILABLE");
  },
  clear: async () => {
    throw new Error("INDEXEDDB_UNAVAILABLE");
  },
  diagnostics: () => ({ connections: 0, opens: 0 }),
};
