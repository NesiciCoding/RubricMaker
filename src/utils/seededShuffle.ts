/**
 * Deterministic shuffle seeded by a string so reloads/draft restores produce
 * the same order for a given student.
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) >>> 0;
        const j = h % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
