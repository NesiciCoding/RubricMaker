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
