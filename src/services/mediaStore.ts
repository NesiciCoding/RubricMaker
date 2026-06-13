const DB_NAME = 'rm_media';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

export interface MediaRecord {
    id: string;
    blob: Blob;
    mimeType: string;
    createdAt: string;
}

export interface StorageEstimate {
    usage: number;
    quota: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                dbPromise = null;
                reject(request.error ?? new Error('Failed to open IndexedDB'));
            };
        });
    }
    return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, mode);
    return requestToPromise(fn(tx.objectStore(STORE_NAME)));
}

export async function putBlob(id: string, blob: Blob, mimeType: string): Promise<MediaRecord> {
    const record: MediaRecord = { id, blob, mimeType, createdAt: new Date().toISOString() };
    await withStore('readwrite', (store) => store.put(record));
    return record;
}

export async function getBlob(id: string): Promise<MediaRecord | null> {
    const result = await withStore<MediaRecord | undefined>('readonly', (store) => store.get(id));
    return result ?? null;
}

export async function deleteBlob(id: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(id));
}

export async function listIds(): Promise<string[]> {
    const keys = await withStore('readonly', (store) => store.getAllKeys());
    return keys.map(String);
}

export async function estimateUsage(): Promise<StorageEstimate> {
    try {
        if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
        }
    } catch {
        // estimate() unavailable or rejected — fall through to zeros
    }
    return { usage: 0, quota: 0 };
}
