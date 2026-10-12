const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeHref(raw: string | undefined | null): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    try {
        return ALLOWED_PROTOCOLS.has(new URL(value).protocol) ? value : undefined;
    } catch {
        return undefined;
    }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_HOST = /^(?:localhost|[^\s/:?#]+\.[^\s/:?#]+)(?::\d+)?(?:[/?#]|$)/i;

/**
 * Normalises a link a teacher typed: `www.bbc.com/news` and `//bbc.com` gain `https://`, so the
 * stored value is absolute and doesn't resolve against the app's own origin.
 */
export function normalizeLinkUrl(raw: string | undefined | null): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    let candidate = value;
    if (value.startsWith('//')) candidate = `https:${value}`;
    else if (!HAS_SCHEME.test(value) && !/^mailto:/i.test(value) && BARE_HOST.test(value)) {
        candidate = `https://${value}`;
    }
    const href = safeHref(candidate);
    if (!href || href.toLowerCase().startsWith('mailto:')) return href;
    const { hostname } = new URL(href);
    return hostname === 'localhost' || hostname.includes('.') ? href : undefined;
}
