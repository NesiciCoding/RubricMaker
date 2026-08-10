const SIGNED_URL_TTL_MS = 55 * 60 * 1000; // 55 min (URLs valid 60 min)

interface CachedUrl {
    url: string;
    expiresAt: number;
}

export function getCachedSignedUrl(key: string): string | null {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const cached: CachedUrl = JSON.parse(raw);
        if (Date.now() > cached.expiresAt) return null;
        return cached.url;
    } catch {
        return null;
    }
}

export function setCachedSignedUrl(key: string, url: string) {
    try {
        const entry: CachedUrl = { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
        sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
        /* ignore */
    }
}
