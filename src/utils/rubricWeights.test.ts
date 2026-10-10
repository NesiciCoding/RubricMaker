import { describe, it, expect } from 'vitest';
import { distributeWeights, hasEvenWeights, remainingWeight } from './rubricWeights';

const w = (...weights: number[]) => weights.map((weight) => ({ weight }));

describe('distributeWeights', () => {
    it.each([1, 2, 3, 6, 7, 12])('splits %i criteria into whole weights totalling 100', (n) => {
        const result = distributeWeights(w(...Array(n).fill(0)));
        expect(result.reduce((s, c) => s + c.weight, 0)).toBe(100);
        expect(hasEvenWeights(result)).toBe(true);
    });

    it('keeps the other criterion fields', () => {
        expect(distributeWeights([{ id: 'a', weight: 5 }])).toEqual([{ id: 'a', weight: 100 }]);
    });

    it('returns an empty list unchanged', () => {
        const empty: { weight: number }[] = [];
        expect(distributeWeights(empty)).toBe(empty);
    });
});

describe('hasEvenWeights', () => {
    it('accepts an empty rubric and an even split', () => {
        expect(hasEvenWeights([])).toBe(true);
        expect(hasEvenWeights(w(34, 33, 33))).toBe(true);
    });

    it('rejects a split that does not total 100 or was tuned by hand', () => {
        expect(hasEvenWeights(w(25, 25, 25))).toBe(false);
        expect(hasEvenWeights(w(60, 40))).toBe(false);
        expect(hasEvenWeights(w(50.5, 49.5))).toBe(false);
    });

    it('treats a missing weight as 0', () => {
        expect(hasEvenWeights([{ weight: 100 }, { weight: undefined as unknown as number }])).toBe(false);
    });
});

describe('remainingWeight', () => {
    it('returns what is left to reach 100, never below 0', () => {
        expect(remainingWeight(w(60, 30))).toBe(10);
        expect(remainingWeight(w(80, 40))).toBe(0);
        expect(remainingWeight([])).toBe(100);
    });
});
