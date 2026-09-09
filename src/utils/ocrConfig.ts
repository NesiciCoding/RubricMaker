/**
 * Tesseract engine configuration for scan OCR. Tesseract is far more accurate when told
 * the layout (page-segmentation mode) and constrained to the LSTM engine, and when seeded
 * with domain vocabulary (rubric terms, class names) as user words/patterns. These are
 * pure helpers so the config can be unit-tested without loading the WASM engine.
 *
 * The numeric OEM/PSM values mirror Tesseract's own stable enums, hard-coded here so this
 * module — and its callers' bundles — don't statically import `tesseract.js` (kept lazy).
 */

/** OCR Engine Mode. LSTM-only is the accurate neural engine; legacy is not shipped. */
export const Oem = {
    LSTM_ONLY: 1,
} as const;

/** Page Segmentation Mode (subset relevant to scanned schoolwork). */
export const Psm = {
    AUTO: 3,
    SINGLE_COLUMN: 4,
    SINGLE_BLOCK: 6,
    SPARSE_TEXT: 11,
} as const;

/** What the teacher is scanning, captured as a hint that selects a PSM. */
export type CaptureHint = 'auto' | 'single-column' | 'block' | 'sparse';

const CAPTURE_HINT_TO_PSM: Record<CaptureHint, number> = {
    auto: Psm.AUTO,
    'single-column': Psm.SINGLE_COLUMN,
    block: Psm.SINGLE_BLOCK,
    sparse: Psm.SPARSE_TEXT,
};

export function psmForCaptureHint(hint: CaptureHint = 'auto'): number {
    return CAPTURE_HINT_TO_PSM[hint] ?? Psm.AUTO;
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
