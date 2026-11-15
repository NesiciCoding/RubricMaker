/** Returns the URL only when protocol is http(s) or a same-MIME-family data: URI, blocking javascript: and other dangerous schemes. */
export function safeImgSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        // new URL('data:...') parses successfully (protocol: 'data:') rather than throwing,
        // so data: URIs must be checked inside the try block, not the catch fallback.
        const u = new URL(url);
        if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
        if (u.protocol === 'data:' && /^data:image\//i.test(u.href)) return u.href;
    } catch {
        // not a valid absolute URL
    }
    return undefined;
}

/** Returns the URL only when protocol is http(s) or a same-MIME-family data: URI, blocking javascript: and other dangerous schemes. */
export function safeAudioSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
        if (u.protocol === 'data:' && /^data:audio\//i.test(u.href)) return u.href;
    } catch {
        // not a valid absolute URL
    }
    return undefined;
}
