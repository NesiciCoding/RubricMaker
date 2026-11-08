const LIST_MARKER = /^(?:(?:[A-Za-z]|\d{1,2})[.)]|[-*•–])\s+/;

/** Lines of a pasted list ("A. went\nB. goes" from a worksheet), markers and blank lines removed. */
export function splitPastedList(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim().replace(LIST_MARKER, '').trim())
        .filter(Boolean);
}

/**
 * Spreads pasted lines over a list of text entries, starting at `index`: an empty entry at or after
 * it is filled before a new one is inserted, so pasting four answers over the two blank default
 * options yields four options rather than four plus two blanks. A non-empty entry at `index` is kept.
 */
export function spreadPastedLines<T extends { text: string }>(
    items: T[],
    index: number,
    lines: string[],
    create: (text: string) => T
): T[] {
    const next = [...items];
    let pos = next[index]?.text.trim() ? index + 1 : index;
    for (const line of lines) {
        if (pos < next.length && !next[pos].text.trim()) next[pos] = { ...next[pos], text: line };
        else next.splice(pos, 0, create(line));
        pos++;
    }
    return next;
}
