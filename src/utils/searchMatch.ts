const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Letters NFKD leaves alone because they are single code points, not a base plus a mark. Without
 * them "Soren" would never find "Søren", one of the names the queue search has to handle.
 */
const FOLDED_LETTERS: Record<string, string> = {
    ø: 'o',
    æ: 'ae',
    œ: 'oe',
    ß: 'ss',
    đ: 'd',
    ð: 'd',
    þ: 'th',
    ł: 'l',
};

/**
 * Canonical form for comparing searchable text: NFKD, combining marks dropped, the letters above
 * folded to ASCII, lower-cased. "José", "JOSÉ" and "Jose" all become "jose".
 */
export function normaliseForSearch(text: string): string {
    return text
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
        .replace(/[øæœßđðþł]/g, (letter) => FOLDED_LETTERS[letter] ?? letter);
}

/**
 * Whether `query` matches any of `fields` once case, accents and word order are set aside: every
 * query token must occur somewhere in the fields taken together, so "Okafor Amara" finds "Amara
 * Okafor" and a token may come from a second field. An empty or whitespace-only query matches
 * everything, which is what lets a cleared search box restore the full roster.
 */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
    const tokens = normaliseForSearch(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const haystack = normaliseForSearch(fields.filter(Boolean).join(' '));
    return tokens.every((token) => haystack.includes(token));
}
