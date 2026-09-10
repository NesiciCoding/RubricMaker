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

export interface AnnotatedWord extends OcrWord {
    /** Position in the result's word list, for jump-to-next navigation. */
    index: number;
    /** True when `confidence` is below the threshold — render it highlighted. */
    lowConfidence: boolean;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

/** Coarse band for a summary badge: high ≥ 0.85, medium ≥ threshold, else low. */
export function confidenceBand(confidence: number, threshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD): ConfidenceBand {
    if (confidence >= 0.85) return 'high';
    if (confidence >= threshold) return 'medium';
    return 'low';
}

/** Annotate every recognised word with its index and a low-confidence flag. */
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
