import { describe, expect, it } from 'vitest';
import {
    carryTeacherAuthoredTestFields,
    TEACHER_AUTHORED_TEST_FIELDS,
} from '../../supabase/functions/_shared/teacherAuthoredTestFields';

describe('carryTeacherAuthoredTestFields', () => {
    it('keeps the teacher fields a rebuilt submission does not know about', () => {
        const built = { id: 'st1', answers: [], status: 'submitted' };
        const prior = {
            id: 'st1',
            answers: [{ questionId: 'q1', response: 'x' }],
            status: 'graded',
            reviewFlags: ['q1'],
            adjustmentPoints: 2,
            adjustment: { points: 2, appliedAt: '2026-01-01T00:00:00.000Z' },
            lastEditedBy: 'teacher-1',
        };

        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(built, prior);

        expect(merged.reviewFlags).toEqual(['q1']);
        expect(merged.adjustmentPoints).toBe(2);
        expect(merged.adjustment).toEqual(prior.adjustment);
        expect(merged.lastEditedBy).toBe('teacher-1');
        // Attempt-owned fields stay with the new submission, not the old one.
        expect(merged.answers).toEqual([]);
        expect(merged.status).toBe('submitted');
    });

    it('leaves a teacher field the new copy already sets alone', () => {
        const merged = carryTeacherAuthoredTestFields({ reviewFlags: ['q2'] }, { reviewFlags: ['q1'] });
        expect(merged.reviewFlags).toEqual(['q2']);
    });

    it('treats an explicit empty clear as a value the carry cannot overwrite', () => {
        // `[]` is how a clear is stored, so it must block the flag a stale copy still carries.
        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(
            { reviewFlags: [] },
            { reviewFlags: ['q1'] }
        );
        expect(merged.reviewFlags).toEqual([]);
    });

    it('cannot resurrect a flag the teacher cleared, because the cleared copy has none', () => {
        expect(
            carryTeacherAuthoredTestFields<Record<string, unknown>>({}, { reviewFlags: undefined }).reviewFlags
        ).toBeUndefined();
        expect(carryTeacherAuthoredTestFields({}, null)).toEqual({});
        expect(carryTeacherAuthoredTestFields({ id: 'st1' }, undefined)).toEqual({ id: 'st1' });
    });

    it('does not restore an adjustment the teacher reverted', () => {
        const reverted = {
            id: 'st1',
            adjustmentRevertedAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
        };
        const staleAdjusted = {
            id: 'st1',
            adjustmentPoints: 2,
            adjustment: { points: 2, appliedAt: '2026-01-01T00:00:00.000Z' },
        };

        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(reverted, staleAdjusted);

        expect(merged.adjustment).toBeUndefined();
        expect(merged.adjustmentPoints).toBeUndefined();
        expect(merged.adjustmentRevertedAt).toBe('2026-02-01T00:00:00.000Z');
    });

    it('still inherits an adjustment when the newer copy simply never knew about it', () => {
        // The documented carry case: a hand-in rewrote the row without the adjustment. A row with
        // no marker is not evidence of a revert, and treating it as one would lose the adjustment.
        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(
            { id: 'st1', updatedAt: '2026-02-01T00:00:00.000Z' },
            { id: 'st1', adjustmentPoints: 2, adjustment: { points: 2, appliedAt: '2026-01-01T00:00:00.000Z' } }
        );

        expect(merged.adjustmentPoints).toBe(2);
        expect(merged.adjustment).toBeDefined();
    });

    it('still carries an adjustment onto a rebuilt attempt with a fresh id', () => {
        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(
            { id: 'st-new', submittedAt: '2026-02-01T00:00:00.000Z' },
            { id: 'st1', adjustmentPoints: 2, adjustment: { points: 2, appliedAt: '2026-01-01T00:00:00.000Z' } }
        );

        expect(merged.adjustmentPoints).toBe(2);
        expect(merged.adjustment).toBeDefined();
    });

    it('covers exactly the fields a student hand-in must never erase', () => {
        expect([...TEACHER_AUTHORED_TEST_FIELDS]).toEqual([
            'reviewFlags',
            'adjustment',
            'adjustmentPoints',
            'adjustmentRevertedAt',
            'lastEditedBy',
        ]);
    });
});
