import { CEFR_WORD_LEVELS } from '../data/cefrLevels';
import { academicCounts } from './academicWordList';
import type { CefrLevel, CefrVocabProfile, CefrWordHit, PersistedVocabProfile } from '../types';

const HIGHLIGHT_CAP = 30;

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
 * Convert input text into a cleaned list of lowercase content-word tokens.
 *
 * Normalizes smart quotes and em/en dashes, splits on any characters that are
 * not letters, apostrophes, or hyphens, strips leading/trailing apostrophes and
 * a trailing possessive, and drops short tokens and common function words. The
 * CEFR index is pre-expanded to inflected surface forms, so tokens are matched
 * exactly (lowercased) with no lemmatization.
 */
export function tokeniseContent(text: string): string[] {
    return text
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, ' ')
        .split(/[^a-zA-Z'-]+/)
        .map((w) =>
            w
                .toLowerCase()
                .replace(/^'+|'+$/g, '')
                .replace(/'s$/, '')
        )
        .filter((w) => w.length > 2 && !SKIP_WORDS.has(w));
}

export interface TextScan {
    /** Content tokens (function words and short tokens removed) */
    tokens: string[];
    /** Matched-word occurrences bucketed by CEFR level */
    levelCounts: Record<CefrLevel, number>;
    /** Distinct in-index content words mapped to their CEFR level */
    wordLevels: Map<string, CefrLevel>;
    /** Content tokens not found in the CEFR index */
    offListCount: number;
}

/**
 * Single-pass tokenise + CEFR-index lookup. Shared by {@link profileText} and
 * the target-level verdict so both apply identical tokenisation and matching.
 */
export function scanText(text: string): TextScan {
    const levelCounts: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    const tokens = tokeniseContent(text);
    const wordLevels = new Map<string, CefrLevel>();
    let offListCount = 0;

    for (const token of tokens) {
        const level = CEFR_WORD_LEVELS.get(token);
        if (!level) {
            offListCount++;
            continue;
        }
        levelCounts[level]++;
        /* v8 ignore next -- a token maps to a single index level, so set-if-absent is enough */
        if (!wordLevels.has(token)) wordLevels.set(token, level);
    }

    return { tokens, levelCounts, wordLevels, offListCount };
}

/**
 * Estimate the CEFR level for a matched-word distribution: the highest level
 * whose matched count is at least `max(2, 5% of matched words)`.
 *
 * The absolute floor of 2 keeps a single outlier word (e.g. a common word a
 * frequency-derived list happens to band high) from setting the level of a
 * short text — "the cat sat on the mat" stays A1 even though `mat` is C1.
 * Defaults to `A1` when there are too few matches.
 */
export function estimateLevelFromCounts(levelCounts: Record<CefrLevel, number>): CefrLevel {
    const matched = LEVEL_ORDER.reduce((sum, level) => sum + levelCounts[level], 0);
    if (matched === 0) return 'A1';
    const minCount = Math.max(2, matched * 0.05);
    for (const level of [...LEVEL_ORDER].reverse()) {
        if (levelCounts[level] >= minCount) return level;
    }
    return 'A1';
}

/**
 * Notable words at or above the estimated level (excluding A1), highest level
 * first, capped. Shared by the persisted-profile builder.
 */
function highlightsFromWordLevels(wordLevels: Map<string, CefrLevel>, estimatedLevel: CefrLevel): CefrWordHit[] {
    const estimatedIdx = LEVEL_ORDER.indexOf(estimatedLevel);
    return [...wordLevels.entries()]
        .filter(([, level]) => LEVEL_ORDER.indexOf(level) >= estimatedIdx && level !== 'A1')
        .sort(([, a], [, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))
        .slice(0, HIGHLIGHT_CAP)
        .map(([word, level]) => ({ word, level }));
}

/**
 * Build the persistable vocabulary distribution for a text: raw, additive
 * counts (level counts, off-list, academic) plus capped highlight and academic
 * word lists. Stored on a DocumentAnalysisResult so the dashboard, CSV export
 * and re-opened panel read it back instead of re-profiling.
 */
export function buildPersistedVocabProfile(text: string): PersistedVocabProfile {
    const { tokens, levelCounts, wordLevels, offListCount } = scanText(text);
    const estimatedLevel = estimateLevelFromCounts(levelCounts);
    const { awl, nawl, academicWords } = academicCounts(tokens);
    return {
        levelCounts,
        contentTokenCount: tokens.length,
        offListCount,
        awlCount: awl,
        nawlCount: nawl,
        highlightWords: highlightsFromWordLevels(wordLevels, estimatedLevel),
        academicWords,
    };
}

/**
 * Present a {@link PersistedVocabProfile} as a {@link CefrVocabProfile} (deriving
 * the estimated level and off-list/academic percentages), so a stored profile
 * renders identically to a freshly computed one.
 */
export function vocabProfileView(profile: PersistedVocabProfile): CefrVocabProfile {
    const { levelCounts, contentTokenCount, offListCount, awlCount, nawlCount, highlightWords, academicWords } =
        profile;
    const pct = (n: number) => (contentTokenCount > 0 ? (n / contentTokenCount) * 100 : 0);
    return {
        levelCounts,
        highlightWords,
        estimatedLevel: estimateLevelFromCounts(levelCounts),
        offListPercent: pct(offListCount),
        academic: { awlPercent: pct(awlCount), nawlPercent: pct(nawlCount), academicWords },
    };
}

/**
 * Profile CEFR vocabulary in the provided text: level distribution, estimated
 * level, notable words, off-list share, and Academic Word List coverage. A thin
 * view over {@link buildPersistedVocabProfile}.
 */
export function profileText(text: string): CefrVocabProfile {
    return vocabProfileView(buildPersistedVocabProfile(text));
}
