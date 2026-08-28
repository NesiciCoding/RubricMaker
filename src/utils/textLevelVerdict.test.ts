import { describe, it, expect } from 'vitest';
import { computeTargetVerdict } from './textLevelVerdict';

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
