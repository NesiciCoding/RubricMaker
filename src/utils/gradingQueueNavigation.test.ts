import { describe, expect, it } from 'vitest';
import { findNextUndecided } from './gradingQueueNavigation';

describe('findNextUndecided', () => {
    it('returns the next undecided index', () => {
        expect(findNextUndecided([true, false, false], 0)).toBe(1);
        expect(findNextUndecided([false, true, false], 0)).toBe(2);
    });

    it('skips decided answers and stops at the first undecided one', () => {
        expect(findNextUndecided([true, true, false, false], 0)).toBe(2);
    });

    it('returns -1 when everything after the current answer is decided', () => {
        expect(findNextUndecided([true, true, true], 0)).toBe(-1);
        expect(findNextUndecided([false], 0)).toBe(-1);
        expect(findNextUndecided([], 0)).toBe(-1);
    });
});
