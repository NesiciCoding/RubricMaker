const PREFIX = 'rm-pin-v1:';

async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Returns a prefixed hex-SHA-256 hash of the PIN. */
export async function hashPin(pin: string): Promise<string> {
    return PREFIX + (await sha256Hex(pin));
}

/** Constant-time-ish comparison via hashing both sides. */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
    if (!isHashed(storedHash)) return pin === storedHash; // legacy plaintext fallback
    const candidate = await hashPin(pin);
    return candidate === storedHash;
}

/** Returns true when the stored value has already been hashed by this module. */
export function isHashed(value: string): boolean {
    return value.startsWith(PREFIX);
}
