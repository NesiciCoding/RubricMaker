import { CEFRJ_VOCABULARY } from '../data/cefrjVocabulary';
import type { CefrLevel, CefrVocabProfile, CefrWordHit } from '../types';

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const SKIP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'am',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'do',
    'does',
    'did',
    'have',
    'has',
    'had',
    'will',
    'would',
    'shall',
    'should',
    'may',
    'might',
    'can',
    'could',
    'must',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'as',
    'and',
    'but',
    'or',
    'nor',
    'so',
    'yet',
    'if',
    'not',
    'no',
    'my',
    'your',
    'his',
    'her',
    'its',
    'our',
    'their',
    'i',
    'me',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'this',
    'that',
    'these',
    'those',
    'which',
    'who',
    'what',
    'how',
    'when',
    'where',
    'why',
    'all',
    'more',
    'very',
    'just',
    'up',
    'out',
    'about',
    'then',
    'than',
    'into',
    'from',
    'also',
]);

/**
 * Produce candidate root forms of a word for vocabulary lookup.
 *
 * Returns an array of candidate root-like forms derived from `word`. The first
 * element is the cleaned, lowercased form (with apostrophes normalized and a
 * trailing possessive removed); subsequent elements are heuristic stem variants
 * (e.g., common `-ing`, `-ed`, `-s`/`-es`, and `-ly` reductions) intended for
 * dictionary lookup and matching.
 *
 * @returns An array of candidate word forms, ordered with the primary normalized form first.
 */
function normalise(word: string): string[] {
    const w = word.toLowerCase().replace(/[‘’]/g, "'").replace(/'s$/, '');
    const candidates: string[] = [w];
    if (w.endsWith('ing') && w.length > 5) {
        candidates.push(w.slice(0, -3));
        candidates.push(w.slice(0, -3) + 'e');
    }
    if (w.endsWith('ed') && w.length > 4) {
        candidates.push(w.slice(0, -2));
        candidates.push(w.slice(0, -1));
    }
    if (w.endsWith('es') && w.length > 4) candidates.push(w.slice(0, -2));
    if (w.endsWith('s') && w.length > 3) candidates.push(w.slice(0, -1));
    if (w.endsWith('ly') && w.length > 4) candidates.push(w.slice(0, -2));
    return candidates;
}

/**
 * Finds the CEFR level for a given word by checking candidate normalized forms.
 *
 * @param word - The input token to look up
 * @returns The CEFR level corresponding to the first matching form, or `null` if no match is found
 */
function lookupLevel(word: string): CefrLevel | null {
    for (const form of normalise(word)) {
        const level = CEFRJ_VOCABULARY[form];
        if (level) return level as CefrLevel;
    }
    return null;
}

/**
 * Convert input text into a cleaned list of lowercase word tokens.
 *
 * Normalizes em/en dashes to spaces, splits on any characters that are not letters, apostrophes, or hyphens, trims leading and trailing apostrophes from each token, and filters out short tokens and common skip words.
 *
 * @param text - The input string to tokenize
 * @returns An array of cleaned lowercase word tokens (length > 2) with common skip words removed
 */
function tokenise(text: string): string[] {
    return text
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, ' ')
        .split(/[^a-zA-Z'-]+/)
        .map((w) => w.toLowerCase().replace(/^'+|'+$/g, ''))
        .filter((w) => w.length > 2 && !SKIP_WORDS.has(w));
}

/**
 * Profile CEFR vocabulary in the provided text and produce counts, an estimated level, and highlight words.
 *
 * @param text - The input text to analyze.
 * @returns An object containing:
 *  - `levelCounts`: a record mapping each CEFR level (`A1`..`C2`) to the number of matched content-word occurrences,
 *  - `estimatedLevel`: the highest CEFR level whose matched-word share is at least 5% of all matches (defaults to `A1` if there are no matches),
 *  - `highlightWords`: up to 30 unique words observed at or above the estimated level (excluding `A1`), sorted from higher to lower CEFR level; each entry is `{ word, level }`.
 */
export function profileText(text: string): CefrVocabProfile {
    const levelCounts: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    const tokens = tokenise(text);

    const seenWords = new Map<string, CefrLevel>();
    const highlightCandidates = new Map<string, CefrLevel>();

    for (const token of tokens) {
        const level = lookupLevel(token);
        if (!level) continue;
        levelCounts[level]++;
        const existing = seenWords.get(token);
        if (!existing || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(existing)) {
            seenWords.set(token, level);
        }
    }

    const total = Object.values(levelCounts).reduce((s, c) => s + c, 0);

    let estimatedLevel: CefrLevel = 'A1';
    if (total > 0) {
        for (const level of [...LEVEL_ORDER].reverse()) {
            if (levelCounts[level] / total >= 0.05) {
                estimatedLevel = level;
                break;
            }
        }
    }

    const estimatedIdx = LEVEL_ORDER.indexOf(estimatedLevel);
    for (const [word, level] of seenWords) {
        if (LEVEL_ORDER.indexOf(level) >= estimatedIdx && level !== 'A1') {
            highlightCandidates.set(word, level);
        }
    }

    const highlightWords: CefrWordHit[] = [...highlightCandidates.entries()]
        .sort(([, a], [, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))
        .slice(0, 30)
        .map(([word, level]) => ({ word, level }));

    return { levelCounts, highlightWords, estimatedLevel };
}
