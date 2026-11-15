/** Student responses are stored as strings, so valid JSON of the wrong shape must read as "no answer", not throw. */

function parse(response: string): unknown {
    try {
        return JSON.parse(response);
    } catch {
        return undefined;
    }
}

/** cloze response: gap index → typed answer; anything but a plain object of strings is empty. */
export function parseClozeAnswers(response: string): Record<string, string> {
    const value = parse(response);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
    );
}

/** error-correction response: fragment index → typed correction; anything but a plain object is empty. */
export function parseErrorPicks(response: string): Record<string, string> {
    const value = parse(response);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? v : ''])
    );
}

/** sentence-builder response: the placed tile texts in order; anything but an array is empty. */
export function parsePlacedWords(response: string): string[] {
    const value = parse(response);
    return Array.isArray(value) ? value.filter((w): w is string => typeof w === 'string') : [];
}
