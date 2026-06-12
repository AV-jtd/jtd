import type { EmailItem } from "./types";

const DB_NAME = "jtd_mail";
const DB_VERSION = 1;
const STORE = "emails";
const META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("dateReceived", "dateReceived");
        store.createIndex("from", "from");
        store.createIndex("conversationId", "conversationId");
        store.createIndex("category", "category");
        store.createIndex("isRead", "isRead");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// ── Emails ───────────────────────────────────────────────────────────────────

export async function putEmails(emails: EmailItem[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const e of emails) store.put(e);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllEmails(): Promise<EmailItem[]> {
  return tx(STORE, "readonly", (s) => s.getAll() as IDBRequest<EmailItem[]>);
}

export async function getEmail(id: string): Promise<EmailItem | undefined> {
  return tx(STORE, "readonly", (s) => s.get(id) as IDBRequest<EmailItem | undefined>);
}

export async function deleteEmails(ids: string[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const id of ids) store.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function countEmails(): Promise<number> {
  return tx(STORE, "readonly", (s) => s.count());
}

export async function getEmailsSince(daysAgo: number): Promise<EmailItem[]> {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(0, 0, 0, 0);
  const all = await getAllEmails();
  return all.filter((e) => new Date(e.dateReceived) >= start);
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE, META], "readwrite");
    t.objectStore(STORE).clear();
    t.objectStore(META).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ── Meta (sync state etc.) ───────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx(META, "readonly", (s) => s.get(key) as IDBRequest<{ key: string; value: T } | undefined>);
  return row?.value;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx(META, "readwrite", (s) => s.put({ key, value }));
}
