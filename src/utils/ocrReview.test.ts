import { describe, it, expect } from 'vitest';
import type { OcrResult } from './textExtraction';
import {
    confidenceBand,
    annotateWords,
    lowConfidenceWords,
    hasLowConfidence,
    DEFAULT_LOW_CONFIDENCE_THRESHOLD,
} from './ocrReview';

function result(words: { text: string; confidence: number }[]): OcrResult {
    const confidence = words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0;
    return { text: words.map((w) => w.text).join(' '), confidence, words };
}

describe('confidenceBand', () => {
    it('bands high / medium / low around 0.85 and the threshold', () => {
        expect(confidenceBand(0.9)).toBe('high');
        expect(confidenceBand(0.85)).toBe('high');
        expect(confidenceBand(0.7)).toBe('medium');
        expect(confidenceBand(DEFAULT_LOW_CONFIDENCE_THRESHOLD)).toBe('medium');
        expect(confidenceBand(0.59)).toBe('low');
    });
});

describe('annotateWords', () => {
    it('adds an index and low-confidence flag, preserving word fields', () => {
        const annotated = annotateWords(
            result([
                { text: 'clear', confidence: 0.95 },
                { text: 'fuzzy', confidence: 0.4 },
            ])
        );
        expect(annotated).toHaveLength(2);
        expect(annotated[0]).toMatchObject({ text: 'clear', index: 0, lowConfidence: false });
        expect(annotated[1]).toMatchObject({ text: 'fuzzy', index: 1, lowConfidence: true });
    });

    it('treats the threshold as exclusive (a word exactly at the threshold is not low)', () => {
        const [word] = annotateWords(result([{ text: 'edge', confidence: DEFAULT_LOW_CONFIDENCE_THRESHOLD }]));
        expect(word.lowConfidence).toBe(false);
    });

    it('honours a custom threshold', () => {
        const [word] = annotateWords(result([{ text: 'x', confidence: 0.8 }]), 0.9);
        expect(word.lowConfidence).toBe(true);
    });
});

describe('lowConfidenceWords / hasLowConfidence', () => {
    const r = result([
        { text: 'a', confidence: 0.9 },
        { text: 'b', confidence: 0.3 },
        { text: 'c', confidence: 0.5 },
    ]);

    it('returns only the sub-threshold words, in reading order with their indices', () => {
        const low = lowConfidenceWords(r);
        expect(low.map((w) => w.text)).toEqual(['b', 'c']);
        expect(low.map((w) => w.index)).toEqual([1, 2]);
    });

    it('reports whether any word is low-confidence', () => {
        expect(hasLowConfidence(r)).toBe(true);
        expect(hasLowConfidence(result([{ text: 'ok', confidence: 0.99 }]))).toBe(false);
    });
});
