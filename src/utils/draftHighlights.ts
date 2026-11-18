import { draftChanges, splitWords } from './writingAnalysis';

/** Long enough to recognise what a student just wrote, short enough for one row. */
const MAX_SNIPPET_CHARS = 140;

export interface DraftAddition {
    /** Whole words the student added since the previous snapshot. */
    addedWords: number;
    /** The last complete sentence of the addition (or the unfinished tail), trimmed for display. */
    sentence: string;
}

function shorten(text: string): string {
    if (text.length <= MAX_SNIPPET_CHARS) return text;
    const cut = text.slice(0, MAX_SNIPPET_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * What one snapshot added to the last one, in the student's own words. The monitor already
 * receives draft text about once a minute, so this turns that cadence from "stale copy" into
 * "what just happened" without collecting anything new.
 */
export function lastAddedSentence(previous: string, current: string): DraftAddition | null {
    const { added } = draftChanges(previous, current);
    if (added.trim() === '') return null;
    const sentences = added.match(/[^.!?…]+[.!?…]+/g) ?? [];
    const sentence = (sentences.at(-1) ?? added).trim();
    return { addedWords: splitWords(added).length, sentence: shorten(sentence) };
}
