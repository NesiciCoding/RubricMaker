import { describe, it, expect } from 'vitest';
import { computeTargetVerdict, computeTargetVerdictFromCounts, coverageFromCounts } from './textLevelVerdict';
import type { CefrLevel } from '../types';

// Verified index levels: cat A1, abandon B1, analysis B1, phenomenon B1, paradigm C1.
const MIXED = 'cat abandon analysis phenomenon paradigm';

describe('computeTargetVerdict', () => {
    it('reports full coverage and a suitable verdict when nothing exceeds the target', () => {
        const result = computeTargetVerdict(MIXED, 'C1');
        expect(result.targetLevel).toBe('C1');
        expect(result.coveragePercent).toBe(100);
        expect(result.aboveTargetWords).toEqual([]);
        expect(result.verdict).toBe('suitable');
    });

    it('flags a slightly-above verdict for a small above-target minority', () => {
        // 4 of 5 recognised words are at/below B1 → 80% coverage
        const result = computeTargetVerdict(MIXED, 'B1');
        expect(result.coveragePercent).toBeCloseTo(80, 5);
        expect(result.verdict).toBe('slightly_above');
        expect(result.aboveTargetWords).toEqual([{ word: 'paradigm', level: 'C1' }]);
    });

    it('flags too_hard and lists above-target words ranked by level then word', () => {
        const result = computeTargetVerdict(MIXED, 'A1');
        // only "cat" (A1) is at/below target → 20% coverage
        expect(result.coveragePercent).toBeCloseTo(20, 5);
        expect(result.verdict).toBe('too_hard');
        expect(result.aboveTargetWords).toEqual([
            { word: 'paradigm', level: 'C1' },
            { word: 'abandon', level: 'B1' },
            { word: 'analysis', level: 'B1' },
            { word: 'phenomenon', level: 'B1' },
        ]);
    });

    it('treats empty text as vacuously suitable', () => {
        const result = computeTargetVerdict('', 'A2');
        expect(result.coveragePercent).toBe(100);
        expect(result.aboveTargetWords).toEqual([]);
        expect(result.verdict).toBe('suitable');
    });

    it('caps above-target words at 40', () => {
        // Repeating distinct high-level words is hard to guarantee, so assert the
        // cap holds on a large recognised C-level input against an A1 target.
        const bigText = computeTargetVerdict(MIXED.repeat(50), 'A1');
        expect(bigText.aboveTargetWords.length).toBeLessThanOrEqual(40);
    });
});

describe('computeTargetVerdictFromCounts', () => {
    const counts = (o: Partial<Record<CefrLevel, number>>): Record<CefrLevel, number> => ({
        A1: 0,
        A2: 0,
        B1: 0,
        B2: 0,
        C1: 0,
        C2: 0,
        ...o,
    });

    it('coverageFromCounts is the share at or below the target', () => {
        expect(coverageFromCounts(counts({ A1: 3, B2: 1 }), 'B1')).toBeCloseTo(75, 5);
        expect(coverageFromCounts(counts({ A1: 4 }), 'A1')).toBe(100);
    });

    it('treats an empty distribution as full coverage', () => {
        const v = computeTargetVerdictFromCounts(counts({}), 'B1');
        expect(v.coveragePercent).toBe(100);
        expect(v.verdict).toBe('suitable');
    });

    it('grades a pooled distribution without a word list', () => {
        // 2 of 5 recognised words above B1 → 60% coverage → too_hard
        const v = computeTargetVerdictFromCounts(counts({ A1: 2, B1: 1, C1: 2 }), 'B1');
        expect(v.coveragePercent).toBeCloseTo(60, 5);
        expect(v.verdict).toBe('too_hard');
        expect(v).not.toHaveProperty('aboveTargetWords');
    });

    it('agrees with the text-based verdict on coverage and label', () => {
        const text = 'cat abandon analysis phenomenon paradigm';
        const fromText = computeTargetVerdict(text, 'B1');
        const fromCounts = computeTargetVerdictFromCounts(
            counts({ A1: 1, B1: 3, C1: 1 }), // cat A1; abandon/analysis/phenomenon B1; paradigm C1
            'B1'
        );
        expect(fromCounts.coveragePercent).toBeCloseTo(fromText.coveragePercent, 5);
        expect(fromCounts.verdict).toBe(fromText.verdict);
    });
});
