/**
 * Draft-text measurements for the essay live monitor. Everything here works on the plain
 * text extracted from a snapshot, so a teacher needs no extra student-side work to see it.
 */

const WORD_RE = /[\p{L}\p{N}'-]+/gu;
const SENTENCE_RE = /[^.!?…]+[.!?…]*/g;

/** Common discourse markers, checked case-insensitively as whole phrases. */
const LINKING_WORDS = [
    'however',
    'therefore',
    'moreover',
    'furthermore',
    'in addition',
    'for example',
    'for instance',
    'on the other hand',
    'in conclusion',
    'firstly',
    'secondly',
    'finally',
    'although',
    'because',
    'but',
];

export interface RepeatedWord {
    word: string;
    count: number;
}

export interface DraftStats {
    words: number;
    sentences: number;
    paragraphs: number;
    /** Mean words per sentence, one decimal; 0 when there are no sentences yet. */
    avgSentenceWords: number;
    longestSentenceWords: number;
    /** Unique words ÷ total words, as a 0..1 ratio. */
    vocabularyVariety: number;
    /** Words of four letters or more used at least four times, most frequent first. */
    repeatedWords: RepeatedWord[];
    /** Which of the common linking words appear in the draft. */
    linkingWords: string[];
}

export function splitWords(text: string): string[] {
    return text.match(WORD_RE) ?? [];
}

export const EMPTY_DRAFT_STATS: DraftStats = {
    words: 0,
    sentences: 0,
    paragraphs: 0,
    avgSentenceWords: 0,
    longestSentenceWords: 0,
    vocabularyVariety: 0,
    repeatedWords: [],
    linkingWords: [],
};

export function analyzeDraft(text: string): DraftStats {
    const trimmed = text.trim();
    if (trimmed === '') return EMPTY_DRAFT_STATS;

    const words = splitWords(trimmed);
    const sentences = (trimmed.match(SENTENCE_RE) ?? []).map((s) => splitWords(s).length).filter((count) => count > 0);
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim() !== '').length;

    const counts = new Map<string, number>();
    for (const word of words) {
        const key = word.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const repeatedWords = Array.from(counts.entries())
        .filter(([word, count]) => word.length >= 4 && count >= 4)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([word, count]) => ({ word, count }));

    const lower = ` ${trimmed.toLowerCase().replace(/\s+/g, ' ')} `;
    const linkingWords = LINKING_WORDS.filter((phrase) => lower.includes(` ${phrase} `));

    const longestSentenceWords = sentences.length ? Math.max(...sentences) : 0;
    const totalSentenceWords = sentences.reduce((sum, count) => sum + count, 0);

    return {
        words: words.length,
        sentences: sentences.length,
        paragraphs: Math.max(paragraphs, 1),
        avgSentenceWords: sentences.length > 0 ? Math.round((totalSentenceWords / sentences.length) * 10) / 10 : 0,
        longestSentenceWords,
        vocabularyVariety: words.length > 0 ? counts.size / words.length : 0,
        repeatedWords,
        linkingWords,
    };
}

export interface DraftChanges {
    /** The start of the draft that was already in the previous snapshot. */
    kept: string;
    /** Everything after it — the part the student wrote since that snapshot. */
    added: string;
}

/**
 * Splits the current draft after the words it shares with the previous snapshot, so the tail
 * the student just wrote can be highlighted. Word-aligned rather than character-aligned: a
 * mid-word edit still marks whole words instead of a few letters.
 */
export function draftChanges(previous: string, current: string): DraftChanges {
    const previousWords = splitWords(previous);
    const currentWords = Array.from(current.matchAll(WORD_RE));
    if (previousWords.length === 0 || currentWords.length === 0) {
        return { kept: '', added: current.trimStart() };
    }
    let shared = 0;
    while (
        shared < previousWords.length &&
        shared < currentWords.length &&
        previousWords[shared].toLowerCase() === currentWords[shared][0].toLowerCase()
    ) {
        shared++;
    }
    if (shared === 0) return { kept: '', added: current.trimStart() };
    const lastShared = currentWords[shared - 1];
    let cutAt = (lastShared.index ?? 0) + lastShared[0].length;
    // Punctuation right after the last shared word closes that word ("activities."), so it belongs
    // with the kept text — otherwise the highlight starts with a stray "." and the preview reads
    // "activities .This".
    while (cutAt < current.length && /[.,;:!?…]/.test(current[cutAt])) cutAt++;
    return { kept: current.slice(0, cutAt), added: current.slice(cutAt).trimStart() };
}
