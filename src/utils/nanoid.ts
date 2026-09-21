/** Tiny nanoid-like ID generator (no dependency) */
export function nanoid(size = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return fromAlphabet(chars, size);
}

// Uppercase + digits, minus the look-alikes I, O, 0, 1 (and no lowercase, so a
// student never has to guess case). For codes hand-typed off a printed slip —
// e.g. a test login teacherKey — where l/I/1 and O/0 confusion breaks the link.
const UNAMBIGUOUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-typable code from an unambiguous alphabet. 32 chars → no modulo bias from a byte. */
export function loginCode(size = 12): string {
    return fromAlphabet(UNAMBIGUOUS, size);
}

function fromAlphabet(chars: string, size: number): string {
    let id = '';
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (const b of bytes) id += chars[b % chars.length];
    return id;
}
