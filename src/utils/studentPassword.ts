/** Generates a login password for a student to hand out on a printed slip.
 * Excludes visually ambiguous characters (0/O, 1/l/I) since it's read off paper. */
export function generateStudentPassword(length = 10): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) password += chars[b % chars.length];
    return password;
}
