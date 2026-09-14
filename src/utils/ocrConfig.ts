/**
 * Tesseract engine configuration for scan OCR. Tesseract is far more accurate when told
 * the layout (page-segmentation mode) and constrained to the LSTM engine, and when seeded
 * with domain vocabulary (rubric terms, class names) as user words/patterns. These are
 * pure helpers so the config can be unit-tested without loading the WASM engine.
 *
 * The OEM value mirrors Tesseract's stable enum; the page-segmentation mode is expressed
 * as a Tesseract `PSM` enum *key* (resolved to the actual value inside `recognizeImage`,
 * where the engine is loaded). Both are hard-coded here so this module — and its callers'
 * bundles — don't statically import `tesseract.js` (kept lazy).
 */

/** OCR Engine Mode. LSTM-only is the accurate neural engine; legacy is not shipped. */
export const Oem = {
    LSTM_ONLY: 1,
} as const;

/** A Tesseract `PSM` enum key (subset relevant to scanned schoolwork). */
export type PsmMode = 'AUTO' | 'SINGLE_COLUMN' | 'SINGLE_BLOCK' | 'SPARSE_TEXT';

/** What the teacher is scanning, captured as a hint that selects a page-segmentation mode. */
export type CaptureHint = 'auto' | 'single-column' | 'block' | 'sparse';

const CAPTURE_HINT_TO_PSM: Record<CaptureHint, PsmMode> = {
    auto: 'AUTO',
    'single-column': 'SINGLE_COLUMN',
    block: 'SINGLE_BLOCK',
    sparse: 'SPARSE_TEXT',
};

/** Map a capture hint to the Tesseract PSM key `recognizeImage` resolves against the engine. */
export function psmForCaptureHint(hint: CaptureHint = 'auto'): PsmMode {
    return CAPTURE_HINT_TO_PSM[hint] ?? 'AUTO';
}

/**
 * A tesseract `user_words` file is one entry per line. Trim, drop blanks and any token
 * containing whitespace (a word list, not phrases), de-duplicate case-insensitively while
 * keeping the first spelling seen, and join with newlines. Returns '' for no usable words.
 */
export function buildUserWords(words: Iterable<string>): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of words) {
        const word = raw.trim();
        if (!word || /\s/.test(word)) continue;
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(word);
    }
    return out.join('\n');
}

/**
 * A tesseract `user_patterns` file is one pattern per line. Patterns may not contain
 * whitespace; trim, drop blanks, de-duplicate exactly (patterns are case-sensitive), and
 * join with newlines. Returns '' for no usable patterns.
 */
export function buildUserPatterns(patterns: Iterable<string>): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of patterns) {
        const pattern = raw.trim();
        if (!pattern || /\s/.test(pattern)) continue;
        if (seen.has(pattern)) continue;
        seen.add(pattern);
        out.push(pattern);
    }
    return out.join('\n');
}
