/**
 * Encodes a string as URL-safe base64 (RFC 4648 §5): `+`/`/` become `-`/`_` and
 * padding `=` is stripped. Plain base64 can contain `/`, which breaks routes like
 * `/preview/:code` or `/essay/:code` when the code is placed unescaped in a hash URL.
 */
export function encodeUrlSafeBase64(input: string): string {
    const base64 = btoa(encodeURIComponent(input));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes a string produced by {@link encodeUrlSafeBase64}. Also accepts plain base64. */
export function decodeUrlSafeBase64(code: string): string {
    let base64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    return decodeURIComponent(atob(base64));
}
