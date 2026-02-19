/** Tiny nanoid-like ID generator (no dependency) */
export function nanoid(size = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (const b of bytes) id += chars[b % chars.length];
    return id;
}
