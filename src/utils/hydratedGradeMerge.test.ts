import { describe, it, expect } from 'vitest';
import { mergeEditsOntoSavedGrade } from './hydratedGradeMerge';
import type { ScoreEntry, StudentRubric } from '../types';

const blank = (criterionId: string): ScoreEntry => ({
    criterionId,
    levelId: null,
    comment: '',
    checkedSubItems: [],
    selectedPoints: undefined,
});

const seed: StudentRubric = {
    id: 'tmp',
    rubricId: 'r1',
    studentId: 's1',
    entries: [blank('c1'), blank('c2')],
    overallComment: '',
    isPeerReview: false,
};

const saved: StudentRubric = {
    id: 'real',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { ...blank('c1'), levelId: 'l2', comment: 'Saved c1' },
        { ...blank('c2'), levelId: 'l3', comment: 'Saved c2' },
    ],
    overallComment: 'Saved feedback',
    isPeerReview: false,
    globalModifier: { type: 'points', value: 2, reason: 'Bonus' },
    gradedAt: '2026-01-01T00:00:00Z',
};

describe('mergeEditsOntoSavedGrade', () => {
    it('keeps saved entries and fields the teacher did not touch', () => {
        const local = { ...seed, entries: [{ ...seed.entries[0], levelId: 'l1' }, seed.entries[1]] };
        const merged = mergeEditsOntoSavedGrade(seed, local, saved);
        expect(merged.id).toBe('real');
        expect(merged.entries).toEqual([{ ...blank('c1'), levelId: 'l1' }, saved.entries[1]]);
        expect(merged.overallComment).toBe('Saved feedback');
        expect(merged.globalModifier).toEqual(saved.globalModifier);
        expect(merged.gradedAt).toBe(saved.gradedAt);
    });

    it('applies edited top-level fields over the saved record', () => {
        const local = {
            ...seed,
            overallComment: 'New feedback',
            globalModifier: { type: 'percentage' as const, value: -5, reason: 'Late' },
        };
        const merged = mergeEditsOntoSavedGrade(seed, local, saved);
        expect(merged.overallComment).toBe('New feedback');
        expect(merged.globalModifier).toEqual({ type: 'percentage', value: -5, reason: 'Late' });
        expect(merged.entries).toEqual(saved.entries);
    });

    it('keeps an edited entry for a criterion the saved record lacks', () => {
        const local = { ...seed, entries: [seed.entries[0], { ...seed.entries[1], levelId: 'l1' }] };
        const merged = mergeEditsOntoSavedGrade(seed, local, { ...saved, entries: [saved.entries[0]] });
        expect(merged.entries).toEqual([saved.entries[0], { ...blank('c2'), levelId: 'l1' }]);
    });
});
