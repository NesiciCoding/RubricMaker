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

const PAIR_SEPARATORS = ['\t', ' – ', ' — ', ' - ', ' = ', ': '];

/** "word – definition" (or a tab from a spreadsheet, " = ", ": ") → left and right; no separator → left only. */
export function splitPastedPair(line: string): { left: string; right: string } {
    for (const separator of PAIR_SEPARATORS) {
        const at = line.indexOf(separator);
        if (at > 0) return { left: line.slice(0, at).trim(), right: line.slice(at + separator.length).trim() };
    }
    return { left: line.trim(), right: '' };
}

/** Like spreadPastedLines for matching pairs: blank pairs are filled first and a filled pair at `index` is kept. */
export function spreadPastedPairs<T extends { left: string; right: string }>(
    pairs: T[],
    index: number,
    lines: string[],
    create: (left: string, right: string) => T
): T[] {
    const blank = (pair: T) => !pair.left.trim() && !pair.right.trim();
    const next = [...pairs];
    let pos = next[index] && !blank(next[index]) ? index + 1 : index;
    for (const line of lines) {
        const { left, right } = splitPastedPair(line);
        if (pos < next.length && blank(next[pos])) next[pos] = { ...next[pos], left, right };
        else next.splice(pos, 0, create(left, right));
        pos++;
    }
    return next;
}
