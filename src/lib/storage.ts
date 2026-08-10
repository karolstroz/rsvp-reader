/**
 * Document library, backed by IndexedDB.
 *
 * Settings live in localStorage (tiny, synchronous, read on first paint), but
 * documents do not: a single EPUB easily exceeds the ~5 MB localStorage quota.
 * IndexedDB holds the bodies and the reading positions.
 *
 * The wrapper is deliberately dependency-free — it is a handful of object-store
 * calls, and keeping it local means the storage layer can be swapped for
 * SQLite/AsyncStorage in a Capacitor or React Native shell without touching
 * anything else.
 */

import type { DocumentSummary, ReadingDocument } from '@/types';

const DB_NAME = 'rsvp-reader';
const DB_VERSION = 1;
const STORE = 'documents';
const MAX_DOCUMENTS = 50;

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the library.'));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Library request failed.'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export function createDocumentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Persist a document (insert or overwrite). */
export async function saveDocument(document: ReadingDocument): Promise<void> {
  if (!isAvailable()) return;

  await runTransaction('readwrite', (store) => store.put(document));
  await pruneLibrary();
}

export async function getDocument(id: string): Promise<ReadingDocument | undefined> {
  if (!isAvailable()) return undefined;
  return runTransaction<ReadingDocument | undefined>('readonly', (store) => store.get(id));
}

/** All documents, newest first, without their body text. */
export async function listDocuments(): Promise<DocumentSummary[]> {
  if (!isAvailable()) return [];

  const all = await runTransaction<ReadingDocument[]>('readonly', (store) => store.getAll());

  return all
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ text: _text, ...summary }) => summary);
}

export async function deleteDocument(id: string): Promise<void> {
  if (!isAvailable()) return;
  await runTransaction('readwrite', (store) => store.delete(id));
}

/**
 * Update just the reading position.
 *
 * Called frequently during playback, so it reads and writes a single record
 * rather than round-tripping the whole library.
 */
export async function saveProgress(id: string, progress: number): Promise<void> {
  if (!isAvailable()) return;

  const existing = await getDocument(id);
  if (!existing) return;

  await runTransaction('readwrite', (store) =>
    store.put({ ...existing, progress, updatedAt: Date.now() }),
  );
}

/** Keep the library bounded — drop the least recently opened documents. */
async function pruneLibrary(): Promise<void> {
  const all = await runTransaction<ReadingDocument[]>('readonly', (store) => store.getAll());
  if (all.length <= MAX_DOCUMENTS) return;

  const stale = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_DOCUMENTS);

  for (const document of stale) {
    await deleteDocument(document.id);
  }
}
