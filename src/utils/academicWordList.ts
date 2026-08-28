import { AWL_WORDS, NAWL_WORDS } from '../data/academicWordLists';
import type { AcademicCoverage } from '../types';

const AWL_SET = new Set(AWL_WORDS);
const NAWL_SET = new Set(NAWL_WORDS);

const ACADEMIC_WORDS_CAP = 40;

/**
 * Classify a lowercased surface form against the academic word lists.
 * AWL takes precedence when a word appears on both.
 */
export function classifyAcademic(word: string): 'awl' | 'nawl' | null {
    if (AWL_SET.has(word)) return 'awl';
    if (NAWL_SET.has(word)) return 'nawl';
    return null;
}

/**
 * Compute Academic Word List coverage over a list of content tokens.
 *
 * @param tokens - lowercased content tokens (function words already removed)
 * @returns AWL/NAWL share of the tokens plus a capped list of distinct
 *   academic words observed (for display and flashcard-deck seeding).
 */
export function academicCoverage(tokens: string[]): AcademicCoverage {
    if (tokens.length === 0) return { awlPercent: 0, nawlPercent: 0, academicWords: [] };

    let awl = 0;
    let nawl = 0;
    const seen = new Set<string>();
    const academicWords: string[] = [];

    for (const token of tokens) {
        const cls = classifyAcademic(token);
        if (!cls) continue;
        if (cls === 'awl') awl++;
        else nawl++;
        if (!seen.has(token)) {
            seen.add(token);
            if (academicWords.length < ACADEMIC_WORDS_CAP) academicWords.push(token);
        }
    }

    const pct = (n: number) => (n / tokens.length) * 100;
    return { awlPercent: pct(awl), nawlPercent: pct(nawl), academicWords };
}
