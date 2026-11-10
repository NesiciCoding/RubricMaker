import { describe, it, expect } from 'vitest';
import { placementConfidence } from './placementConfidence';
import { MAX_QUESTIONS } from './placementStaircase';

const steps = (flags: boolean[]) => flags.map((correct, i) => ({ correct, questionId: `q${i}` }));

describe('placementConfidence', () => {
    it('reports nothing before the first answer', () => {
        expect(placementConfidence([])).toBeNull();
    });

    it('stays low while the run is still moving in one direction', () => {
        // Two correct answers step up once; nothing has pushed the run back down yet.
        expect(placementConfidence(steps([true, true]))).toBe('low');
        expect(placementConfidence(steps([false, false]))).toBe('low');
    });

    it('treats one reversal as a bracket, not a settled level', () => {
        expect(placementConfidence(steps([true, true, false]))).toBe('medium');
    });

    it('reports high once the staircase converges on two reversals', () => {
        expect(placementConfidence(steps([true, true, false, true, true]))).toBe('high');
    });

    it('reports high when a run is capped at the question limit', () => {
        expect(placementConfidence(steps(Array.from({ length: MAX_QUESTIONS }, () => true)))).toBe('high');
    });

    it('applies the generator run config when one is given', () => {
        // Clamped at B1: the same moves reverse once inside a one-level range.
        const config = { minLevel: 'B1' as const, maxLevel: 'B1' as const, startLevel: 'B1' as const };
        expect(placementConfidence(steps([true, true, false, true, true]), config)).toBe('low');
    });
});
