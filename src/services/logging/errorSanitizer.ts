// Turns an error into something that may be stored in `client_logs` without carrying anything a
// user typed. `Error.message` can echo user input ("Cannot read properties of undefined (reading
// 'Anna Jansen')"), so the message is never stored: only a hash of its normalised form, which still
// groups the same failure across sessions. Everything here is pure and total (never throws).

const NAME_PATTERN = /^[A-Za-z_$][\w$.]{0,63}$/;
const MAX_FRAMES = 5;

/** Plain values that cannot carry free text: numbers, booleans, null and identifier-shaped strings. */
const SAFE_STRING = /^[A-Za-z0-9_.:/-]{1,160}$/;

export interface ErrorDescription {
    /** `error.name` when it looks like an identifier, otherwise a generic label. */
    errorName: string;
    /** Hash of the message with quoted text, numbers, urls, ids and emails removed. */
    messageHash: string;
    /** `assets/<file>.js:line:col` of our own bundle only, innermost first. */
    frames: string[];
    /** Stable per-failure key: same error, same place, same hash. Used for dedupe and grouping. */
    signature: string;
}

/** cyrb53: a small, fast, well-distributed non-cryptographic hash. Grouping, not security. */
export function hashText(text: string, seed = 0): string {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Strips everything in a message that varies per occurrence or could be user input. */
export function normalizeMessage(message: string): string {
    return message
        .replace(/https?:\/\/\S+/gi, '<url>')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
        .replace(/(["'`])(?:(?!\1).)*\1/g, '<text>')
        .replace(/\b\d[\d.,:]*\b/g, '<n>')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message: unknown }).message;
        return typeof message === 'string' ? message : '';
    }
    return '';
}

function nameOf(error: unknown): string {
    const raw =
        error instanceof Error
            ? error.name
            : error && typeof error === 'object' && 'name' in error
              ? (error as { name: unknown }).name
              : undefined;
    if (typeof raw === 'string' && NAME_PATTERN.test(raw)) return raw;
    return error instanceof Error ? 'Error' : 'NonError';
}

function sameOrigin(url: URL): boolean {
    try {
        return url.origin === window.location.origin;
    } catch {
        return false;
    }
}

/**
 * `file:line:col` for each stack line that points into our own bundle. Frames from other origins
 * (extensions, injected scripts, CDNs) are dropped, and so are function names and query strings:
 * with the private source map the file position is all that is needed to find the code.
 */
export function ownFrames(stack: string | undefined, limit = MAX_FRAMES): string[] {
    if (!stack) return [];
    const frames: string[] = [];
    for (const line of stack.split('\n')) {
        const located = line.match(/(https?:\/\/[^\s()'"]+?):(\d+):(\d+)/);
        if (!located) continue;
        let url: URL;
        try {
            url = new URL(located[1]);
        } catch {
            continue;
        }
        if (!sameOrigin(url)) continue;
        const start = url.pathname.search(/\/(?:assets|src)\//);
        if (start < 0) continue;
        frames.push(`${url.pathname.slice(start + 1)}:${located[2]}:${located[3]}`);
        if (frames.length >= limit) break;
    }
    return frames;
}

export function describeError(error: unknown): ErrorDescription {
    const errorName = nameOf(error);
    const messageHash = hashText(normalizeMessage(messageOf(error)));
    const stack = error instanceof Error ? error.stack : undefined;
    const frames = ownFrames(stack);
    return {
        errorName,
        messageHash,
        frames,
        signature: hashText(`${errorName}|${messageHash}|${frames[0] ?? ''}`),
    };
}

/**
 * The route pattern, not the route: a student link carries a share code and a teacher route carries
 * record ids, neither of which belongs in a diagnostics row. Plain words (`grade`, `monitor`,
 * `cefr-overview`) stay; anything else after the first segment becomes `:id`.
 */
export function normalizeRoute(path: string): string {
    const segments = path.split('?')[0].split('/').filter(Boolean);
    if (segments.length === 0) return '/';
    const kept = segments.map((segment, index) =>
        index === 0 || /^[a-z]+(?:-[a-z]+)*$/.test(segment) ? segment : ':id'
    );
    return `/${kept.join('/')}`;
}

/**
 * Defence in depth for rows written by callers that predate the sanitiser: keep only values that
 * cannot hold sentences. Nested objects are dropped; arrays survive only as identifier-shaped strings.
 */
export function scrubMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!meta) return null;
    const safe = (value: unknown): boolean =>
        value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && SAFE_STRING.test(value));
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
        if (Array.isArray(value)) {
            const items = value.filter(safe);
            if (items.length > 0) out[key] = items;
        } else if (safe(value)) {
            out[key] = value;
        }
    }
    return Object.keys(out).length > 0 ? out : null;
}
