/**
 * Review-side helpers for the scan OCR draft. OCR is a first draft, never the final grade
 * input: the teacher edits it before saving. To make correction fast, the review UI
 * highlights the words the engine was least sure about and lets the teacher jump between
 * them. These pure helpers turn an `OcrResult` (from `textExtraction.recognizeImage`) into
 * that per-word annotation without any UI or DOM dependency, so they're unit-testable.
 */

import type { OcrResult, OcrWord } from './textExtraction';

/** Below this mean/word confidence (in [0, 1]) a span is flagged for the teacher to check. */
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Confidence at/above which a word is shown as "high" — never below the low-confidence threshold. */
export const HIGH_CONFIDENCE_BAND = 0.85;

export interface AnnotatedWord extends OcrWord {
    /** Position in the result's word list, for jump-to-next navigation. */
    index: number;
    /** True when `confidence` is below the threshold — render it highlighted. */
    lowConfidence: boolean;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * Coarse band for a summary badge. The "high" cutoff never drops below `threshold`, so a word
 * `annotateWords` flags low-confidence can never also read "high" when a caller raises the
 * threshold above the default high band.
 */
export function confidenceBand(confidence: number, threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD): ConfidenceBand {
    if (confidence >= Math.max(HIGH_CONFIDENCE_BAND, threshold)) return 'high';
    if (confidence >= threshold) return 'medium';
    return 'low';
}

export function annotateWords(result: OcrResult, threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD): AnnotatedWord[] {
    return result.words.map((word, index) => ({
        ...word,
        index,
        lowConfidence: word.confidence < threshold,
    }));
}

/** The words the teacher should check first, in reading order (for highlight + jump-to). */
export function lowConfidenceWords(result: OcrResult, threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD): AnnotatedWord[] {
    return annotateWords(result, threshold).filter((w) => w.lowConfidence);
}

/** Whether any word is below the threshold — gates the "review low-confidence" affordance. */
export function hasLowConfidence(result: OcrResult, threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD): boolean {
    return result.words.some((w) => w.confidence < threshold);
}
