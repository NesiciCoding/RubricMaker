import { describe, it, expect } from 'vitest';
import { seededShuffle } from './seededShuffle';

describe('seededShuffle', () => {
    it('returns an array with the same length', () => {
        expect(seededShuffle([1, 2, 3, 4], 'seed1')).toHaveLength(4);
    });

    it('contains all original elements', () => {
        const result = seededShuffle([1, 2, 3, 4, 5], 'abc');
        expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('is deterministic for the same seed', () => {
        const a = seededShuffle([1, 2, 3, 4, 5], 'hello');
        const b = seededShuffle([1, 2, 3, 4, 5], 'hello');
        expect(a).toEqual(b);
    });

    it('produces different order for different seeds', () => {
        const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed-a');
        const b = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed-b');
        expect(a).not.toEqual(b);
    });

    it('handles empty array', () => {
        expect(seededShuffle([], 'seed')).toEqual([]);
    });

    it('handles single-element array', () => {
        expect(seededShuffle(['only'], 'x')).toEqual(['only']);
    });
});
