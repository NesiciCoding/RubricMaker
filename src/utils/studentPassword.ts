const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
// Largest multiple of CHARS.length that fits in a byte — bytes at or above this are
// discarded (rejection sampling) so `byte % CHARS.length` stays uniform instead of
// favoring the low end of the alphabet.
const MAX_UNBIASED_BYTE = Math.floor(256 / CHARS.length) * CHARS.length;

/** Generates a login password for a student to hand out on a printed slip.
 * Excludes visually ambiguous characters (0/O, 1/l/I) since it's read off paper. */
export function generateStudentPassword(length = 10): string {
    let password = '';
    while (password.length < length) {
        const bytes = crypto.getRandomValues(new Uint8Array(length - password.length));
        for (const b of bytes) {
            if (b < MAX_UNBIASED_BYTE) password += CHARS[b % CHARS.length];
        }
    }
    return password;
}
