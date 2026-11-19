import { splitWords } from './writingAnalysis';

/** Long enough to recognise what a student just wrote, short enough for one row. */
const MAX_SNIPPET_CHARS = 140;

export interface DraftAddition {
    /** Whole words the student added since the previous snapshot. */
    addedWords: number;
    /** The last complete sentence of the addition (or the unfinished tail), trimmed for display. */
    sentence: string;
    /** Where that sentence sits in the current text, so a repeated sentence marks the new copy. */
    start: number;
    end: number;
}

function shorten(text: string): string {
    if (text.length <= MAX_SNIPPET_CHARS) return text;
    const cut = text.slice(0, MAX_SNIPPET_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const WORD = /[\p{L}\p{N}'-]+/gu;
const SENTENCE = /[^.!?…]+[.!?…]*/g;

/**
 * What one snapshot added to the last one, in the student's own words. The monitor already
 * receives draft text about once a minute, so this turns that cadence from "stale copy" into
 * "what just happened" without collecting anything new.
 *
 * Only the words between the shared start and the shared end count as added, so correcting an
 * early word does not make the unchanged rest of the draft read as just written. An empty
 * previous snapshot is a valid baseline; "no earlier snapshot at all" is the caller's `undefined`.
 */
export function lastAddedSentence(previous: string, current: string): DraftAddition | null {
    const before = splitWords(previous).map((word) => word.toLowerCase());
    const after = Array.from(current.matchAll(WORD));
    const same = (beforeIndex: number, afterIndex: number) =>
        before[beforeIndex] === after[afterIndex][0].toLowerCase();

    let prefix = 0;
    while (prefix < before.length && prefix < after.length && same(prefix, prefix)) prefix++;
    let suffix = 0;
    while (
        suffix < before.length - prefix &&
        suffix < after.length - prefix &&
        same(before.length - 1 - suffix, after.length - 1 - suffix)
    ) {
        suffix++;
    }
    const addedWords = after.length - prefix - suffix;
    if (addedWords <= 0) return null;

    const first = after[prefix];
    const last = after[after.length - suffix - 1];
    let end = (last.index ?? 0) + last[0].length;
    // Punctuation right after the last added word closes it ("came.").
    while (end < current.length && /[.,;:!?…]/.test(current[end])) end++;
    const added = current.slice(first.index ?? 0, end);

    // The last non-blank segment, so an unfinished tail ("Nobody") wins over the sentence before it.
    const base = first.index ?? 0;
    const segments = Array.from(added.matchAll(SENTENCE)).filter((match) => match[0].trim() !== '');
    const segment = segments.at(-1);
    const offset = segment ? (segment.index ?? 0) + (segment[0].length - segment[0].trimStart().length) : 0;
    const sentence = segment ? segment[0].trim() : added;
    return { addedWords, sentence: shorten(sentence), start: base + offset, end: base + offset + sentence.length };
}

/**
 * The draft a "just written" comparison should start from: the newest earlier snapshot whose text
 * really differs from the current one. Texts are oldest first and the last one is the current draft;
 * a history merge or a re-sent snapshot can repeat it, and comparing a draft with itself hides the
 * newest addition.
 */
export function previousDistinctDraft(texts: readonly string[]): string | undefined {
    const current = texts.at(-1)?.trim();
    if (current === undefined) return undefined;
    for (let index = texts.length - 2; index >= 0; index--) {
        if (texts[index].trim() !== current) return texts[index];
    }
    return undefined;
}
