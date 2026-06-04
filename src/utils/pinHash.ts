const V1_PREFIX = 'rm-pin-v1:';
const V2_PREFIX = 'rm-pin-v2:';

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function fromHex(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return arr;
}

async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return toHex(new Uint8Array(buf));
}

async function pbkdf2Hex(pin: string, salt: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
        key,
        256
    );
    return toHex(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Returns a v2 hash: `rm-pin-v2:<hex-salt>:<hex-pbkdf2>`. Each call produces a unique value. */
export async function hashPin(pin: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2Hex(pin, salt);
    return `${V2_PREFIX}${toHex(salt)}:${hash}`;
}

/** Verifies a PIN against v2 (PBKDF2), v1 (SHA-256), or legacy plaintext hashes. */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith(V2_PREFIX)) {
        const rest = storedHash.slice(V2_PREFIX.length);
        const sep = rest.indexOf(':');
        if (sep === -1) return false;
        const salt = fromHex(rest.slice(0, sep));
        const expected = rest.slice(sep + 1);
        const candidate = await pbkdf2Hex(pin, salt);
        return constantTimeEqual(candidate, expected);
    }
    if (storedHash.startsWith(V1_PREFIX)) {
        const candidate = V1_PREFIX + (await sha256Hex(pin));
        return candidate === storedHash;
    }
    return pin === storedHash;
}

/** Returns true when the stored value was produced by this module (v1 or v2). */
export function isHashed(value: string): boolean {
    return value.startsWith(V1_PREFIX) || value.startsWith(V2_PREFIX);
}
