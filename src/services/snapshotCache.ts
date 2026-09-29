const DB_NAME = 'rm_cache';
const STORE_NAME = 'collections';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
let cloudHydrated = false;

function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
        });
        dbPromise.catch(() => {
            dbPromise = null;
        });
    }
    return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = fn(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

/** Returns true when the snapshot was durably written; callers fall back to localStorage otherwise. */
export async function putSnapshot(key: string, value: unknown): Promise<boolean> {
    try {
        await run('readwrite', (s) => s.put(value, key));
        return true;
    } catch {
        return false;
    }
}

export async function getSnapshot<T>(key: string): Promise<T | null> {
    try {
        return ((await run<T | undefined>('readonly', (s) => s.get(key))) ?? null) as T | null;
    } catch {
        return null;
    }
}

export async function clearSnapshots(): Promise<void> {
    try {
        await run('readwrite', (s) => s.clear());
    } catch {
        // cache is disposable; nothing to wipe if the DB can't be opened
    }
}

/**
 * Once Supabase data has been merged into state, a stale cached snapshot must never be applied
 * on top of it (it could resurrect rows deleted on another device).
 */
export function markCloudHydrated(): void {
    cloudHydrated = true;
}

export function isCloudHydrated(): boolean {
    return cloudHydrated;
}

export function resetCloudHydratedForTests(): void {
    cloudHydrated = false;
}
