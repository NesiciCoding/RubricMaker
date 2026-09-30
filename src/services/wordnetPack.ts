// Offline definitions from Open English WordNet (CC BY 4.0), built by scripts/build-wordnet-pack.mjs.
// The pack is a static asset that is only downloaded after the teacher confirms, then kept in
// IndexedDB (its own database — it is reference data, not user data, so clearLocalData leaves it).

const DB_NAME = 'rm_wordnet';
const STORE = 'pack';
const KEY = 'oewn-defs';

export const WORDNET_PACK_APPROX_MB = 3.3;

export interface WordnetLookupResult {
    definition: string;
    partOfSpeech: string;
    example: string | null;
}

type PackEntry = [pos: string, definition: string, example?: string];

const POS_NAMES: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

let index: Map<string, PackEntry[]> | null = null;
let loading: Promise<Map<string, PackEntry[]> | null> | null = null;

function packUrl(): string {
    return `${import.meta.env.BASE_URL}wordnet/oewn-defs.json.gz`;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        });
    } finally {
        db.close();
    }
}

export async function isWordnetInstalled(): Promise<boolean> {
    try {
        return (await withStore('readonly', (s) => s.count(KEY))) > 0;
    } catch {
        return false;
    }
}

/**
 * Downloads the pack and stores it. `onProgress` receives 0–1 when the server reports a length.
 * Throws on a failed or aborted download so the caller can show an error and offer a retry.
 */
export async function downloadWordnetPack(
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal
): Promise<void> {
    const res = await fetch(packUrl(), { signal });
    if (!res.ok || !res.body) throw new Error(`WordNet pack download failed (${res.status})`);

    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) onProgress?.(Math.min(received / total, 1));
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
    }
    await withStore('readwrite', (s) => s.put(bytes.buffer, KEY));
    onProgress?.(1);
    index = null;
    loading = null;
}

export async function removeWordnetPack(): Promise<void> {
    await withStore('readwrite', (s) => s.delete(KEY));
    index = null;
    loading = null;
}

async function inflate(bytes: Uint8Array): Promise<string> {
    // Some static hosts serve .gz with Content-Encoding: gzip, so the browser hands us plain JSON.
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (!isGzip) return new TextDecoder().decode(bytes);
    const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

function loadIndex(): Promise<Map<string, PackEntry[]> | null> {
    if (index) return Promise.resolve(index);
    loading ??= (async () => {
        try {
            const stored = await withStore<ArrayBuffer | undefined>('readonly', (s) => s.get(KEY));
            if (!stored) return null;
            const parsed = JSON.parse(await inflate(new Uint8Array(stored))) as Record<string, PackEntry[]>;
            index = new Map(Object.entries(parsed));
            return index;
        } catch {
            loading = null;
            return null;
        }
    })();
    return loading;
}

/** Returns null when the pack is not installed or the word is unknown. */
export async function lookupWordnet(word: string): Promise<WordnetLookupResult | null> {
    const term = word?.trim().toLowerCase();
    if (!term) return null;
    const entry = (await loadIndex())?.get(term)?.[0];
    if (!entry) return null;
    return { definition: entry[1], partOfSpeech: POS_NAMES[entry[0]] ?? entry[0], example: entry[2] ?? null };
}
